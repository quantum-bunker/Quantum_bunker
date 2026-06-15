import { useCallback, useRef, useState } from 'react';
import { WebRTCMesh, RtcFrame } from './transport/webrtc-mesh';
import { getP2PIceConfig } from './transport/ice-config';
import {
  P2PPeerState,
  p2pReducer,
  meshStateToEvent,
} from './transport/p2p-policy';

interface UseP2POptions {
  selfId: string | null;
  // Relays an RTC signaling frame (SDP offer/answer or ICE candidate) to a peer.
  // The caller wraps it in a SIGNALING envelope through the WS relay — the
  // server forwards it opaquely and never inspects it.
  sendSignal: (frame: RtcFrame) => void;
  // Invoked with the raw string received over a peer's data channel.
  onData: (fromPeerId: string, data: string) => void;
  // Invoked with raw binary frames (streamed file chunks) from a peer.
  onBinary?: (fromPeerId: string, data: ArrayBuffer) => void;
}

export interface UseP2P {
  ensurePeer: (peerId: string) => void;
  removePeer: (peerId: string) => void;
  reset: () => void;
  handleSignal: (fromPeerId: string, frame: RtcFrame) => void;
  // Sends raw data directly to a peer over its data channel. Returns false if no
  // open channel exists — the caller MUST NOT relay as a fallback for media.
  sendDirect: (peerId: string, data: string) => boolean;
  // Sends a raw binary frame (streamed file chunk) directly to a peer.
  sendBinaryDirect: (peerId: string, data: ArrayBuffer) => boolean;
  // Current send-buffer depth for a peer's channel, for streaming backpressure.
  bufferedAmount: (peerId: string) => number;
  isConnected: (peerId: string) => boolean;
  // True only when every listed peer has an open direct channel.
  allConnected: (others: string[]) => boolean;
  connectedPeers: string[];
  peerStates: Record<string, P2PPeerState>;
  // True when at least one peer's direct connection has hard-failed (ICE could
  // not punch a path). Surfaced to the UI so media never silently relays.
  directFailed: boolean;
}

// Owns the WebRTC mesh and the per-peer signaling state machine. This is the
// single client-side owner of RTCPeerConnection/RTCDataChannel state; useRelay
// drives it from peer_update and SIGNALING events.
//
// Payload security: bytes sent over a data channel are ALSO double-ratchet
// encrypted by PeerChannels before reaching this hook (the same ciphertext used
// on the relay). So media gets defense in depth — WebRTC's mandatory DTLS for
// transport secrecy plus the application-layer ratchet for true E2E. We rely on
// the ratchet (not DTLS alone) for the E2E guarantee, because DTLS only secures
// the hop and a TURN/relayed path could otherwise be a trust boundary; the
// existing E2E guarantee is therefore never weakened.
export function useP2P(opts: UseP2POptions): UseP2P {
  const { selfId, sendSignal, onData, onBinary } = opts;

  const meshRef = useRef<WebRTCMesh | null>(null);
  const [peerStates, setPeerStates] = useState<Record<string, P2PPeerState>>({});
  const peerStatesRef = useRef<Record<string, P2PPeerState>>({});

  const apply = useCallback((next: Record<string, P2PPeerState>) => {
    peerStatesRef.current = next;
    setPeerStates(next);
  }, []);

  // Reconciles every tracked peer's signaling state from the mesh's raw state,
  // feeding transitions through the reducer so invalid downgrades are ignored.
  const sync = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const prev = peerStatesRef.current;
    const next: Record<string, P2PPeerState> = {};
    let changed = false;
    for (const id of Object.keys(prev)) {
      const raw = mesh.stateOf(id);
      const current = prev[id];
      const resolved = raw ? p2pReducer(current, meshStateToEvent(raw)) : current;
      next[id] = resolved;
      if (resolved !== current) changed = true;
    }
    if (changed) apply(next);
  }, [apply]);

  const getMesh = useCallback((): WebRTCMesh => {
    if (!meshRef.current) {
      meshRef.current = new WebRTCMesh({
        selfId: selfId ?? '',
        iceConfig: getP2PIceConfig(),
        sendRtc: (_to, frame) => sendSignal(frame),
        onMessage: onData,
        onBinary,
        onStateChange: sync,
      });
    }
    return meshRef.current;
  }, [selfId, sendSignal, onData, onBinary, sync]);

  const ensurePeer = useCallback((peerId: string) => {
    if (!selfId || peerId === selfId) return;
    const mesh = getMesh();
    const prev = peerStatesRef.current;
    const current = prev[peerId] ?? 'idle';
    const resolved = p2pReducer(current, 'ensure');
    if (resolved !== current || !(peerId in prev)) {
      apply({ ...prev, [peerId]: resolved });
    }
    mesh.ensurePeer(peerId);
  }, [selfId, getMesh, apply]);

  const removePeer = useCallback((peerId: string) => {
    meshRef.current?.removePeer(peerId);
    const prev = peerStatesRef.current;
    if (peerId in prev) {
      const { [peerId]: _removed, ...rest } = prev;
      apply(rest);
    }
  }, [apply]);

  const reset = useCallback(() => {
    meshRef.current?.reset();
    meshRef.current = null;
    apply({});
  }, [apply]);

  const handleSignal = useCallback((fromPeerId: string, frame: RtcFrame) => {
    void getMesh().onSignal(fromPeerId, frame);
    sync();
  }, [getMesh, sync]);

  const sendDirect = useCallback(
    (peerId: string, data: string): boolean => meshRef.current?.send(peerId, data) ?? false,
    [],
  );

  const sendBinaryDirect = useCallback(
    (peerId: string, data: ArrayBuffer): boolean => meshRef.current?.sendBinary(peerId, data) ?? false,
    [],
  );

  const bufferedAmount = useCallback(
    (peerId: string): number => meshRef.current?.bufferedAmount(peerId) ?? Infinity,
    [],
  );

  const isConnected = useCallback(
    (peerId: string): boolean => meshRef.current?.isConnected(peerId) ?? false,
    [],
  );

  const allConnected = useCallback(
    (others: string[]): boolean =>
      others.length > 0 && others.every(id => meshRef.current?.isConnected(id) ?? false),
    [],
  );

  const connectedPeers = Object.entries(peerStates)
    .filter(([, s]) => s === 'connected')
    .map(([id]) => id);

  const directFailed = Object.values(peerStates).some(s => s === 'failed');

  return {
    ensurePeer,
    removePeer,
    reset,
    handleSignal,
    sendDirect,
    sendBinaryDirect,
    bufferedAmount,
    isConnected,
    allConnected,
    connectedPeers,
    peerStates,
    directFailed,
  };
}
