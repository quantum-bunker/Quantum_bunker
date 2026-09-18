import { getIceConfig, hasStunConfigured } from './ice-config';
import { classifyIceFailure, P2PFailureReason } from './p2p-policy';

// `candidate` carries one RTCIceCandidateInit; `candidates` carries a JSON array
// of them. Batching exists because each candidate used to cost its own relay
// envelope, and a trickle burst blew through the server's per-peer rate limit —
// taking Noise handshake frames down with it. The single-candidate shape is
// still accepted on receive so a peer on the previous version still connects.
export interface RtcFrame {
  kind: 'rtc';
  to: string;
  rtc: 'offer' | 'answer' | 'candidate' | 'candidates';
  data: string;
}

type PeerState = 'connecting' | 'connected' | 'failed' | 'dropped' | 'closed';

interface MeshPeer {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  state: PeerState;
  pendingCandidates: RTCIceCandidateInit[];
  remoteReady: boolean;
  // Outbound trickle candidates awaiting their batch flush.
  outboundCandidates: RTCIceCandidateInit[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  // Whether any server-reflexive candidate was ever gathered. This is what
  // separates "the network gave us no public address" from "we had one and no
  // route worked", which are different problems with different user advice.
  gatheredReflexive: boolean;
  // One ICE restart is attempted before a peer is declared failed.
  restarted: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  reason: P2PFailureReason | null;
}

interface WebRTCMeshOptions {
  selfId: string;
  sendRtc: (toPeerId: string, frame: RtcFrame) => void;
  onMessage: (fromPeerId: string, data: string) => void;
  // Raw binary frames (streamed file chunks). Separate from onMessage so the
  // string control path and the ArrayBuffer media path never collide.
  onBinary?: (fromPeerId: string, data: ArrayBuffer) => void;
  onStateChange: () => void;
  // ICE config for every peer connection. Defaults to getIceConfig() (empty,
  // host-candidates-only) for backward compatibility; the direct media path
  // injects getP2PIceConfig() so peers behind separate NATs can connect.
  iceConfig?: RTCConfiguration;
}

// The lexicographically-smaller peer creates the offer. This matches the Noise
// initiator rule so both layers agree on roles without negotiation.
export function isOfferer(selfId: string, peerId: string): boolean {
  return selfId < peerId;
}

// A message goes direct only when every other peer has an open data channel;
// otherwise the whole message falls back to the WS relay (avoids mixed-mode
// duplicate delivery).
export function shouldUseP2P(others: string[], isConnected: (id: string) => boolean): boolean {
  return others.length > 0 && others.every(isConnected);
}

// Trickle ICE rides the relay, which on a free-tier host may itself be waking
// from a cold start, and candidates now wait out a batch window before they are
// sent. 8s was not enough headroom for any of that and fired spurious failures.
const CONNECT_TIMEOUT_MS = 20000;

// Outbound ICE candidates are buffered for this long and sent as one frame.
// Long enough to collapse a trickle burst into a handful of envelopes, short
// enough to be invisible in connection setup.
const CANDIDATE_BATCH_MS = 60;

export class WebRTCMesh {
  private readonly selfId: string;
  private readonly opts: WebRTCMeshOptions;
  private readonly peers = new Map<string, MeshPeer>();
  // Whether the resolved ICE config can reflect a public address. Read once a
  // peer connection is built, since every peer shares the same config.
  private stunConfigured = false;

  constructor(opts: WebRTCMeshOptions) {
    this.selfId = opts.selfId;
    this.opts = opts;
  }

  ensurePeer(peerId: string): void {
    if (peerId === this.selfId || this.peers.has(peerId)) return;

    const config = this.opts.iceConfig ?? getIceConfig();
    const pc = new RTCPeerConnection(config);
    const peer: MeshPeer = {
      pc, dc: null, state: 'connecting', pendingCandidates: [], remoteReady: false,
      outboundCandidates: [], flushTimer: null, gatheredReflexive: false,
      restarted: false, timer: null, reason: null,
    };
    this.peers.set(peerId, peer);
    this.stunConfigured = hasStunConfigured(config);

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      if (e.candidate.type === 'srflx') peer.gatheredReflexive = true;
      this.queueCandidate(peerId, peer, e.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.onIceTrouble(peerId);
      }
    };

    if (isOfferer(this.selfId, peerId)) {
      const dc = pc.createDataChannel('qb');
      this.wireDataChannel(peerId, peer, dc);
      void this.makeOffer(peerId, peer);
    } else {
      pc.ondatachannel = (e) => this.wireDataChannel(peerId, peer, e.channel);
    }

    this.armTimeout(peerId, peer);
  }

  // A stalled connection gets exactly one ICE restart before it is declared
  // failed. Restarting re-gathers candidates against the current network, which
  // recovers the common case of a peer that changed networks (WiFi <-> mobile)
  // or whose first gather raced a cold-starting relay.
  private onIceTrouble(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer.state === 'connected') {
      this.markDropped(peerId);
      return;
    }
    if (peer.restarted) {
      this.markFailed(peerId, this.inferReason(peer));
      return;
    }
    peer.restarted = true;
    try {
      peer.pc.restartIce();
    } catch {
      this.markFailed(peerId, 'signaling-error');
      return;
    }
    if (isOfferer(this.selfId, peerId)) void this.makeOffer(peerId, peer);
    this.armTimeout(peerId, peer);
  }

  private armTimeout(peerId: string, peer: MeshPeer): void {
    if (peer.timer !== null) clearTimeout(peer.timer);
    peer.timer = setTimeout(() => {
      peer.timer = null;
      const current = this.peers.get(peerId);
      if (current?.state !== 'connecting') return;
      // A first timeout is worth one restart; a second means give up.
      if (!current.restarted) {
        this.onIceTrouble(peerId);
        return;
      }
      this.markFailed(peerId, current.remoteReady ? this.inferReason(current) : 'timeout');
    }, CONNECT_TIMEOUT_MS);
  }

  private inferReason(peer: MeshPeer): P2PFailureReason {
    return classifyIceFailure(this.stunConfigured, peer.gatheredReflexive);
  }

  // Buffers a trickle candidate and flushes the batch as one envelope. Without
  // this, a single negotiation emits a dozen-plus envelopes in a few hundred
  // milliseconds and trips the relay's per-peer rate limit.
  private queueCandidate(peerId: string, peer: MeshPeer, candidate: RTCIceCandidateInit): void {
    peer.outboundCandidates.push(candidate);
    if (peer.flushTimer !== null) return;
    peer.flushTimer = setTimeout(() => {
      peer.flushTimer = null;
      this.flushOutboundCandidates(peerId, peer);
    }, CANDIDATE_BATCH_MS);
  }

  private flushOutboundCandidates(peerId: string, peer: MeshPeer): void {
    const batch = peer.outboundCandidates.splice(0);
    if (batch.length === 0) return;
    this.opts.sendRtc(peerId, { kind: 'rtc', to: peerId, rtc: 'candidates', data: JSON.stringify(batch) });
  }

  private async makeOffer(peerId: string, peer: MeshPeer): Promise<void> {
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.opts.sendRtc(peerId, { kind: 'rtc', to: peerId, rtc: 'offer', data: JSON.stringify(offer) });
    } catch {
      this.markFailed(peerId, 'signaling-error');
    }
  }

  async onSignal(fromPeerId: string, frame: RtcFrame): Promise<void> {
    if (frame.to !== this.selfId) return;
    this.ensurePeer(fromPeerId);
    const peer = this.peers.get(fromPeerId);
    if (!peer) return;

    try {
      if (frame.rtc === 'offer') {
        await peer.pc.setRemoteDescription(JSON.parse(frame.data));
        peer.remoteReady = true;
        await this.flushCandidates(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.opts.sendRtc(fromPeerId, { kind: 'rtc', to: fromPeerId, rtc: 'answer', data: JSON.stringify(answer) });
      } else if (frame.rtc === 'answer') {
        await peer.pc.setRemoteDescription(JSON.parse(frame.data));
        peer.remoteReady = true;
        await this.flushCandidates(peer);
      } else if (frame.rtc === 'candidate' || frame.rtc === 'candidates') {
        // 'candidate' is the pre-batching shape, still accepted so a peer on the
        // previous version can complete a negotiation with this one.
        const parsed = JSON.parse(frame.data) as RTCIceCandidateInit | RTCIceCandidateInit[];
        const batch = Array.isArray(parsed) ? parsed : [parsed];
        for (const candidate of batch) {
          if (peer.remoteReady) await peer.pc.addIceCandidate(candidate);
          else peer.pendingCandidates.push(candidate);
        }
      }
    } catch {
      this.markFailed(fromPeerId, 'signaling-error');
    }
  }

  private async flushCandidates(peer: MeshPeer): Promise<void> {
    const queued = peer.pendingCandidates.splice(0);
    for (const c of queued) {
      try {
        await peer.pc.addIceCandidate(c);
      } catch {
        // A single bad candidate is non-fatal; ICE retries with others.
      }
    }
  }

  private wireDataChannel(peerId: string, peer: MeshPeer, dc: RTCDataChannel): void {
    peer.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      peer.state = 'connected';
      peer.reason = null;
      if (peer.timer !== null) {
        clearTimeout(peer.timer);
        peer.timer = null;
      }
      this.opts.onStateChange();
    };
    dc.onclose = () => {
      if (peer.state !== 'failed') peer.state = 'closed';
      this.opts.onStateChange();
    };
    // Previously unwired, so a channel error was invisible: the peer stayed
    // reported as connected while every send silently went nowhere.
    dc.onerror = () => {
      if (peer.state === 'connected') this.markDropped(peerId);
      else this.markFailed(peerId, this.inferReason(peer));
    };
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') this.opts.onMessage(peerId, e.data);
      else if (e.data instanceof ArrayBuffer) this.opts.onBinary?.(peerId, e.data);
    };
  }

  private markFailed(peerId: string, reason: P2PFailureReason): void {
    const peer = this.peers.get(peerId);
    if (!peer || peer.state === 'connected') return;
    peer.state = 'failed';
    peer.reason = reason;
    this.opts.onStateChange();
  }

  // A link that was up and then died. Distinct from 'failed' because markFailed
  // must ignore an already-connected peer (transient ICE blips would otherwise
  // downgrade a healthy link), which meant a mid-session death never surfaced
  // anywhere in the UI.
  private markDropped(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer || peer.state !== 'connected') return;
    peer.state = 'dropped';
    peer.reason = 'peer-left';
    this.opts.onStateChange();
  }

  send(peerId: string, data: string): boolean {
    const peer = this.peers.get(peerId);
    if (!peer || peer.state !== 'connected' || !peer.dc || peer.dc.readyState !== 'open') return false;
    try {
      peer.dc.send(data);
      return true;
    } catch {
      return false;
    }
  }

  // Buffered amount for a peer's channel, used by the streamer to apply
  // backpressure (pause yielding chunks until the SCTP buffer drains).
  bufferedAmount(peerId: string): number {
    return this.peers.get(peerId)?.dc?.bufferedAmount ?? Infinity;
  }

  sendBinary(peerId: string, data: ArrayBuffer): boolean {
    const peer = this.peers.get(peerId);
    if (!peer || peer.state !== 'connected' || !peer.dc || peer.dc.readyState !== 'open') return false;
    try {
      peer.dc.send(data);
      return true;
    } catch {
      return false;
    }
  }

  isConnected(peerId: string): boolean {
    return this.peers.get(peerId)?.state === 'connected';
  }

  // Raw lifecycle state for a peer, or undefined if no connection is tracked.
  // useP2P maps this onto its signaling state machine.
  stateOf(peerId: string): PeerState | undefined {
    return this.peers.get(peerId)?.state;
  }

  // Why a peer's direct link failed, or undefined while it is healthy. Threaded
  // to the UI so a failure names its cause instead of showing a generic banner.
  reasonOf(peerId: string): P2PFailureReason | undefined {
    return this.peers.get(peerId)?.reason ?? undefined;
  }

  connectedPeers(): string[] {
    return [...this.peers.entries()].filter(([, p]) => p.state === 'connected').map(([id]) => id);
  }

  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer.timer !== null) clearTimeout(peer.timer);
    if (peer.flushTimer !== null) clearTimeout(peer.flushTimer);
    try {
      peer.dc?.close();
      peer.pc.close();
    } catch {
      // Already torn down.
    }
    this.peers.delete(peerId);
  }

  reset(): void {
    for (const id of [...this.peers.keys()]) this.removePeer(id);
  }
}
