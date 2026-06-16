import { getIceConfig } from './ice-config';

export interface RtcFrame {
  kind: 'rtc';
  to: string;
  rtc: 'offer' | 'answer' | 'candidate';
  data: string;
}

type PeerState = 'connecting' | 'connected' | 'failed' | 'closed';

interface MeshPeer {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  state: PeerState;
  pendingCandidates: RTCIceCandidateInit[];
  remoteReady: boolean;
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

const CONNECT_TIMEOUT_MS = 8000;

export class WebRTCMesh {
  private readonly selfId: string;
  private readonly opts: WebRTCMeshOptions;
  private readonly peers = new Map<string, MeshPeer>();

  constructor(opts: WebRTCMeshOptions) {
    this.selfId = opts.selfId;
    this.opts = opts;
  }

  ensurePeer(peerId: string): void {
    if (peerId === this.selfId || this.peers.has(peerId)) return;

    const pc = new RTCPeerConnection(this.opts.iceConfig ?? getIceConfig());
    const peer: MeshPeer = { pc, dc: null, state: 'connecting', pendingCandidates: [], remoteReady: false };
    this.peers.set(peerId, peer);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.opts.sendRtc(peerId, { kind: 'rtc', to: peerId, rtc: 'candidate', data: JSON.stringify(e.candidate.toJSON()) });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.markFailed(peerId);
      }
    };

    if (isOfferer(this.selfId, peerId)) {
      const dc = pc.createDataChannel('qb');
      this.wireDataChannel(peerId, peer, dc);
      void this.makeOffer(peerId, peer);
    } else {
      pc.ondatachannel = (e) => this.wireDataChannel(peerId, peer, e.channel);
    }

    setTimeout(() => {
      if (this.peers.get(peerId)?.state === 'connecting') this.markFailed(peerId);
    }, CONNECT_TIMEOUT_MS);
  }

  private async makeOffer(peerId: string, peer: MeshPeer): Promise<void> {
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.opts.sendRtc(peerId, { kind: 'rtc', to: peerId, rtc: 'offer', data: JSON.stringify(offer) });
    } catch {
      this.markFailed(peerId);
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
      } else if (frame.rtc === 'candidate') {
        const candidate = JSON.parse(frame.data) as RTCIceCandidateInit;
        if (peer.remoteReady) await peer.pc.addIceCandidate(candidate);
        else peer.pendingCandidates.push(candidate);
      }
    } catch {
      this.markFailed(fromPeerId);
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
      this.opts.onStateChange();
    };
    dc.onclose = () => {
      if (peer.state !== 'failed') peer.state = 'closed';
      this.opts.onStateChange();
    };
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') this.opts.onMessage(peerId, e.data);
      else if (e.data instanceof ArrayBuffer) this.opts.onBinary?.(peerId, e.data);
    };
  }

  private markFailed(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer || peer.state === 'connected') return;
    peer.state = 'failed';
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

  connectedPeers(): string[] {
    return [...this.peers.entries()].filter(([, p]) => p.state === 'connected').map(([id]) => id);
  }

  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
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
