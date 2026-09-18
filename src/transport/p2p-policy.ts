// Pure routing + signaling policy for the direct (WebRTC) media path.
//
// Kept free of React and the RTCPeerConnection API so the signaling state
// machine can be unit-tested in isolation (see tests/unit/use-p2p.test.ts).

// Media at or above this size is routed exclusively over the direct P2P data
// channel and is NEVER relayed through the server — its bytes must never reach
// the blind relay. Small text/receipts stay on the existing WS relay path.
//
// Mirrors the constants discipline in src/backend/core/constants.ts: the
// frontend cannot import backend modules across the hexagonal boundary, so the
// threshold lives here as a named constant rather than a magic number. There is
// no backend counterpart — routing is a purely client-side decision — so this
// file is the source of truth.
//
// Sized at 1 MB, not 64 KB: Opus voice runs ~3 KB/s, so a 64 KB ceiling forced
// anything longer than roughly twenty seconds onto the direct path. Media that
// small is cheap to relay and must keep working even when no direct link exists.
export const P2P_FILE_THRESHOLD_BYTES = 1024 * 1024;

// Backpressure ceiling for streamed file chunks. The sender pauses yielding new
// chunks while a peer's data-channel send buffer sits above this, so a fast
// producer can never balloon the SCTP buffer to gigabytes for a slow link.
// Named here (not a magic number) per the same constants discipline.
// How long an inbound stream may go without a frame before it is abandoned.
// Its receiver holds every chunk decrypted so far, so a sender that vanishes
// mid-transfer would otherwise pin that memory for the whole session.
export const STREAM_RECEIVER_TTL_MS = 60_000;

// How long an unanswered ping's send timestamp is kept. The round trip is
// meaningless long before this; the entry only needs to outlive a normal PONG.
export const PING_RECORD_TTL_MS = 60_000;

// Longest a sender waits for a peer's data channel to drain below the high
// water mark before giving up. Without a bound, a channel that stops draining
// but never closes leaves the transfer spinning and the UI stuck mid-progress.
export const P2P_STREAM_DRAIN_TIMEOUT_MS = 30_000;

export const P2P_STREAM_HIGH_WATER_BYTES = 1 * 1024 * 1024;

// Above this many peers, even a sub-threshold file is forced onto the direct
// path. encryptForAll produces one ciphertext per recipient, so a relayed 1 MB
// file in a ten-peer vault becomes a double-digit-megabyte single payload — well
// within MAX_PAYLOAD_BYTES but far too heavy for the 512 MB / 0.1 CPU relay.
// Large groups are also where the direct path pays off most.
export const RELAY_FANOUT_MAX_PEERS = 3;

// True when a file must take the direct path because of how many peers would
// receive a relayed copy, independent of its size.
export function exceedsRelayFanout(peerCount: number): boolean {
  return peerCount > RELAY_FANOUT_MAX_PEERS;
}

// True when `byteSize` must take the direct path. Text messages and receipts
// fall well under the threshold and keep relaying; files/images/audio/video
// exceed it and are forced peer-to-peer.
export function requiresDirectPath(byteSize: number): boolean {
  return Number.isFinite(byteSize) && byteSize >= P2P_FILE_THRESHOLD_BYTES;
}

// Lifecycle of a single peer's direct connection, surfaced to the UI.
//   idle       — no connection attempt yet
//   connecting — offer/answer/ICE in flight
//   connected  — data channel open, ready for direct media
//   failed     — ICE failed or timed out; media must surface an error, not relay
//   closed     — data channel closed after having been open
//   dropped    — was connected, then the link died mid-session
export type P2PPeerState = 'idle' | 'connecting' | 'connected' | 'failed' | 'dropped' | 'closed';

// Events that drive the state machine. They are derived from the underlying
// RTCPeerConnection lifecycle, but the transition rules live here so they can
// be reasoned about and tested without a browser.
export type P2PSignalEvent =
  | 'ensure'    // we began (or re-began) establishing a connection
  | 'offer'     // an SDP offer was sent or received
  | 'answer'    // an SDP answer was exchanged
  | 'candidate' // an ICE candidate was exchanged
  | 'open'      // the data channel opened
  | 'fail'      // the connection failed or timed out
  | 'drop'      // an established connection died mid-session
  | 'close';    // the data channel closed

// Single source of truth for valid transitions. Notably: once `connected`, a
// stray `fail` does not downgrade the link (matches WebRTCMesh.markFailed, which
// ignores failures on an already-connected peer), and terminal states can be
// revived by a fresh `ensure` (renegotiation when a peer re-joins).
export function p2pReducer(state: P2PPeerState, event: P2PSignalEvent): P2PPeerState {
  switch (event) {
    case 'ensure':
      return state === 'connected' ? 'connected' : 'connecting';
    case 'offer':
    case 'answer':
    case 'candidate':
      return state === 'connected' || state === 'failed' ? state : 'connecting';
    case 'open':
      return 'connected';
    case 'fail':
      return state === 'connected' ? 'connected' : 'failed';
    // A link that dies after it was up is NOT a negotiation failure: keeping it
    // reported as 'connected' (as `fail` must, to avoid spurious downgrades from
    // transient ICE blips) would hide a dead channel from the UI forever.
    case 'drop':
      return state === 'connected' ? 'dropped' : state;
    case 'close':
      return state === 'connected' ? 'closed' : state;
    default:
      return assertNever(event);
  }
}

// Translates the WebRTCMesh raw lifecycle state into a signaling event so the
// hook can reconcile its state machine from mesh notifications. Kept here (not
// in the hook) so the full state-derivation path is covered by unit tests.
export function meshStateToEvent(
  meshState: 'connecting' | 'connected' | 'failed' | 'dropped' | 'closed',
): P2PSignalEvent {
  switch (meshState) {
    case 'connecting':
      return 'ensure';
    case 'connected':
      return 'open';
    case 'failed':
      return 'fail';
    case 'dropped':
      return 'drop';
    case 'closed':
      return 'close';
    default:
      return assertNever(meshState);
  }
}

// Why a direct link could not be established. Every distinct failure used to
// collapse into a single boolean, so the UI could only ever print one generic
// hint that was unrelated to what actually happened.
//
//   no-stun                 — address reflection is switched off; LAN only
//   no-reflexive-candidate  — STUN configured but no srflx candidate came back
//                             (UDP blocked, or the STUN server was unreachable)
//   symmetric-nat           — we learned a public address but no pair worked
//   timeout                 — negotiation never completed in time
//   signaling-error         — an offer/answer/candidate could not be applied
//   peer-left               — the peer went away mid-negotiation
export type P2PFailureReason =
  | 'no-stun'
  | 'no-reflexive-candidate'
  | 'symmetric-nat'
  | 'timeout'
  | 'signaling-error'
  | 'peer-left';

// Maps what ICE actually observed onto a reason. `gatheredReflexive` is whether
// any srflx candidate was ever seen; `stunConfigured` is whether reflection was
// possible at all. The remaining reasons are not inferred from candidates —
// 'timeout' and 'signaling-error' are reported directly by the code that
// observes them, and 'peer-left' by the departure path.
export function classifyIceFailure(
  stunConfigured: boolean,
  gatheredReflexive: boolean,
): P2PFailureReason {
  if (!stunConfigured) return 'no-stun';
  if (!gatheredReflexive) return 'no-reflexive-candidate';
  return 'symmetric-nat';
}

// User-facing explanation. Kept beside the reasons (not in a component) so the
// wording is covered by unit tests and shared by every surface that reports a
// failure: the composer banner, the header chip, and the call error.
export function describeP2PFailure(reason: P2PFailureReason): string {
  switch (reason) {
    case 'no-stun':
      return 'Direct connection is switched off, so this only works between devices on the same network. Turn on public STUN in the connection settings to reach peers elsewhere.';
    case 'no-reflexive-candidate':
      return 'Your network did not return a public address. It is likely blocking UDP — a corporate, campus, or guest network usually is. Try a different network or a phone hotspot.';
    case 'symmetric-nat':
      return 'Both public addresses were found, but no direct route between them worked. This is typical of mobile data and strict home routers — switching to WiFi usually fixes it.';
    case 'timeout':
      return 'The direct connection took too long to set up. The relay may have been waking from idle — try again in a moment.';
    case 'signaling-error':
      return 'The direct connection could not be negotiated. Reloading the page and rejoining usually clears it.';
    case 'peer-left':
      return 'The other peer left before the direct connection finished.';
    default:
      return assertNever(reason);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled P2P signal value: ${String(x)}`);
}
