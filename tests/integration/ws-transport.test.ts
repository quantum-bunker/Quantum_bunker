import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WebSocket } from 'ws';
import { setupApp } from '../../server';
import { Application } from 'express';
import {
  generateIdentity,
  issueMembershipToken,
  createJoinProof,
  encodeToken,
} from '../../src/shared/membership';

describe('WebSocket Transport Integration', () => {
  let app: Application;
  let server: any;
  let wss: any;
  let cleanupInterval: any;
  let port: number;

  beforeAll(async () => {
    const setup = await setupApp();
    app = setup.app;
    server = setup.server;
    wss = setup.wss;
    cleanupInterval = setup.cleanupInterval;
    // force listen on a different port for tests
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterAll(() => {
    if (cleanupInterval) clearInterval(cleanupInterval);
    server.close();
  });

  const waitForMessage = (ws: WebSocket, type: string): Promise<any> => {
    return new Promise((resolve) => {
      const handler = (data: any) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === type) {
          ws.off('message', handler);
          resolve(parsed);
        }
      };
      ws.on('message', handler);
    });
  };

  it('should allow host to join and create session via API then WS handshake', async () => {
    // create session via API
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'WS Test', expiresInSeconds: 600 });
    expect(res.status).toBe(201);
    const { sessionId, hostRecoveryToken, hostId } = res.body;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve) => ws.once('open', resolve));

    // send join as host (with recovery token)
    ws.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    const joinedMsg = await waitForMessage(ws, 'joined');
    expect(joinedMsg.isHost).toBe(true);
    ws.close();
  });

  it('should broadcast messages between peers and enforce rate limit', async () => {
    // create session
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'RateLimit', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const peerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all([
      new Promise((r) => hostWs.once('open', r)),
      new Promise((r) => peerWs.once('open', r)),
    ]);
    // host joins (host authority requires the recovery token)
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');
    // peer joins (will be pending then accepted)
    const peerId = 'peer-b';
    peerWs.send(JSON.stringify({ type: 'join', sessionId, peerId }));
    await waitForMessage(peerWs, 'pending');
    // host accepts join
    hostWs.send(JSON.stringify({ type: 'accept_join', peerId }));
    await waitForMessage(peerWs, 'joined');

    // send a valid message from host
    const envelope = { type: 'noise-message', sessionId, from: hostId, timestamp: Date.now(), nonce: 'n1', payload: 'hello' };
    hostWs.send(JSON.stringify(envelope));
    const received = await waitForMessage(peerWs, 'noise-message');
    expect(received.payload).toBe('hello');

    // exceed message rate limit (simulate > MSG_PER_SECOND_LIMIT)
    for (let i = 0; i < 101; i++) {
      hostWs.send(JSON.stringify({ ...envelope, nonce: `n${i}` }));
    }
    const rateError = await waitForMessage(hostWs, 'error');
    expect(rateError.code).toBe('RATE_LIMIT_EXCEEDED');
    hostWs.close();
    peerWs.close();
  });

  it('should reject claiming an admitted peerId without its peer token', async () => {
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Hijack', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => hostWs.once('open', r));
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    // Attacker knows the public hostId but holds no credential
    const attackerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => attackerWs.once('open', r));
    attackerWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId }));
    const err = await waitForMessage(attackerWs, 'error');
    expect(err.code).toBe('INVALID_PEER_TOKEN');

    hostWs.close();
    attackerWs.close();
  });

  it('should reject envelopes whose from field does not match the socket identity', async () => {
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Spoof', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => hostWs.once('open', r));
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    hostWs.send(JSON.stringify({
      type: 'noise-message', sessionId, from: 'somebody-else',
      timestamp: Date.now(), nonce: 'spoof-1', payload: 'x',
    }));
    const err = await waitForMessage(hostWs, 'error');
    expect(err.code).toBe('SENDER_MISMATCH');
    hostWs.close();
  });

  it('auto-admits a whitelisted member with no host approval', async () => {
    const host = generateIdentity();
    const member = generateIdentity();

    const res = await (await import('supertest')).default(app)
      .post('/api/sessions')
      .send({ name: 'Whitelist', expiresInSeconds: 600, hostPublicKey: host.publicKey });
    const { sessionId } = res.body;

    const token = encodeToken(issueMembershipToken(host.secretKey, member.publicKey, sessionId));
    const peerId = 'member-1';
    const proof = createJoinProof(member, sessionId, peerId, 'mn-1');

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'join', sessionId, peerId, membershipToken: token, joinProof: proof }));
    const joined = await waitForMessage(ws, 'joined');
    expect(joined.viaMembership).toBe(true);
    expect(joined.peerToken).toBeDefined();
    ws.close();
  });

  it('rejects a membership join whose proof key was not whitelisted', async () => {
    const host = generateIdentity();
    const member = generateIdentity();
    const impostor = generateIdentity();

    const res = await (await import('supertest')).default(app)
      .post('/api/sessions')
      .send({ name: 'Whitelist2', expiresInSeconds: 600, hostPublicKey: host.publicKey });
    const { sessionId } = res.body;

    // Token vouches for `member`, but the impostor signs the proof with their key.
    const token = encodeToken(issueMembershipToken(host.secretKey, member.publicKey, sessionId));
    const peerId = 'member-2';
    const forgedProof = createJoinProof(impostor, sessionId, peerId, 'mn-2');

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'join', sessionId, peerId, membershipToken: token, joinProof: forgedProof }));
    const err = await waitForMessage(ws, 'error');
    expect(err.code).toBe('INVALID_MEMBERSHIP');
    ws.close();
  });

  it('a captured membership join cannot be replayed to impersonate a member', async () => {
    const host = generateIdentity();
    const member = generateIdentity();

    const res = await (await import('supertest')).default(app)
      .post('/api/sessions')
      .send({ name: 'Whitelist3', expiresInSeconds: 600, hostPublicKey: host.publicKey });
    const { sessionId } = res.body;

    const token = encodeToken(issueMembershipToken(host.secretKey, member.publicKey, sessionId));
    const proof = createJoinProof(member, sessionId, 'member-3', 'mn-3');

    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws1.once('open', r));
    ws1.send(JSON.stringify({ type: 'join', sessionId, peerId: 'member-3', membershipToken: token, joinProof: proof }));
    await waitForMessage(ws1, 'joined');

    // An attacker who captured the join frame replays it verbatim on a fresh
    // socket. Once admitted, that identity is bound to its peer token (which the
    // attacker never saw), so the replay is rejected.
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws2.once('open', r));
    ws2.send(JSON.stringify({ type: 'join', sessionId, peerId: 'member-3', membershipToken: token, joinProof: proof }));
    const err = await waitForMessage(ws2, 'error');
    expect(['INVALID_PEER_TOKEN', 'INVALID_MEMBERSHIP']).toContain(err.code);
    ws1.close();
    ws2.close();
  });

  it('rejects a reused join-proof nonce for a not-yet-admitted member', async () => {
    const host = generateIdentity();
    const member = generateIdentity();

    const res = await (await import('supertest')).default(app)
      .post('/api/sessions')
      .send({ name: 'WhitelistNonce', expiresInSeconds: 600, hostPublicKey: host.publicKey });
    const { sessionId } = res.body;

    const token = encodeToken(issueMembershipToken(host.secretKey, member.publicKey, sessionId));

    // First admission consumes nonce 'shared-nonce'.
    const proof1 = createJoinProof(member, sessionId, 'member-x', 'shared-nonce');
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws1.once('open', r));
    ws1.send(JSON.stringify({ type: 'join', sessionId, peerId: 'member-x', membershipToken: token, joinProof: proof1 }));
    await waitForMessage(ws1, 'joined');

    // A different peer id (never admitted) presenting the same nonce is blocked
    // by the proof-nonce guard.
    const proof2 = createJoinProof(member, sessionId, 'member-y', 'shared-nonce');
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws2.once('open', r));
    ws2.send(JSON.stringify({ type: 'join', sessionId, peerId: 'member-y', membershipToken: token, joinProof: proof2 }));
    const err = await waitForMessage(ws2, 'error');
    expect(err.code).toBe('INVALID_MEMBERSHIP');
    ws1.close();
    ws2.close();
  });

  it('destroying a session should close all sockets', async () => {
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Destroy', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all([new Promise(r => ws1.once('open', r)), new Promise(r => ws2.once('open', r))]);
    ws1.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(ws1, 'joined');
    ws2.send(JSON.stringify({ type: 'join', sessionId, peerId: 'peer-x' }));
    await waitForMessage(ws2, 'pending');
    const closePromise1 = new Promise<void>((resolve) => ws1.once('close', () => resolve()));
    const closePromise2 = new Promise<void>((resolve) => ws2.once('close', () => resolve()));
    // destroy via API
    const del = await (await import('supertest')).default(app).delete(`/api/sessions/${sessionId}`).set('x-host-token', hostRecoveryToken);
    expect(del.status).toBe(204);
    // both sockets should receive close event
    await Promise.all([closePromise1, closePromise2]);
  });

  // ─── P1c: Control-frame authority + lifecycle ──────────────────────────

  describe('control-frame authority', () => {
    it('reject_join: host can reject a pending peer', { timeout: 15000 }, async () => {
      const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Reject', expiresInSeconds: 600 });
      const { sessionId, hostId, hostRecoveryToken } = res.body;

      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => hostWs.once('open', r));
      hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
      await waitForMessage(hostWs, 'joined');

      const guestWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => guestWs.once('open', r));

      // Set up listeners BEFORE sending join (race condition: join_request
      // from host may arrive before we set up the handler)
      const hostReqPromise = waitForMessage(hostWs, 'join_request');
      const guestPendingPromise = waitForMessage(guestWs, 'pending');
      const guestClosePromise = new Promise<void>((resolve) => guestWs.once('close', () => resolve()));
      const guestErrorPromise = waitForMessage(guestWs, 'error');

      guestWs.send(JSON.stringify({ type: 'join', sessionId, peerId: 'guest' }));
      await guestPendingPromise;

      const hostReq = await hostReqPromise;
      expect(hostReq.peerId).toBe('guest');

      hostWs.send(JSON.stringify({ type: 'reject_join', peerId: 'guest' }));
      const err = await guestErrorPromise;
      expect(err.message).toContain('rejected');
      await guestClosePromise;
      expect(guestWs.readyState).toBe(WebSocket.CLOSED);
      hostWs.close();
    });

    it('kick_peer: host can kick a peer from a group session', { timeout: 15000 }, async () => {
      const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Kick', expiresInSeconds: 600 });
      const { sessionId, hostId, hostRecoveryToken } = res.body;

      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => hostWs.once('open', r));
      hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
      await waitForMessage(hostWs, 'joined');

      // Need 3 participants for isGroup=true (participantCount > 2)
      const peerA = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const peerB = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await Promise.all([
        new Promise((r) => peerA.once('open', r)),
        new Promise((r) => peerB.once('open', r)),
      ]);
      peerA.send(JSON.stringify({ type: 'join', sessionId, peerId: 'a' }));
      await waitForMessage(peerA, 'pending');
      hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'a' }));
      await waitForMessage(peerA, 'joined');

      peerB.send(JSON.stringify({ type: 'join', sessionId, peerId: 'b' }));
      await waitForMessage(peerB, 'pending');
      hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'b' }));
      await waitForMessage(peerB, 'joined');

      // Host kicks peer B
      const closePromise = new Promise<void>((resolve) => peerB.once('close', () => resolve()));
      hostWs.send(JSON.stringify({ type: 'kick_peer', peerId: 'b' }));
      const err = await waitForMessage(peerB, 'error');
      expect(err.message).toContain('kicked');
      await closePromise;
      expect(peerB.readyState).toBe(WebSocket.CLOSED);

      hostWs.close();
      peerA.close();
    });

    it('kick_peer sends peer_update to remaining peers after kick', { timeout: 15000 }, async () => {
      const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Kick2', expiresInSeconds: 600 });
      const { sessionId, hostId, hostRecoveryToken } = res.body;

      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const peerA = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const peerB = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await Promise.all([
        new Promise((r) => hostWs.once('open', r)),
        new Promise((r) => peerA.once('open', r)),
        new Promise((r) => peerB.once('open', r)),
      ]);
      hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
      await waitForMessage(hostWs, 'joined');

      peerA.send(JSON.stringify({ type: 'join', sessionId, peerId: 'a' }));
      await waitForMessage(peerA, 'pending');
      hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'a' }));
      await waitForMessage(peerA, 'joined');

      peerB.send(JSON.stringify({ type: 'join', sessionId, peerId: 'b' }));
      await waitForMessage(peerB, 'pending');
      hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'b' }));
      await waitForMessage(peerB, 'joined');

      // Set up listeners BEFORE kick (race: peer_update may arrive
      // before we set up the handler after waiting for error/close)
      const peerUpdatePromise = waitForMessage(peerB, 'peer_update');
      const peerErrorPromise = waitForMessage(peerA, 'error');
      const kickClose = new Promise<void>((resolve) => peerA.once('close', () => resolve()));

      hostWs.send(JSON.stringify({ type: 'kick_peer', peerId: 'a' }));
      await peerErrorPromise;
      await kickClose;

      // Peer B should receive a peer_update without 'a'
      const update = await peerUpdatePromise;
      expect(update.peers).not.toContain('a');
      expect(update.peers).toContain(hostId);
      expect(update.peers).toContain('b');

      hostWs.close();
      peerB.close();
    });

    it('non-host cannot issue accept_join, reject_join, or kick_peer', async () => {
      const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'AuthGuard', expiresInSeconds: 600 });
      const { sessionId, hostId, hostRecoveryToken } = res.body;

      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const peerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const guestWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await Promise.all([
        new Promise((r) => hostWs.once('open', r)),
        new Promise((r) => peerWs.once('open', r)),
        new Promise((r) => guestWs.once('open', r)),
      ]);

      hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
      await waitForMessage(hostWs, 'joined');

      peerWs.send(JSON.stringify({ type: 'join', sessionId, peerId: 'peer-x' }));
      await waitForMessage(peerWs, 'pending');
      hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'peer-x' }));
      await waitForMessage(peerWs, 'joined');

      guestWs.send(JSON.stringify({ type: 'join', sessionId, peerId: 'guest' }));
      await waitForMessage(guestWs, 'pending');

      // peer-x tries to accept guest — silently ignored (not host)
      peerWs.send(JSON.stringify({ type: 'accept_join', peerId: 'guest' }));
      // Guest should still be pending — no joined message arrives
      const guestMsg = await Promise.race([
        waitForMessage(guestWs, 'joined').then(() => 'joined'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000)),
      ]);
      expect(guestMsg).toBe('timeout');

      // peer-x tries to reject guest — silently ignored
      peerWs.send(JSON.stringify({ type: 'reject_join', peerId: 'guest' }));
      // Guest should not get error
      const guestMsg2 = await Promise.race([
        waitForMessage(guestWs, 'error').then(() => 'error'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000)),
      ]);
      expect(guestMsg2).toBe('timeout');

      // peer-x tries to kick host — silently ignored
      peerWs.send(JSON.stringify({ type: 'kick_peer', peerId: hostId }));
      // host should not be kicked
      expect(hostWs.readyState).toBe(WebSocket.OPEN);

      hostWs.close();
      peerWs.close();
      guestWs.close();
    });

    it('kick_peer in a 2-peer session is refused (not a group)', async () => {
      const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'TwoPeer', expiresInSeconds: 600 });
      const { sessionId, hostId, hostRecoveryToken } = res.body;

      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const peerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await Promise.all([
        new Promise((r) => hostWs.once('open', r)),
        new Promise((r) => peerWs.once('open', r)),
      ]);
      hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
      await waitForMessage(hostWs, 'joined');

      peerWs.send(JSON.stringify({ type: 'join', sessionId, peerId: 'peer-1' }));
      await waitForMessage(peerWs, 'pending');
      hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'peer-1' }));
      await waitForMessage(peerWs, 'joined');

      // 2 peers — host tries to kick peer-1. Should be refused (session.isGroup is false)
      hostWs.send(JSON.stringify({ type: 'kick_peer', peerId: 'peer-1' }));
      // Peer should NOT be kicked (no error message)
      const peerMsg = await Promise.race([
        waitForMessage(peerWs, 'error').then(() => 'error'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000)),
      ]);
      expect(peerMsg).toBe('timeout');
      expect(peerWs.readyState).toBe(WebSocket.OPEN);

      hostWs.close();
      peerWs.close();
    });

    it('host cannot be kicked', async () => {
      const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'KickHost', expiresInSeconds: 600 });
      const { sessionId, hostId, hostRecoveryToken } = res.body;

      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => hostWs.once('open', r));
      hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
      await waitForMessage(hostWs, 'joined');

      // Add two peers to make it a group (isGroup = true when participantCount > 2)
      const peerA = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const peerB = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await Promise.all([
        new Promise((r) => peerA.once('open', r)),
        new Promise((r) => peerB.once('open', r)),
      ]);
      peerA.send(JSON.stringify({ type: 'join', sessionId, peerId: 'a' }));
      await waitForMessage(peerA, 'pending');
      hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'a' }));
      await waitForMessage(peerA, 'joined');

      peerB.send(JSON.stringify({ type: 'join', sessionId, peerId: 'b' }));
      await waitForMessage(peerB, 'pending');
      hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'b' }));
      await waitForMessage(peerB, 'joined');

      // Peer A tries to kick host — silently ignored
      peerA.send(JSON.stringify({ type: 'kick_peer', peerId: hostId }));
      // Host should NOT be kicked
      const hostMsg = await Promise.race([
        waitForMessage(hostWs, 'error').then(() => 'error'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000)),
      ]);
      expect(hostMsg).toBe('timeout');
      expect(hostWs.readyState).toBe(WebSocket.OPEN);

      hostWs.close();
      peerA.close();
      peerB.close();
    });

    it('PING is echoed as PONG to sender only, not relayed to peers', async () => {
      const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'PingPong', expiresInSeconds: 600 });
      const { sessionId, hostId, hostRecoveryToken } = res.body;

      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const peerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await Promise.all([
        new Promise((r) => hostWs.once('open', r)),
        new Promise((r) => peerWs.once('open', r)),
      ]);

      hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
      await waitForMessage(hostWs, 'joined');

      peerWs.send(JSON.stringify({ type: 'join', sessionId, peerId: 'peer-1' }));
      await waitForMessage(peerWs, 'pending');
      hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'peer-1' }));
      await waitForMessage(peerWs, 'joined');

      // Host sends a PING
      hostWs.send(JSON.stringify({
        sessionId, from: hostId, type: 'ping', timestamp: Date.now(), nonce: 'ping-1', payload: '',
      }));

      const pong = await waitForMessage(hostWs, 'pong');
      expect(pong.nonce).toBe('ping-1');
      expect(pong.from).toBe('server');

      // Peer should NOT receive a ping or pong
      const peerMsg = await Promise.race([
        waitForMessage(peerWs, 'ping').then(() => 'ping'),
        waitForMessage(peerWs, 'pong').then(() => 'pong'),
        new Promise((resolve) => setTimeout(() => resolve('none'), 1000)),
      ]);
      expect(peerMsg).toBe('none');

      hostWs.close();
      peerWs.close();
    });

    it('join timeout: socket that does not send join within JOIN_TIMEOUT_MS is closed', { timeout: 15000 }, async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => ws.once('open', r));

      const closePromise = new Promise<number>((resolve) => {
        ws.once('close', (code) => resolve(code));
      });

      const code = await closePromise;
      expect(code).toBe(1008);
      // Socket should not be open
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    });

    it('pending-peer overflow: 11th guest is rejected when MAX_PENDING_PEERS reached', async () => {
      const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Overflow', expiresInSeconds: 600 });
      const { sessionId, hostId, hostRecoveryToken } = res.body;

      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => hostWs.once('open', r));
      hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
      await waitForMessage(hostWs, 'joined');

      // Fill to MAX_PENDING_PEERS (10)
      const guests: WebSocket[] = [];
      for (let i = 0; i < 10; i++) {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await new Promise((r) => ws.once('open', r));
        ws.send(JSON.stringify({ type: 'join', sessionId, peerId: `guest-${i}` }));
        await waitForMessage(ws, 'pending');
        guests.push(ws);
      }

      // 11th guest should be rejected
      const ws11 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => ws11.once('open', r));
      ws11.send(JSON.stringify({ type: 'join', sessionId, peerId: 'guest-10' }));
      const err = await waitForMessage(ws11, 'error');
      expect(err.message).toContain('Too many pending');

      // Cleanup
      hostWs.close();
      for (const g of guests) g.close();
      ws11.close();
    }, 15000);

    it('peer-token rejoin: disconnected peer can rejoin with its peer token', async () => {
      const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Rejoin', expiresInSeconds: 600 });
      const { sessionId, hostId, hostRecoveryToken } = res.body;

      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => hostWs.once('open', r));
      hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
      await waitForMessage(hostWs, 'joined');

      const peerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => peerWs.once('open', r));
      peerWs.send(JSON.stringify({ type: 'join', sessionId, peerId: 'p1' }));
      await waitForMessage(peerWs, 'pending');

      hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'p1' }));
      const joined = await waitForMessage(peerWs, 'joined');
      const peerToken = joined.peerToken;
      expect(peerToken).toBeDefined();

      // Disconnect
      peerWs.close();

      // Rejoin with the peer token
      const peerWs2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => peerWs2.once('open', r));
      peerWs2.send(JSON.stringify({ type: 'join', sessionId, peerId: 'p1', peerToken }));
      const rejoined = await waitForMessage(peerWs2, 'joined');
      expect(rejoined.peerToken).toBeDefined();

      hostWs.close();
      peerWs2.close();
    });

    it('host-recovery reclaim: second socket with recovery token takes host identity', async () => {
      const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Recovery', expiresInSeconds: 600 });
      const { sessionId, hostId, hostRecoveryToken } = res.body;

      // Host joins
      const hostWs1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => hostWs1.once('open', r));
      hostWs1.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
      const joined1 = await waitForMessage(hostWs1, 'joined');
      expect(joined1.isHost).toBe(true);

      // Second socket claims host with recovery token — moves host identity
      const hostWs2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => hostWs2.once('open', r));
      hostWs2.send(JSON.stringify({ type: 'join', sessionId, peerId: 'host-v2', hostRecoveryToken }));
      const joined2 = await waitForMessage(hostWs2, 'joined');
      expect(joined2.isHost).toBe(true);
      expect(joined2.peerId).toBe('host-v2');

      // Original host socket still open but is no longer host (its peer mapping was removed)
      hostWs1.close();
      hostWs2.close();
    });
  });

  // ─── P1d: Socket-level frame rate limit ────────────────────────────────

  it('socket-level rate limit: burst of control frames trips SOCKET_MSG_PER_SECOND_LIMIT', async () => {
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'SockRate', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => hostWs.once('open', r));
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    // Burst of control frames (accept_join for a fake peer) to trip SOCKET_MSG_PER_SECOND_LIMIT (20)
    for (let i = 0; i < 100; i++) {
      hostWs.send(JSON.stringify({ type: 'accept_join', peerId: `fake-${i}` }));
    }

    const err = await waitForMessage(hostWs, 'error');
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    hostWs.close();
  });

  // The host peer record was created with no token, so safeEqual(undefined)
  // failed and the request fell through to stale-socket recovery. With the
  // host's socket gone, that path re-admitted the caller AS the host.
  it('refuses to hand host authority to a peer that only knows the public hostId', async () => {
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Takeover', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => hostWs.once('open', r));
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    // Host drops off; its socket is no longer registered.
    await new Promise<void>((r) => { hostWs.once('close', () => r()); hostWs.close(); });
    await new Promise((r) => setTimeout(r, 50));

    const attackerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => attackerWs.once('open', r));
    attackerWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId }));

    const outcome = await new Promise<any>((resolve) => {
      attackerWs.on('message', (data: any) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'joined' || parsed.type === 'error') resolve(parsed);
      });
    });

    expect(outcome.type).toBe('error');
    expect(outcome.isHost).toBeUndefined();
    attackerWs.close();
  });

  it('refuses a prototype-polluting peerId instead of bypassing the peer limit', async () => {
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Proto', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => hostWs.once('open', r));
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    const evilWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => evilWs.once('open', r));
    evilWs.send(JSON.stringify({ type: 'join', sessionId, peerId: '__proto__' }));
    const err = await waitForMessage(evilWs, 'error');
    expect(err.code).toBe('INVALID_PEER_ID');

    // The session object must be untouched by the attempt.
    const info = await (await import('supertest')).default(app).get(`/api/sessions/${sessionId}`);
    expect(info.body.participantCount).toBe(1);

    hostWs.close();
    evilWs.close();
  });

  it('rejects an oversized peerId', async () => {
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'BigId', expiresInSeconds: 600 });
    const { sessionId } = res.body;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'join', sessionId, peerId: 'x'.repeat(5000) }));
    const err = await waitForMessage(ws, 'error');
    expect(err.code).toBe('INVALID_PEER_ID');
    ws.close();
  });
});
