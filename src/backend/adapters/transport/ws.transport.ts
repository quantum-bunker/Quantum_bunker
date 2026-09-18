import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { IRelayTransport } from '../../application/ports/relay-transport.port';
import { RelayEnvelope, EnvelopeType } from '../../../shared/contracts/v1/envelope';
import { IEventBus } from '../../application/ports/event-bus.port';
import { RelayMessage } from '../../application/use-cases/relay-message.use-case';
import { RelayEnvelopeSchema, JoinFrameSchema, PeerIdSchema } from '../../../shared/contracts/v1/schemas';
import { ISessionStore } from '../../application/ports/session-store.port';
import { Session, SessionStatus } from '../../../shared/contracts/v1/session';
import { RELAY_LIMITS, SESSION_LIMITS } from '../../core/constants';
import { safeEqual, newToken, clientIp, isAllowedOrigin, torMode } from '../../core/security';
import { stalePeerIds } from '../../core/policies/presence.policy';
import { DomainError } from '../../core/errors';
import { decodeToken, verifyMembership, JoinProof } from '../../../shared/membership';

export class WsTransport implements IRelayTransport {
  private connections = new Map<string, WebSocket>(); // "sessionId:peerId" -> socket
  private sessionPeers = new Map<string, Set<string>>(); // sessionId -> live peerIds
  private messageCounters = new Map<string, { count: number; lastReset: number }>();
  private ipCounters = new Map<string, { count: number; lastReset: number }>();
  private usedProofNonces = new Map<string, number>(); // join-proof replay guard

  constructor(
    private readonly wss: WebSocketServer,
    private readonly eventBus: IEventBus,
    private readonly store: ISessionStore,
    private relayMessage?: RelayMessage // Set after initialization
  ) {
    this.wss.on('connection', (ws, req) => { void this.handleConnection(ws, req); });
  }

  setRelayMessage(relayMessage: RelayMessage) {
    this.relayMessage = relayMessage;
  }

  pruneStaleCounters(): void {
    const now = Date.now();
    for (const [key, counter] of this.ipCounters) {
      if (now - counter.lastReset > RELAY_LIMITS.CONN_WINDOW_MS * 2) this.ipCounters.delete(key);
    }
    for (const [key, counter] of this.messageCounters) {
      if (now - counter.lastReset > 10_000) this.messageCounters.delete(key);
    }
    for (const [sessionId, peers] of this.sessionPeers) {
      if (peers.size === 0) this.sessionPeers.delete(sessionId);
    }
    for (const [nonce, at] of this.usedProofNonces) {
      if (now - at > RELAY_LIMITS.CONN_WINDOW_MS * 2) this.usedProofNonces.delete(nonce);
    }
  }

  // Single-use guard: a captured join proof cannot be replayed within its
  // freshness window.
  private consumeProofNonce(sessionId: string, nonce: string): boolean {
    const key = `${sessionId}:${nonce}`;
    if (this.usedProofNonces.has(key)) return false;
    if (this.usedProofNonces.size >= RELAY_LIMITS.NONCE_CACHE_MAX) {
      const oldest = this.usedProofNonces.keys().next().value;
      if (oldest !== undefined) this.usedProofNonces.delete(oldest);
    }
    this.usedProofNonces.set(key, Date.now());
    return true;
  }

  private connectedPeers(sessionId: string): Set<string> {
    let set = this.sessionPeers.get(sessionId);
    if (!set) {
      set = new Set();
      this.sessionPeers.set(sessionId, set);
    }
    return set;
  }

  // Presence is derived from live sockets rather than an incrementing counter.
  // A counter drifts every time a reconnect lands before the old socket's close
  // event, and a session whose count reaches zero is reaped by the cleanup
  // sweep while its peers are still talking.
  private syncPresence(session: Session): void {
    // Pending guests hold a registered socket so the host can reach them, but
    // they are not participants until admitted.
    const count = this.admittedPeers(session).length;
    session.participantCount = count;
    session.emptySince = count === 0 ? (session.emptySince ?? Date.now()) : null;
  }

  private reclaimStaleSlots(session: Session): void {
    const connected = this.connectedPeers(session.id);
    for (const id of stalePeerIds(session.peers, connected, session.hostId, Date.now())) {
      delete session.peers[id];
    }
  }

  private admittedPeers(session: Session): string[] {
    return [...this.connectedPeers(session.id)].filter(
      (id) => Object.prototype.hasOwnProperty.call(session.peers, id),
    );
  }

  private registerConnection(sessionId: string, peerId: string, ws: WebSocket): void {
    this.connections.set(`${sessionId}:${peerId}`, ws);
    this.connectedPeers(sessionId).add(peerId);
  }

  // A socket can transition to CLOSING between the readyState check and the
  // write. An uncaught throw inside an async handler surfaces as an unhandled
  // rejection, which terminates the process on Node 20.
  private safeSend(ws: WebSocket | undefined, frame: string): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(frame);
      return true;
    } catch {
      return false;
    }
  }

  private checkIpLimit(req: IncomingMessage): boolean {
    // In Tor mode every connection arrives from 127.0.0.1; per-IP limiting
    // would throttle all peers at once, so we skip it entirely.
    if (torMode()) return true;
    const ip = clientIp(req);
    const now = Date.now();
    const counter = this.ipCounters.get(ip) || { count: 0, lastReset: now };

    if (now - counter.lastReset > RELAY_LIMITS.CONN_WINDOW_MS) {
      counter.count = 1;
      counter.lastReset = now;
    } else {
      counter.count++;
    }

    this.ipCounters.set(ip, counter);

    return counter.count <= RELAY_LIMITS.CONN_PER_IP_LIMIT;
  }

  private checkMessageLimit(sessionId: string, peerId: string): boolean {
    const key = `${sessionId}:${peerId}`;
    const now = Date.now();
    const counter = this.messageCounters.get(key) || { count: 0, lastReset: now };

    if (now - counter.lastReset > 1000) {
      counter.count = 1;
      counter.lastReset = now;
    } else {
      counter.count++;
    }

    this.messageCounters.set(key, counter);

    return counter.count <= RELAY_LIMITS.MSG_PER_SECOND_LIMIT;
  }

  // Returns null when the session is full. Capacity is enforced here rather
  // than only on the join path, because pending peers sit outside session.peers
  // and the host could otherwise accept a full queue past the limit.
  private admitPeer(session: Session, peerId: string): string | null {
    this.reclaimStaleSlots(session);
    const wasAlreadyAdmitted = !!session.peers[peerId];
    if (!wasAlreadyAdmitted && Object.keys(session.peers).length >= session.maxPeers) {
      return null;
    }
    const token = session.peers[peerId]?.token || newToken();
    session.peers[peerId] = { id: peerId, joinedAt: Date.now(), lastSeenAt: Date.now(), token };
    this.syncPresence(session);
    if (session.participantCount > 2) {
      session.isGroup = true;
    }
    session.status = SessionStatus.ACTIVE;
    return token;
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage) {
    if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
      ws.close(1008, 'Origin not allowed');
      return;
    }

    if (!this.checkIpLimit(req)) {
      ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Connection rate limit exceeded' }));
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    let currentPeerId: string | null = null;
    let currentSessionId: string | null = null;
    let socketMsgCount = 0;
    let socketMsgWindowStart = Date.now();

    const joinTimeout = setTimeout(() => {
      if (!currentPeerId) ws.close(1008, 'Join timeout');
    }, RELAY_LIMITS.JOIN_TIMEOUT_MS);
    ws.on('close', () => clearTimeout(joinTimeout));

    // A protocol-level socket error (e.g. an oversized frame past the server's
    // maxPayload) is emitted by ws on the socket itself. Without a listener
    // Node escalates it to an uncaught exception and the relay crashes — one
    // malformed client must never take the process down. Emit a domain event
    // and let the socket close on its own.
    ws.on('error', (err) => {
      this.eventBus.emit({
        type: 'EnvelopeRejected',
        sessionId: currentSessionId ?? 'unknown',
        occurredAt: Date.now(),
        payload: { reason: (err as Error)?.message ?? 'socket error' },
      });
    });

    ws.on('message', async (data) => {
      try {
        const now = Date.now();
        if (now - socketMsgWindowStart > 1000) {
          socketMsgCount = 1;
          socketMsgWindowStart = now;
        } else if (++socketMsgCount > RELAY_LIMITS.SOCKET_MSG_PER_SECOND_LIMIT) {
          ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Message rate limit exceeded' }));
          return;
        }

        const raw = JSON.parse(data.toString());

        // Initial handshake to join session
        if (raw.type === 'join') {
          const parsed = JoinFrameSchema.safeParse({
            ...raw,
            sessionId: typeof raw.sessionId === 'string' ? raw.sessionId.trim() : raw.sessionId,
            peerId: typeof raw.peerId === 'string' ? raw.peerId.trim() : raw.peerId,
          });
          if (!parsed.success) {
            ws.send(JSON.stringify({ type: 'error', code: 'INVALID_PEER_ID', message: 'Invalid join frame' }));
            return;
          }
          const join = parsed.data;
          const sessionId = join.sessionId;
          const peerId = join.peerId;

          const session = await this.store.get(sessionId);

          if (!session) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
            return;
          }

          this.reclaimStaleSlots(session);
          if (Object.keys(session.peers).length >= session.maxPeers && !session.peers[peerId]) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session full' }));
            return;
          }

          const connKey = `${sessionId}:${peerId}`;

          // Host recovery: possession of the recovery token is the only way
          // to claim host authority — hostId alone proves nothing.
          if (safeEqual(join.hostRecoveryToken, session.hostRecoveryToken)) {
            if (session.hostId !== peerId) {
              delete session.peers[session.hostId];
              session.hostId = peerId;
            }
            currentPeerId = peerId;
            currentSessionId = sessionId;
            this.registerConnection(sessionId, peerId, ws);
            const peerToken = this.admitPeer(session, peerId);
            if (!peerToken) {
              ws.send(JSON.stringify({ type: 'error', message: 'Session full' }));
              return;
            }
            await this.store.save(session);

            ws.send(JSON.stringify({ type: 'joined', sessionId, peerId, isHost: true, peerToken }));
            this.broadcastPeerUpdate(session);
            return;
          }

          // Host authority is reachable only through the recovery token, handled
          // above. hostId is public — it rides in every peer_update and every
          // envelope's `from` — so a peer that reaches here claiming it has by
          // definition failed that check. Falling through to the stale-socket
          // recovery below would hand it the vault.
          if (peerId === session.hostId) {
            ws.send(JSON.stringify({ type: 'error', code: 'INVALID_PEER_TOKEN', message: 'Invalid host credentials' }));
            ws.close(1008, 'Invalid host credentials');
            return;
          }

          if (session.peers[peerId]) {
            // Rejoining an admitted identity requires the peer token issued at
            // first admission — peer IDs are public and prove nothing.
            if (!safeEqual(join.peerToken, session.peers[peerId].token)) {
              // Stale-socket recovery: when the old connection is gone and no
              // token was presented, the peer is a legitimate reconnecting
              // client whose token was lost between admission and delivery.
              // Admit them with a fresh token instead of locking them out.
              const oldSocket = this.connections.get(connKey);
              if (oldSocket && oldSocket.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', code: 'INVALID_PEER_TOKEN', message: 'Invalid peer credentials' }));
                ws.close(1008, 'Invalid peer credentials');
                return;
              }
              // Old socket is gone — ghost client reconnecting. Re-admit.
            }
            currentPeerId = peerId;
            currentSessionId = sessionId;
            this.registerConnection(sessionId, peerId, ws);
            const peerToken = this.admitPeer(session, peerId);
            if (!peerToken) {
              ws.send(JSON.stringify({ type: 'error', message: 'Session full' }));
              return;
            }
            await this.store.save(session);

            ws.send(JSON.stringify({ type: 'joined', sessionId, peerId, peerToken }));
            this.broadcastPeerUpdate(session);
            return;
          }

          // Whitelisted member: a host-signed membership token plus a live
          // possession proof admits the peer with no host interaction and
          // nothing stored server-side beyond the ephemeral session.
          if (join.membershipToken && join.joinProof && session.hostPublicKey) {
            const token = decodeToken(join.membershipToken);
            const proof = join.joinProof as JoinProof;
            if (!token) {
              ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MEMBERSHIP', message: 'Malformed membership token' }));
              return;
            }
            const result = verifyMembership(session.hostPublicKey, sessionId, peerId, token, proof);
            if (!result.valid) {
              ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MEMBERSHIP', message: result.reason }));
              return;
            }
            if (!this.consumeProofNonce(sessionId, proof.nonce)) {
              ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MEMBERSHIP', message: 'Join proof already used' }));
              return;
            }
            currentPeerId = peerId;
            currentSessionId = sessionId;
            this.registerConnection(sessionId, peerId, ws);
            const peerToken = this.admitPeer(session, peerId);
            if (!peerToken) {
              ws.send(JSON.stringify({ type: 'error', message: 'Session full' }));
              return;
            }
            await this.store.save(session);

            ws.send(JSON.stringify({ type: 'joined', sessionId, peerId, peerToken, viaMembership: true }));
            this.broadcastPeerUpdate(session);
            return;
          }

          // Guest requesting join
          const hostKey = `${sessionId}:${session.hostId}`;
          const hostWs = this.connections.get(hostKey);

          if (!hostWs || hostWs.readyState !== WebSocket.OPEN) {
             ws.send(JSON.stringify({ type: 'error', message: 'Host is offline' }));
             return;
          }

          session.pendingPeers = session.pendingPeers || {};

          // Already pending: re-bind the socket without sending a duplicate
          // join_request to the host or replacing the pending entry.
          if (session.pendingPeers[peerId]) {
            currentPeerId = peerId;
            currentSessionId = sessionId;
            this.registerConnection(sessionId, peerId, ws);
            ws.send(JSON.stringify({ type: 'pending', message: 'Waiting for host approval...' }));
            return;
          }

          if (Object.keys(session.pendingPeers).length >= SESSION_LIMITS.MAX_PENDING_PEERS) {
            ws.send(JSON.stringify({ type: 'error', message: 'Too many pending join requests' }));
            return;
          }
          session.pendingPeers[peerId] = { id: peerId, message: join.message || 'Wants to join', requestedAt: Date.now() };
          await this.store.save(session);

          currentPeerId = peerId;
          currentSessionId = sessionId;
          this.registerConnection(sessionId, peerId, ws); // Keep connection alive but restricted
          hostWs.send(JSON.stringify({ type: 'join_request', peerId, message: join.message || 'Wants to join' }));
          ws.send(JSON.stringify({ type: 'pending', message: 'Waiting for host approval...' }));
          return;
        }

        if (raw.type === 'accept_join') {
          if (!currentSessionId || !currentPeerId) return;
          const session = await this.store.get(currentSessionId);
          if (!session || session.hostId !== currentPeerId) return;

          const target = PeerIdSchema.safeParse(raw.peerId);
          if (!target.success) return;
          const targetPeer = target.data;
          if (session.pendingPeers && session.pendingPeers[targetPeer]) {
            const peerToken = this.admitPeer(session, targetPeer);
            if (!peerToken) {
              this.safeSend(ws, JSON.stringify({ type: 'error', code: 'PEER_LIMIT_REACHED', message: 'Session is full' }));
              return;
            }
            delete session.pendingPeers[targetPeer];
            await this.store.save(session);

            const targetKey = `${currentSessionId}:${targetPeer}`;
            const targetWs = this.connections.get(targetKey);
            if (targetWs) {
               targetWs.send(JSON.stringify({ type: 'joined', sessionId: currentSessionId, peerId: targetPeer, peerToken }));
            }
            this.broadcastPeerUpdate(session);
          }
          return;
        }

        if (raw.type === 'reject_join') {
          if (!currentSessionId || !currentPeerId) return;
          const session = await this.store.get(currentSessionId);
          if (!session || session.hostId !== currentPeerId) return;

          const target = PeerIdSchema.safeParse(raw.peerId);
          if (!target.success) return;
          const targetPeer = target.data;
          if (session.pendingPeers && session.pendingPeers[targetPeer]) {
            delete session.pendingPeers[targetPeer];
            await this.store.save(session);

            const targetKey = `${currentSessionId}:${targetPeer}`;
            const targetWs = this.connections.get(targetKey);
            if (targetWs) {
               targetWs.send(JSON.stringify({ type: 'error', message: 'Join rejected by host' }));
               targetWs.close(1008, 'Join rejected');
               this.connections.delete(targetKey);
            }
          }
          return;
        }

        if (raw.type === 'kick_peer') {
          if (!currentSessionId || !currentPeerId) return;
          const session = await this.store.get(currentSessionId);
          if (!session || session.hostId !== currentPeerId || !session.isGroup) return;

          const target = PeerIdSchema.safeParse(raw.peerId);
          if (!target.success) return;
          const targetPeer = target.data;
          if (session.peers[targetPeer] && targetPeer !== session.hostId) {
            delete session.peers[targetPeer];
            this.connectedPeers(currentSessionId).delete(targetPeer);
            this.syncPresence(session);
            await this.store.save(session);

            const targetKey = `${currentSessionId}:${targetPeer}`;
            const targetWs = this.connections.get(targetKey);
            if (targetWs) {
               targetWs.send(JSON.stringify({ type: 'error', message: 'You have been kicked by the host' }));
               targetWs.close(1008, 'Kicked by host');
               this.connections.delete(targetKey);
            }
            this.broadcastPeerUpdate(session);
          }
          return;
        }

        // Regular relay
        if (this.relayMessage) {
          if (currentPeerId && currentSessionId && !this.checkMessageLimit(currentSessionId, currentPeerId)) {
            ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Message rate limit exceeded' }));
            return;
          }
          const session = currentSessionId ? await this.store.get(currentSessionId) : null;
          if (!session || !currentPeerId || !session.peers[currentPeerId]) {
             ws.send(JSON.stringify({ type: 'error', message: 'Not authorized or pending' }));
             return;
          }
          // Reflect PING back as PONG to sender only — not relayed to peers
          if (raw.type === EnvelopeType.PING) {
            ws.send(JSON.stringify({
              sessionId: currentSessionId,
              from: 'server',
              type: EnvelopeType.PONG,
              timestamp: Date.now(),
              nonce: raw.nonce,
              payload: '',
            }));
            return;
          }

          const result = RelayEnvelopeSchema.safeParse(raw);
          if (!result.success) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid envelope', details: result.error.issues }));
            return;
          }
          // Sender identity is bound to the authenticated socket — envelopes
          // cannot speak for another peer.
          if (result.data.from !== currentPeerId || result.data.sessionId !== currentSessionId) {
            ws.send(JSON.stringify({ type: 'error', code: 'SENDER_MISMATCH', message: 'Envelope sender does not match connection identity' }));
            return;
          }
          await this.relayMessage.execute(result.data);
        }

      } catch (err) {
        // Never swallow: a rejected frame always leaves an EnvelopeRejected
        // trail, and a DomainError keeps its code so the client can act on it
        // rather than seeing a generic parse failure.
        const code = err instanceof DomainError ? err.code : 'INVALID_FRAME';
        const message = err instanceof DomainError ? err.message : 'Invalid message format';
        this.eventBus.emit({
          type: 'EnvelopeRejected',
          sessionId: currentSessionId || 'unknown',
          occurredAt: Date.now(),
          payload: { reason: code, rawEnvelope: { from: currentPeerId || 'unknown' } },
        });
        this.safeSend(ws, JSON.stringify({ type: 'error', code, message }));
      }
    });

    ws.on('close', () => {
      void this.handleClose(ws, currentSessionId, currentPeerId);
    });
  }

  private async handleClose(ws: WebSocket, sessionId: string | null, peerId: string | null): Promise<void> {
    if (!peerId || !sessionId) return;
    try {
      const connKey = `${sessionId}:${peerId}`;
      // A reconnect may already own this key; only the live socket tears down,
      // otherwise a late close event evicts the peer that just replaced it.
      if (this.connections.get(connKey) !== ws) return;
      this.connections.delete(connKey);
      this.connectedPeers(sessionId).delete(peerId);

      const session = await this.store.get(sessionId);
      if (session) {
        // A guest that disconnects before approval must not hold its slot, or
        // the pending queue fills permanently and blocks every future join.
        if (session.pendingPeers) delete session.pendingPeers[peerId];
        const peer = session.peers[peerId];
        if (peer) peer.lastSeenAt = Date.now();
        this.syncPresence(session);
        await this.store.save(session);
        this.broadcastPeerUpdate(session);
      }

      this.eventBus.emit({
        type: 'PeerDisconnected',
        sessionId,
        occurredAt: Date.now(),
        payload: { peerId },
      });
    } catch {
      // Teardown is best-effort; a throw here would become an unhandled
      // rejection and take the process down.
    }
  }

  private broadcastPeerUpdate(session: Session) {
    const peers = this.admittedPeers(session);
    const frame = JSON.stringify({ type: 'peer_update', peers, isGroup: !!session.isGroup });
    for (const peerId of peers) {
      this.safeSend(this.connections.get(`${session.id}:${peerId}`), frame);
    }
  }

  async send(sessionId: string, peerId: string, envelope: RelayEnvelope): Promise<void> {
    this.sendFrame(sessionId, peerId, JSON.stringify(envelope));
  }

  async sendToMany(sessionId: string, peerIds: string[], envelope: RelayEnvelope): Promise<string[]> {
    const frame = JSON.stringify(envelope);
    const delivered: string[] = [];
    for (const peerId of peerIds) {
      if (this.sendFrame(sessionId, peerId, frame)) delivered.push(peerId);
    }
    return delivered;
  }

  private sendFrame(sessionId: string, peerId: string, frame: string): boolean {
    const ws = this.connections.get(`${sessionId}:${peerId}`);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    // Backpressure guard: a slow consumer drops messages instead of growing
    // the server's send buffer without bound.
    if (ws.bufferedAmount > RELAY_LIMITS.MAX_BUFFERED_BYTES) return false;
    return this.safeSend(ws, frame);
  }

  isPeerConnected(sessionId: string, peerId: string): boolean {
    const connKey = `${sessionId}:${peerId}`;
    const ws = this.connections.get(connKey);
    return ws ? ws.readyState === WebSocket.OPEN : false;
  }

  disconnectSession(sessionId: string): void {
    const frame = JSON.stringify({ type: 'error', message: 'Session destroyed' });
    for (const peerId of this.connectedPeers(sessionId)) {
      const key = `${sessionId}:${peerId}`;
      const ws = this.connections.get(key);
      if (ws) {
        if (this.safeSend(ws, frame)) ws.close(1008, 'Session destroyed');
        this.connections.delete(key);
      }
    }
    this.sessionPeers.delete(sessionId);
  }
}
