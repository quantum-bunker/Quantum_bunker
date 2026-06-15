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
export const P2P_FILE_THRESHOLD_BYTES = 64 * 1024;

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
export type P2PPeerState = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed';

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
  meshState: 'connecting' | 'connected' | 'failed' | 'closed',
): P2PSignalEvent {
  switch (meshState) {
    case 'connecting':
      return 'ensure';
    case 'connected':
      return 'open';
    case 'failed':
      return 'fail';
    case 'closed':
      return 'close';
    default:
      return assertNever(meshState);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled P2P signal value: ${String(x)}`);
}
