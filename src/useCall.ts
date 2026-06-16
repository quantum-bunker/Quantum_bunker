import { useState, useRef, useCallback, useEffect } from 'react';
import { CallConnection, CallSignal, CallConnectionState } from './transport/call-connection';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'active';

export interface UseCall {
  callState: CallState;
  remotePeerId: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  callError: string | null;
  startCall: () => void;
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  // Routed here by useRelay for every SIGNALING frame with kind === 'call'.
  handleSignal: (from: string, signal: CallSignal) => void;
}

interface UseCallOptions {
  selfId: string | null;
  // The single remote peer eligible for a call, or null unless the session is
  // exactly 1-on-1. Video conferencing is intentionally not offered in groups.
  peerId: string | null;
  sendCallSignal: (to: string, signal: Omit<CallSignal, 'kind' | 'to'>) => void;
}

const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
};

// Owns the lifecycle of a 1-on-1 call: media capture, the invite/accept ring
// protocol, and a single CallConnection. State lives in refs alongside React
// state so signal handlers (which fire from a stable WS callback) always read
// the live values rather than a stale render's closure.
export function useCall(opts: UseCallOptions): UseCall {
  const { selfId, peerId, sendCallSignal } = opts;

  const [callState, setCallState] = useState<CallState>('idle');
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [callError, setCallError] = useState<string | null>(null);

  const connRef = useRef<CallConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remotePeerRef = useRef<string | null>(null);
  const stateRef = useRef<CallState>('idle');

  const setState = useCallback((next: CallState) => {
    stateRef.current = next;
    setCallState(next);
  }, []);

  const teardown = useCallback((error?: string) => {
    connRef.current?.close();
    connRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    remotePeerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setRemotePeerId(null);
    setMicOn(true);
    setCamOn(true);
    setCallError(error ?? null);
    setState('idle');
  }, [setState]);

  const acquireMedia = useCallback(async (): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const buildConnection = useCallback((to: string, stream: MediaStream): CallConnection => {
    const conn = new CallConnection({
      selfId: selfId ?? '',
      peerId: to,
      sendSignal: (signal) => sendCallSignal(to, signal),
      onRemoteStream: (s) => setRemoteStream(s),
      onState: (s: CallConnectionState) => {
        if (s === 'connected') setState('active');
        else if (s === 'failed') teardown('Could not establish a direct media path. If you and the other person are on different networks (mobile data, different ISPs), a TURN relay server is required — see VITE_TURN_URL in the deployment docs.');
        else if (s === 'closed' && stateRef.current !== 'idle') teardown();
      },
    });
    conn.addLocalStream(stream);
    connRef.current = conn;
    return conn;
  }, [selfId, sendCallSignal, setState, teardown]);

  const startCall = useCallback(() => {
    if (!selfId || !peerId || stateRef.current !== 'idle') return;
    setCallError(null);
    acquireMedia()
      .then(() => {
        remotePeerRef.current = peerId;
        setRemotePeerId(peerId);
        setState('calling');
        sendCallSignal(peerId, { call: 'invite' });
      })
      .catch(() => teardown('Camera/microphone access denied'));
  }, [selfId, peerId, acquireMedia, sendCallSignal, setState, teardown]);

  const acceptCall = useCallback(() => {
    const to = remotePeerRef.current;
    if (!to || stateRef.current !== 'ringing') return;
    setCallError(null);
    acquireMedia()
      .then((stream) => {
        sendCallSignal(to, { call: 'accept' });
        setState('connecting');
        buildConnection(to, stream);
      })
      .catch(() => {
        sendCallSignal(to, { call: 'decline' });
        teardown('Camera/microphone access denied');
      });
  }, [acquireMedia, sendCallSignal, setState, buildConnection, teardown]);

  const declineCall = useCallback(() => {
    const to = remotePeerRef.current;
    if (to) sendCallSignal(to, { call: 'decline' });
    teardown();
  }, [sendCallSignal, teardown]);

  const endCall = useCallback(() => {
    const to = remotePeerRef.current;
    if (to) {
      // 'cancel' before the callee answers, 'end' once a call is up — same
      // teardown either way, but the remote UI distinguishes a missed call.
      sendCallSignal(to, { call: stateRef.current === 'calling' ? 'cancel' : 'end' });
    }
    teardown();
  }, [sendCallSignal, teardown]);

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  const toggleCam = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }, []);

  const handleSignal = useCallback((from: string, signal: CallSignal) => {
    const active = remotePeerRef.current;

    if (signal.call === 'invite') {
      if (stateRef.current !== 'idle') {
        sendCallSignal(from, { call: 'busy' });
        return;
      }
      remotePeerRef.current = from;
      setRemotePeerId(from);
      setCallError(null);
      setState('ringing');
      return;
    }

    if (from !== active) return;

    switch (signal.call) {
      case 'accept':
        if (stateRef.current === 'calling' && localStreamRef.current) {
          setState('connecting');
          buildConnection(from, localStreamRef.current);
        }
        break;
      case 'decline':
        teardown('Call declined');
        break;
      case 'busy':
        teardown('Peer is busy');
        break;
      case 'cancel':
      case 'end':
        teardown();
        break;
      case 'sdp':
      case 'ice':
        // A late offer can race ahead of our own 'accept' bookkeeping; if we are
        // the caller and media is ready, materialize the connection now.
        if (!connRef.current && stateRef.current === 'calling' && localStreamRef.current) {
          setState('connecting');
          buildConnection(from, localStreamRef.current);
        }
        void connRef.current?.onSignal(signal);
        break;
    }
  }, [sendCallSignal, setState, buildConnection, teardown]);

  // End any in-flight call the moment the eligible peer changes or leaves so the
  // UI never shows a call to someone who is gone.
  useEffect(() => {
    const active = remotePeerRef.current;
    if (active && active !== peerId && stateRef.current !== 'idle') teardown();
  }, [peerId, teardown]);

  useEffect(() => () => teardown(), [teardown]);

  return {
    callState,
    remotePeerId,
    localStream,
    remoteStream,
    micOn,
    camOn,
    callError,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMic,
    toggleCam,
    handleSignal,
  };
}
