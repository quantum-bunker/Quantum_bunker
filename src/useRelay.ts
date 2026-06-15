import { useState, useEffect, useCallback, useRef } from 'react';
import { RelayEnvelope, EnvelopeType } from './shared/contracts/v1/envelope';
import { PeerChannels, NoiseFrame } from './crypto/peer-channels';
import { KeyPair } from './crypto/noise-xx';
import { RtcFrame, shouldUseP2P } from './transport/webrtc-mesh';
import { useP2P } from './useP2P';
import { requiresDirectPath, P2P_STREAM_HIGH_WATER_BYTES } from './transport/p2p-policy';
import { randomId } from './random';
import { buildJoinCredentials } from './membership-store';
import {
  FileAttachment,
  encodeFileAttachment,
  decodeFileAttachment,
  isWithinFileLimit,
  isWithinP2PFileLimit,
} from './file-transfer';
import {
  createFileStream,
  blobSource,
  decodeFileStreamInit,
  frameFileId,
  FileStreamReceiver,
} from './crypto/file-stream';
import { encryptFileData, FileCipher } from './file-crypto';
import { toBase64 } from './crypto/noise-primitives';
import { MessageOutbox, WILDCARD_RECIPIENT } from './outbox-store';
import { PeerMailbox } from './peer-mailbox';

export interface SendFileOptions {
  password?: string;
  algo?: FileCipher;
}

export interface LocalMessage extends RelayEnvelope {
  status: 'sending' | 'sent' | 'delivered' | 'seen';
  deliveredTo: string[];
  seenBy: string[];
  edited?: boolean;
  deleted?: boolean;
  file?: FileAttachment;
  locked?: boolean; // sender-side flag: this file was sent password-protected
  progress?: number; // 0..1 while a streamed file is in flight
  fileUrl?: string; // object URL for a streamed file (sender echo or completed receive)
  fileError?: string; // set when a streamed transfer is rejected or interrupted
}

export function useRelay(sessionId: string | null, peerId: string | null, identity?: KeyPair | null) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [activePeers, setActivePeers] = useState<string[]>([]);
  const [joinRequests, setJoinRequests] = useState<{peerId: string; message: string}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isGroup, setIsGroup] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [ioLoad, setIoLoad] = useState<number>(0);
  const [peerAliases, setPeerAliases] = useState<Record<string, string>>({});
  const [typingAt, setTypingAt] = useState<Record<string, number>>({});
  const [secured, setSecured] = useState(false);
  const [safetyNumbers, setSafetyNumbers] = useState<Record<string, string>>({});
  const [fingerprints, setFingerprints] = useState<Record<string, string>>({});
  const [ownFingerprint, setOwnFingerprint] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const channelsRef = useRef<PeerChannels | null>(null);
  // Latest resolved static identity (null = burner). Read at connect time so an
  // identity unlocked before joining is used without re-triggering connect.
  const identityRef = useRef<KeyPair | null>(identity ?? null);
  identityRef.current = identity ?? null;
  const outboxRef = useRef<MessageOutbox | null>(null);
  const flushingRef = useRef<boolean>(false);
  const mailboxRef = useRef<PeerMailbox>(new PeerMailbox());
  const handleEnvelopeRef = useRef<((env: RelayEnvelope) => void) | null>(null);
  const handleBinaryRef = useRef<((fromPeerId: string, data: ArrayBuffer) => void) | null>(null);
  const streamRecvRef = useRef<Map<string, { receiver: FileStreamReceiver; from: string; nonce: string; sessionId: string }>>(new Map());
  const activePeersRef = useRef<string[]>([]);
  const readSentRef = useRef<Set<string>>(new Set());
  const pingTimestampRef = useRef<Map<string, number>>(new Map());
  const bytesInWindowRef = useRef<number>(0);
  const typingStopRef = useRef<number | null>(null);
  const typingSentAtRef = useRef<number>(0);

  // Disappear messages after 5 mins
  useEffect(() => {
    const interval = setInterval(() => {
      setMessages(prev => prev.filter(m => Date.now() - m.timestamp < 5 * 60 * 1000));
    }, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);

  // IO load: reset byte window every second, express as % of 1MB reference
  // (1_000_000 matches MAX_PAYLOAD_BYTES in src/backend/core/constants.ts)
  useEffect(() => {
    const interval = setInterval(() => {
      const bytes = bytesInWindowRef.current;
      bytesInWindowRef.current = 0;
      setIoLoad(Math.min((bytes / 1_000_000) * 100, 100));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const sendRaw = useCallback((envelope: RelayEnvelope) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(envelope);
      socketRef.current.send(data);
      bytesInWindowRef.current += data.length;
    }
  }, []);

  const sendSignal = useCallback((obj: Record<string, unknown>) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !sessionId || !peerId) return;
    sendRaw({
      sessionId,
      from: peerId,
      type: EnvelopeType.SIGNALING,
      timestamp: Date.now(),
      nonce: randomId(),
      payload: JSON.stringify(obj),
    });
  }, [sessionId, peerId, sendRaw]);

  const p2p = useP2P({
    selfId: peerId,
    sendSignal: useCallback((frame: RtcFrame) => sendSignal({ ...frame }), [sendSignal]),
    onData: useCallback((_from: string, data: string) => {
      try {
        handleEnvelopeRef.current?.(JSON.parse(data) as RelayEnvelope);
      } catch {
        // Ignore malformed data-channel frames.
      }
    }, []),
    onBinary: useCallback((from: string, data: ArrayBuffer) => {
      handleBinaryRef.current?.(from, data);
    }, []),
  });

  // useP2P returns a fresh object every render; its methods are stable
  // useCallbacks. Reach the mesh through a ref so the WS connection lifecycle
  // and dispatch callbacks don't churn (and tear down the socket) on every
  // re-render — they only ever call the latest p2p methods.
  const p2pRef = useRef(p2p);
  p2pRef.current = p2p;

  // Routes an envelope over the direct mesh when every peer has an open data
  // channel; otherwise over the WS relay. All-or-nothing per message keeps the
  // server out of the loop entirely once P2P is established, without risking
  // duplicate delivery in mixed mode. Used for text/receipts/edits where relay
  // is an acceptable fallback — large media uses dispatchDirect instead.
  const dispatch = useCallback((env: RelayEnvelope) => {
    const others = activePeersRef.current.filter(id => id !== peerId);
    if (shouldUseP2P(others, id => p2pRef.current.isConnected(id))) {
      const data = JSON.stringify(env);
      for (const id of others) p2pRef.current.sendDirect(id, data);
    } else {
      sendRaw(env);
    }
  }, [peerId, sendRaw]);

  // Relays a non-interactive frame (receipt/edit/delete) after a small random
  // delay to blunt timing correlation against the message it refers to. Kept
  // tiny (mirrors PADDING.TIMING_JITTER_MAX_MS in constants.ts) so it is not
  // felt in the UI; interactive sends never go through here.
  const dispatchJittered = useCallback((env: RelayEnvelope) => {
    const delay = Math.random() * 120;
    setTimeout(() => dispatch(env), delay);
  }, [dispatch]);

  // Routes an envelope EXCLUSIVELY over the direct mesh. Returns false (sending
  // nothing) when any peer lacks an open channel — the caller surfaces an error
  // rather than relaying. This is the no-fallback path for large media so its
  // bytes never reach the blind relay.
  const dispatchDirect = useCallback((env: RelayEnvelope): boolean => {
    const others = activePeersRef.current.filter(id => id !== peerId);
    if (!p2pRef.current.allConnected(others)) return false;
    const data = JSON.stringify(env);
    let ok = true;
    for (const id of others) {
      if (!p2pRef.current.sendDirect(id, data)) ok = false;
    }
    return ok;
  }, [peerId]);

  // Encrypted-at-rest outbox for messages composed while no peer is online. The
  // at-rest key is derived from this device's per-session Noise identity secret;
  // it never leaves the device and the server stores nothing.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const secret = sessionStorage.getItem(`qb-noise-id-${sessionId}`) ?? sessionId;
    MessageOutbox.open(sessionId, secret).then(box => {
      if (!cancelled) outboxRef.current = box;
    }).catch(() => {});
    return () => { cancelled = true; outboxRef.current = null; };
  }, [sessionId]);

  // Re-sends a queued entry over the live transport, preserving its ORIGINAL
  // nonce so the recipient dedups correctly. Returns false when no peer path is
  // up, which aborts the drain and keeps the queue intact for the next attempt.
  const sendQueued = useCallback((entry: { nonce: string; type: EnvelopeType; plaintext: string; timestamp: number }): boolean => {
    if (!sessionId || !peerId) return false;
    const others = activePeersRef.current.filter(id => id !== peerId);
    if (others.length === 0) return false;
    const mgr = channelsRef.current;
    if (!mgr || !mgr.allReady(activePeersRef.current)) return false;
    const wirePayload =
      entry.type === EnvelopeType.NOISE_MESSAGE
        ? JSON.stringify(mgr.encryptForAll(entry.plaintext))
        : entry.plaintext;
    dispatch({
      sessionId,
      from: peerId,
      type: entry.type,
      timestamp: entry.timestamp,
      nonce: entry.nonce,
      payload: wirePayload,
    });
    return true;
  }, [sessionId, peerId, dispatch]);

  const flushOutbox = useCallback(async () => {
    const box = outboxRef.current;
    if (!box || flushingRef.current) return;
    flushingRef.current = true;
    try {
      await box.drain(entry => sendQueued(entry));
    } finally {
      flushingRef.current = false;
    }
  }, [sendQueued]);

  const connect = useCallback(() => {
    if (!sessionId || !peerId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    channelsRef.current = new PeerChannels({
      sessionId,
      selfId: peerId,
      sendNoise: (to: string, frame: NoiseFrame) => sendSignal({ ...frame }),
      identity: identityRef.current ?? undefined,
    });
    setOwnFingerprint(channelsRef.current.ownFingerprint());

    const refreshCrypto = () => {
      const mgr = channelsRef.current;
      if (!mgr) return;
      setSafetyNumbers(mgr.safetyNumbers());
      setFingerprints(mgr.fingerprints());
      setSecured(mgr.allReady(activePeersRef.current));
      if (ownFingerprint === null) setOwnFingerprint(mgr.ownFingerprint());
    };

    // Transport-agnostic: invoked for envelopes arriving over the WS relay AND
    // over direct data channels.
    const handleEnvelope = (env: RelayEnvelope) => {
      if (env.type === EnvelopeType.PONG) {
        const sentAt = pingTimestampRef.current.get(env.nonce);
        if (sentAt !== undefined) {
          setLatencyMs(Date.now() - sentAt);
          pingTimestampRef.current.delete(env.nonce);
        }
        return;
      }

      if (env.type === EnvelopeType.ACK) {
        // Delivery confirmed: drop any queued copy so it is never re-sent. The
        // recipient's nonce dedup would discard a duplicate anyway, making the
        // whole queue→flush→ack path exactly-once.
        void outboxRef.current?.markDelivered(env.payload);
        setMessages(prev => prev.map(m => {
          if (m.nonce === env.payload) {
            const deliveredTo = Array.from(new Set([...m.deliveredTo, env.from]));
            return { ...m, deliveredTo, status: m.status === 'seen' ? 'seen' : 'delivered' };
          }
          return m;
        }));
        return;
      }

      if (env.type === EnvelopeType.READ) {
        setMessages(prev => prev.map(m => {
          if (m.nonce === env.payload) {
            const seenBy = Array.from(new Set([...m.seenBy, env.from]));
            return { ...m, seenBy, status: 'seen' };
          }
          return m;
        }));
        return;
      }

      // Edits carry an encrypted {target, text} blob. Only the original author
      // (env.from) may mutate their own message; the guard makes spoofing inert.
      if (env.type === EnvelopeType.EDIT) {
        const mgr = channelsRef.current;
        let decoded: string | null = null;
        try {
          decoded = mgr ? mgr.decryptFrom(env.from, JSON.parse(env.payload)) : null;
        } catch {
          decoded = null;
        }
        if (decoded === null) return;
        try {
          const { target, text } = JSON.parse(decoded);
          if (typeof target === 'string' && typeof text === 'string') {
            setMessages(prev => prev.map(m =>
              m.nonce === target && m.from === env.from && !m.deleted
                ? { ...m, payload: text, edited: true }
                : m));
          }
        } catch {
          // Ignore malformed edit frames.
        }
        return;
      }

      // Deletes only need the target nonce (no payload content), so they travel
      // as opaque metadata like READ receipts. Author-bound by env.from.
      if (env.type === EnvelopeType.DELETE) {
        const target = env.payload;
        setMessages(prev => prev.map(m =>
          m.nonce === target && m.from === env.from
            ? { ...m, payload: '', deleted: true, edited: false }
            : m));
        return;
      }

      // SIGNALING payloads are client-interpreted control frames; the server
      // forwards them opaquely and never inspects the contents.
      if (env.type === EnvelopeType.SIGNALING) {
        try {
          const sig = JSON.parse(env.payload);
          if (sig.kind === 'noise') {
            channelsRef.current?.onSignal(env.from, sig as NoiseFrame);
            refreshCrypto();
          } else if (sig.kind === 'rtc') {
            p2pRef.current.handleSignal(env.from, sig as RtcFrame);
          } else if (sig.kind === 'typing') {
            setTypingAt(prev => {
              if (sig.state) return { ...prev, [env.from]: Date.now() };
              const { [env.from]: _removed, ...rest } = prev;
              return rest;
            });
          } else if (sig.kind === 'alias' && typeof sig.alias === 'string' && sig.alias.trim()) {
            const alias = sig.alias.trim().slice(0, 32);
            setPeerAliases(prev => (prev[env.from] === alias ? prev : { ...prev, [env.from]: alias }));
          }
        } catch {
          // Ignore malformed signaling frames
        }
        return;
      }

      // Tier-2 mailbox: hold a copy for any addressed peer who is currently
      // absent, to forward on their return. The blob stays sealed for the final
      // recipient — we are only a carrier (see peer-mailbox.ts).
      if (env.type === EnvelopeType.NOISE_MESSAGE) {
        mailboxRef.current.hold(env, new Set(activePeersRef.current));
      }

      // File attachments are encrypted exactly like NOISE_MESSAGE; the cleartext
      // is a JSON-encoded FileAttachment (single-shot) or a FileStreamInit whose
      // bulk chunks follow as raw binary over the data channel. Neither reaches
      // the relay.
      if (env.type === EnvelopeType.FILE) {
        const mgr = channelsRef.current;
        let decoded: string | null = null;
        try {
          decoded = mgr ? mgr.decryptFrom(env.from, JSON.parse(env.payload)) : null;
        } catch {
          decoded = null;
        }
        if (decoded === null) return;

        // A streamed transfer opens with a FileStreamInit carrying the per-file
        // key; register a receiver and show a 0% placeholder. The bytes arrive
        // out-of-band as binary frames, so we never mailbox-hold a useless init.
        const init = decodeFileStreamInit(decoded);
        if (init) {
          const nonce = env.nonce;
          if (!streamRecvRef.current.has(init.fileId)) {
            const receiver = new FileStreamReceiver(init, (rcv, total) => {
              const ratio = total > 0 ? rcv / total : 0;
              setMessages(prev => prev.map(m => (m.nonce === nonce ? { ...m, progress: ratio } : m)));
            });
            streamRecvRef.current.set(init.fileId, { receiver, from: env.from, nonce, sessionId: env.sessionId });
            setMessages(prev => {
              if (prev.some(m => m.nonce === nonce)) return prev;
              return [...prev, { ...env, payload: '', file: { name: init.name, mime: init.mime, size: init.size, data: '' }, progress: 0, status: 'delivered', deliveredTo: [], seenBy: [] }];
            });
          }
          return;
        }

        mailboxRef.current.hold(env, new Set(activePeersRef.current));
        const att = decodeFileAttachment(decoded);
        if (!att) return;

        setMessages(prev => {
          if (prev.some(m => m.nonce === env.nonce)) return prev;
          return [...prev, { ...env, payload: '', file: att, status: 'delivered', deliveredTo: [], seenBy: [] }];
        });

        dispatchJittered({
          sessionId: env.sessionId,
          from: peerId,
          type: EnvelopeType.ACK,
          timestamp: Date.now(),
          nonce: randomId(),
          payload: env.nonce,
        });
        return;
      }

      if (env.type === EnvelopeType.PLAINTEXT || env.type === EnvelopeType.NOISE_MESSAGE) {
        let text: string | null = env.payload;
        if (env.type === EnvelopeType.NOISE_MESSAGE) {
          const mgr = channelsRef.current;
          try {
            text = mgr ? mgr.decryptFrom(env.from, JSON.parse(env.payload)) : null;
          } catch {
            text = null;
          }
          // Not addressed to us, or no established channel yet â€” drop silently.
          if (text === null) return;
        }

        setMessages(prev => {
          if (prev.some(m => m.nonce === env.nonce)) return prev; // Deduplicate
          return [...prev, { ...env, payload: text as string, status: 'delivered', deliveredTo: [], seenBy: [] }];
        });

        // Auto-reply with ACK over whichever transport is active.
        dispatchJittered({
          sessionId: env.sessionId,
          from: peerId,
          type: EnvelopeType.ACK,
          timestamp: Date.now(),
          nonce: randomId(),
          payload: env.nonce,
        });
      }
    };

    handleEnvelopeRef.current = handleEnvelope;

    // Raw binary frames carry streamed file chunks. Route each to its registered
    // receiver by the fileId in the frame header. A failed AEAD tag throws and
    // rejects the entire transfer; a completed transfer resolves to a Blob whose
    // object URL the UI renders, and we ACK the original init nonce.
    const handleBinary = (fromPeerId: string, ab: ArrayBuffer) => {
      const frame = new Uint8Array(ab);
      const fileId = frameFileId(frame);
      if (!fileId) return;
      const entry = streamRecvRef.current.get(fileId);
      if (!entry || entry.from !== fromPeerId) return;

      try {
        entry.receiver.acceptFrame(frame);
      } catch {
        streamRecvRef.current.delete(fileId);
        setMessages(prev => prev.map(m =>
          m.nonce === entry.nonce
            ? { ...m, fileError: 'Transfer rejected — a chunk failed authentication', progress: undefined }
            : m));
        return;
      }

      if (entry.receiver.isDone) {
        streamRecvRef.current.delete(fileId);
        const url = URL.createObjectURL(entry.receiver.result());
        setMessages(prev => prev.map(m =>
          m.nonce === entry.nonce ? { ...m, fileUrl: url, progress: 1, status: 'delivered' } : m));
        if (peerId) {
          dispatchJittered({
            sessionId: entry.sessionId,
            from: peerId,
            type: EnvelopeType.ACK,
            timestamp: Date.now(),
            nonce: randomId(),
            payload: entry.nonce,
          });
        }
      }
    };

    handleBinaryRef.current = handleBinary;

    socket.onopen = () => {
      console.log('WS Connected');
      const msg = localStorage.getItem('qb-join-msg') || 'Hello';
      const recoveryToken = localStorage.getItem(`qb-recovery-${sessionId}`);
      const peerToken = sessionStorage.getItem(`qb-peer-token-${sessionId}`);
      // If this device holds a host-signed membership token for the vault, the
      // server auto-admits without host approval.
      const credentials = buildJoinCredentials(sessionId, peerId);
      socket.send(JSON.stringify({
        type: 'join',
        sessionId,
        peerId,
        message: msg,
        hostRecoveryToken: recoveryToken,
        peerToken,
        membershipToken: credentials?.membershipToken,
        joinProof: credentials?.joinProof,
      }));
    };

    socket.onmessage = (event) => {
      bytesInWindowRef.current += (event.data as string).length;
      const data = JSON.parse(event.data);
      
      if (data.type === 'joined') {
        setIsConnected(true);
        setIsPending(false);
        setError(null);
        if (data.peerToken) {
          sessionStorage.setItem(`qb-peer-token-${sessionId}`, data.peerToken);
        }
        // Server might tell us we are host via recovery
        if (data.isHost) {
          // This would ideally update useSession, but we can at least log it or handle local state if needed
          console.log('Joined as Host (recovered)');
        }
        return;
      }

      if (data.type === 'pending') {
        setIsPending(true);
        return;
      }

      if (data.type === 'peer_update') {
        const prev = activePeersRef.current;
        const next = data.peers as string[];
        activePeersRef.current = next;
        setActivePeers(next);
        setIsGroup(!!data.isGroup);
        const mgr = channelsRef.current;
        for (const id of next) {
          if (id === peerId) continue;
          mgr?.ensureChannel(id);
          p2pRef.current.ensurePeer(id);
          // A returning peer: replay any envelopes we are carrying for it.
          if (!prev.includes(id)) {
            for (const held of mailboxRef.current.release(id)) dispatch(held);
          }
        }
        for (const id of prev) {
          if (next.includes(id)) continue;
          mgr?.removePeer(id);
          p2pRef.current.removePeer(id);
        }
        refreshCrypto();
        return;
      }

      if (data.type === 'join_request') {
        setJoinRequests(prev => [...prev, { peerId: data.peerId, message: data.message }]);
        return;
      }

      if (data.type === 'error') {
        setError(data.message);
        if (data.message === 'Session destroyed' || data.message === 'Join rejected by host' || data.message === 'You have been kicked by the host') {
           socket.close();
        }
        return;
      }

      // Any other message is a relayed envelope.
      handleEnvelope(data as RelayEnvelope);
    };

    socket.onclose = () => {
      setIsConnected(false);
      console.log('WS Disconnected');
    };

    socket.onerror = (err) => {
      setError('WebSocket connection failed');
      console.error(err);
    };

    socketRef.current = socket;
  }, [sessionId, peerId, sendRaw, sendSignal, dispatch, dispatchJittered]);

  const sendMessage = useCallback((payload: string, type: EnvelopeType = EnvelopeType.NOISE_MESSAGE) => {
    if (!sessionId || !peerId) return;

    const others = activePeersRef.current.filter(id => id !== peerId);
    const ready = !!channelsRef.current && channelsRef.current.allReady(activePeersRef.current);

    // No online, secured recipient: queue the cleartext (sealed at rest) for a
    // trusted contact who is offline. It flushes on their reconnect, keeping
    // this same nonce — the server never sees or stores it.
    if (others.length === 0 || !ready) {
      const nonce = randomId();
      void outboxRef.current?.enqueue({ nonce, to: WILDCARD_RECIPIENT, type, plaintext: payload, timestamp: Date.now() });
      setMessages(prev => [...prev, {
        sessionId, from: peerId, type, timestamp: Date.now(), nonce,
        payload, status: 'sending', deliveredTo: [], seenBy: [],
      }]);
      return;
    }

    const wirePayload =
      type === EnvelopeType.NOISE_MESSAGE && channelsRef.current
        ? JSON.stringify(channelsRef.current.encryptForAll(payload))
        : payload;

    const wireEnvelope: RelayEnvelope = {
      sessionId,
      from: peerId,
      type,
      timestamp: Date.now(),
      nonce: randomId(),
      payload: wirePayload,
    };

    dispatch(wireEnvelope);

    if (typingStopRef.current) {
      clearTimeout(typingStopRef.current);
      typingStopRef.current = null;
    }
    if (typingSentAtRef.current) {
      typingSentAtRef.current = 0;
      sendSignal({ kind: 'typing', state: false });
    }

    // Local echo keeps the plaintext so the sender sees their own message.
    setMessages(prev => [...prev, {
      ...wireEnvelope,
      payload,
      status: 'sent',
      deliveredTo: [],
      seenBy: []
    }]);
  }, [isConnected, sessionId, peerId, activePeers.length, dispatch, sendSignal]);

  const sendTyping = useCallback(() => {
    if (activePeers.length <= 1) return;
    const now = Date.now();
    if (now - typingSentAtRef.current > 2000) {
      typingSentAtRef.current = now;
      sendSignal({ kind: 'typing', state: true });
    }
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = window.setTimeout(() => {
      typingSentAtRef.current = 0;
      typingStopRef.current = null;
      sendSignal({ kind: 'typing', state: false });
    }, 3000);
  }, [activePeers.length, sendSignal]);

  const markAsRead = useCallback((nonce: string) => {
    if (!sessionId || !peerId || readSentRef.current.has(nonce)) return;
    readSentRef.current.add(nonce);

    dispatchJittered({
      sessionId,
      from: peerId,
      type: EnvelopeType.READ,
      timestamp: Date.now(),
      nonce: randomId(),
      payload: nonce,
    });
  }, [sessionId, peerId, dispatchJittered]);

  // Streams a file over the direct mesh in AEAD-sealed chunks: a FileStreamInit
  // (carrying the per-file key) goes through the ratchet first, then the bulk
  // chunks follow as raw ArrayBuffers — never base64, never the relay. Sender
  // memory stays bounded: chunks are sliced from the File on demand and never
  // held all at once.
  const sendFileStream = useCallback(async (file: File): Promise<{ ok: boolean; error?: string }> => {
    const mgr = channelsRef.current;
    if (!mgr || !sessionId || !peerId) return { ok: false, error: 'Secure channel not ready' };
    if (!isWithinP2PFileLimit(file.size)) return { ok: false, error: 'File exceeds size limit' };
    const others = activePeersRef.current.filter(id => id !== peerId);
    if (!p2pRef.current.allConnected(others)) {
      return { ok: false, error: 'Direct link failed — media not sent. Wait for the direct P2P connection.' };
    }

    const { init, frames } = createFileStream(blobSource(file), {
      name: file.name || 'file',
      mime: file.type || 'application/octet-stream',
    });
    const nonce = randomId();
    const initEnvelope: RelayEnvelope = {
      sessionId, from: peerId, type: EnvelopeType.FILE, timestamp: Date.now(), nonce,
      payload: JSON.stringify(mgr.encryptForAll(JSON.stringify(init))),
    };
    if (!dispatchDirect(initEnvelope)) {
      return { ok: false, error: 'Direct link failed — media not sent. Wait for the direct P2P connection.' };
    }

    const url = URL.createObjectURL(file);
    setMessages(prev => [...prev, {
      ...initEnvelope, payload: '', file: { name: init.name, mime: init.mime, size: file.size, data: '' },
      fileUrl: url, progress: 0, status: 'sent', deliveredTo: [], seenBy: [],
    }]);

    try {
      let done = 0;
      for await (const frame of frames()) {
        if (!p2pRef.current.allConnected(others)) throw new Error('PEER_LEFT');
        while (others.some(id => p2pRef.current.bufferedAmount(id) > P2P_STREAM_HIGH_WATER_BYTES)) {
          await new Promise(resolve => setTimeout(resolve, 15));
        }
        for (const id of others) {
          if (!p2pRef.current.sendBinaryDirect(id, frame.buffer)) throw new Error('SEND_FAILED');
        }
        done += 1;
        const ratio = init.chunks > 0 ? done / init.chunks : 1;
        setMessages(prev => prev.map(m => (m.nonce === nonce ? { ...m, progress: ratio } : m)));
      }
      setMessages(prev => prev.map(m => (m.nonce === nonce ? { ...m, progress: 1 } : m)));
      return { ok: true };
    } catch {
      setMessages(prev => prev.map(m => (m.nonce === nonce ? { ...m, fileError: 'Direct transfer interrupted' } : m)));
      return { ok: false, error: 'Direct transfer interrupted' };
    }
  }, [sessionId, peerId, dispatchDirect]);

  const sendFile = useCallback(async (
    file: File,
    opts: SendFileOptions = {},
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!isConnected || !sessionId || !peerId || activePeers.length <= 1) {
      return { ok: false, error: 'No peers connected' };
    }
    // Large, unlocked media streams over the direct mesh in chunks (higher cap,
    // bounded memory); everything else takes the single-envelope path. Password
    // locks pre-encrypt to one blob, so they stay on the single-shot path.
    const stream = requiresDirectPath(file.size) && !opts.password;
    if (!(stream ? isWithinP2PFileLimit(file.size) : isWithinFileLimit(file.size))) {
      return { ok: false, error: 'File exceeds size limit' };
    }
    // Never let a file leave unencrypted: require the E2E channel manager. The
    // old base64 fallback would have relayed cleartext if the handshake had not
    // completed yet.
    if (!channelsRef.current) {
      return { ok: false, error: 'Secure channel not ready' };
    }

    if (stream) return sendFileStream(file);

    const bytes = new Uint8Array(await file.arrayBuffer());

    let data: string;
    let enc: FileAttachment['enc'];
    if (opts.password) {
      const sealed = await encryptFileData(bytes, opts.password, opts.algo ?? 'AES-GCM');
      data = sealed.data;
      enc = sealed.lock;
    } else {
      data = toBase64(bytes);
    }

    const attachment: FileAttachment = {
      name: file.name || 'file',
      mime: file.type || 'application/octet-stream',
      size: file.size,
      data,
      ...(enc ? { enc } : {}),
    };
    const inner = encodeFileAttachment(attachment);
    const wirePayload = JSON.stringify(channelsRef.current.encryptForAll(inner));
    const nonce = randomId();

    const envelope: RelayEnvelope = {
      sessionId,
      from: peerId,
      type: EnvelopeType.FILE,
      timestamp: Date.now(),
      nonce,
      payload: wirePayload,
    };

    // Media above the threshold MUST take the direct P2P path: its bytes never
    // touch the blind relay. If no direct link is up we surface a visible error
    // instead of falling back to the server — that fallback would defeat the
    // whole point (server bandwidth + a relayed copy of the media).
    if (requiresDirectPath(file.size)) {
      if (!dispatchDirect(envelope)) {
        return { ok: false, error: 'Direct link failed — media not sent. Wait for the direct P2P connection.' };
      }
    } else {
      dispatch(envelope);
    }

    // Local echo keeps the cleartext attachment so the sender always sees their
    // own file rendered, even when it was password-locked for the recipients.
    setMessages(prev => [...prev, {
      sessionId, from: peerId, type: EnvelopeType.FILE, timestamp: Date.now(), nonce,
      payload: '', file: { name: attachment.name, mime: attachment.mime, size: file.size, data: toBase64(bytes) },
      locked: !!enc, status: 'sent', deliveredTo: [], seenBy: [],
    }]);

    return { ok: true };
  }, [isConnected, sessionId, peerId, activePeers.length, dispatch, dispatchDirect, sendFileStream]);

  const editMessage = useCallback((targetNonce: string, newText: string) => {
    if (!sessionId || !peerId || !newText.trim()) return;
    const inner = JSON.stringify({ target: targetNonce, text: newText });
    const wirePayload = channelsRef.current
      ? JSON.stringify(channelsRef.current.encryptForAll(inner))
      : inner;
    dispatch({
      sessionId,
      from: peerId,
      type: EnvelopeType.EDIT,
      timestamp: Date.now(),
      nonce: randomId(),
      payload: wirePayload,
    });
    setMessages(prev => prev.map(m =>
      m.nonce === targetNonce && m.from === peerId && !m.deleted
        ? { ...m, payload: newText, edited: true }
        : m));
  }, [sessionId, peerId, dispatch]);

  const deleteMessage = useCallback((targetNonce: string) => {
    if (!sessionId || !peerId) return;
    dispatch({
      sessionId,
      from: peerId,
      type: EnvelopeType.DELETE,
      timestamp: Date.now(),
      nonce: randomId(),
      payload: targetNonce,
    });
    setMessages(prev => prev.map(m =>
      m.nonce === targetNonce && m.from === peerId
        ? { ...m, payload: '', deleted: true }
        : m));
  }, [sessionId, peerId, dispatch]);

  useEffect(() => {
    if (sessionId && peerId) {
      connect();
    }
    return () => {
      socketRef.current?.close();
      p2pRef.current.reset();
    };
  }, [sessionId, peerId, connect]);

  // Flush the offline outbox once a secure channel to a returning peer is up.
  useEffect(() => {
    if (secured && activePeers.length > 1) void flushOutbox();
  }, [secured, activePeers.length, flushOutbox]);

  // Periodic PING to measure round-trip latency
  useEffect(() => {
    if (!isConnected || !sessionId || !peerId) return;
    const interval = setInterval(() => {
      const nonce = randomId();
      pingTimestampRef.current.set(nonce, Date.now());
      sendRaw({
        sessionId,
        from: peerId,
        type: EnvelopeType.PING,
        timestamp: Date.now(),
        nonce,
        payload: '',
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected, sessionId, peerId, sendRaw]);

  // Announce our display alias on connect and whenever the peer set changes,
  // so newly joined peers learn how to label us.
  useEffect(() => {
    if (!isConnected || activePeers.length <= 1) return;
    const alias = (localStorage.getItem('qb-join-msg') || '').trim();
    if (alias && alias.toLowerCase() !== 'hello') {
      sendSignal({ kind: 'alias', alias: alias.slice(0, 32) });
    }
  }, [isConnected, activePeers.length, sendSignal]);

  // Expire typing indicators if no explicit "stop" frame arrives.
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingAt(prev => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, t]) => now - (t as number) < 4000));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const acceptJoin = useCallback((targetPeerId: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: 'accept_join', peerId: targetPeerId }));
    setJoinRequests(prev => prev.filter(req => req.peerId !== targetPeerId));
  }, []);

  const rejectJoin = useCallback((targetPeerId: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: 'reject_join', peerId: targetPeerId }));
    setJoinRequests(prev => prev.filter(req => req.peerId !== targetPeerId));
  }, []);

  const kickPeer = useCallback((targetPeerId: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: 'kick_peer', peerId: targetPeerId }));
  }, []);

  const typingPeers = Object.keys(typingAt).filter(id => id !== peerId);
  const otherPeers = activePeers.filter(id => id !== peerId);
  const p2pPeers = p2p.connectedPeers;
  const transport: 'p2p' | 'relayed' =
    otherPeers.length > 0 && otherPeers.every(id => p2pPeers.includes(id)) ? 'p2p' : 'relayed';

  return { messages, isConnected, isPending, activePeers, joinRequests, error, isGroup, sendMessage, sendFile, sendLargeFile: sendFileStream, editMessage, deleteMessage, sendTyping, markAsRead, acceptJoin, rejectJoin, kickPeer, latencyMs, ioLoad, peerAliases, typingPeers, secured, safetyNumbers, fingerprints, ownFingerprint, p2pPeers, transport, directLinkFailed: p2p.directFailed };
}
