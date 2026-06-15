import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { Application } from 'express';
import { setupApp } from '../../server';
import { PeerChannels, NoiseFrame } from '../../src/crypto/peer-channels';
import { toBase64, fromBase64 } from '../../src/crypto/noise-primitives';
import { encodeFileAttachment, decodeFileAttachment, FileAttachment } from '../../src/file-transfer';
import { EnvelopeType } from '../../src/shared/contracts/v1/envelope';
import { DomainEvent } from '../../src/shared/contracts/v1/events';

// Zero-knowledge invariant lock (CLAUDE.md domain rule #1): a FILE envelope is
// encrypted end-to-end before it reaches the relay. The server must forward an
// opaque ciphertext frame and may log only metadata — never the file's
// plaintext bytes or its name. This test sends a FILE whose cleartext carries a
// unique sentinel string and a known byte pattern, then proves neither leaks
// into the relayed frame or into anything the server logs, while the receiving
// peer still recovers the exact plaintext after decryption.

const EVENT_TYPES = [
  'SessionCreated',
  'PeerJoined',
  'PeerDisconnected',
  'MessageRelayed',
  'SessionExpired',
  'SessionClosed',
  'EnvelopeRejected',
] as const;

describe('FILE relay zero-knowledge guarantee', () => {
  let app: Application;
  let server: any;
  let container: any;
  let cleanupInterval: any;
  let port: number;

  beforeAll(async () => {
    const setup = await setupApp();
    app = setup.app;
    server = setup.server;
    container = setup.container;
    cleanupInterval = setup.cleanupInterval;
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

  const waitForMessage = (ws: WebSocket, type: string): Promise<any> =>
    new Promise((resolve) => {
      const handler = (data: any) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === type) {
          ws.off('message', handler);
          resolve(parsed);
        }
      };
      ws.on('message', handler);
    });

  // Captures the raw, unparsed frame text the server pushes to a peer.
  const captureRawFrame = (ws: WebSocket, type: string): Promise<string> =>
    new Promise((resolve) => {
      const handler = (data: any) => {
        const raw = data.toString();
        if (JSON.parse(raw).type === type) {
          ws.off('message', handler);
          resolve(raw);
        }
      };
      ws.on('message', handler);
    });

  it('never forwards or logs FILE plaintext, yet the peer decrypts it exactly', async () => {
    // ── Session + two-peer admission over the real store/Express/WS ──────────
    const res = await request(app)
      .post('/api/sessions')
      .send({ name: 'ZK File', expiresInSeconds: 600 });
    expect(res.status).toBe(201);
    const { sessionId, hostId, hostRecoveryToken } = res.body;
    const guestId = 'guest-zk';

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const guestWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all([
      new Promise((r) => hostWs.once('open', r)),
      new Promise((r) => guestWs.once('open', r)),
    ]);

    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    guestWs.send(JSON.stringify({ type: 'join', sessionId, peerId: guestId }));
    await waitForMessage(guestWs, 'pending');
    hostWs.send(JSON.stringify({ type: 'accept_join', peerId: guestId }));
    await waitForMessage(guestWs, 'joined');

    // ── Real Noise/double-ratchet handshake between the two peers ────────────
    // The handshake itself is client-side crypto exchanged out of band of this
    // assertion (mirrors the SIGNALING path); we wire the two managers directly.
    const channels: Record<string, PeerChannels> = {};
    for (const id of [hostId, guestId]) {
      channels[id] = new PeerChannels({
        sessionId,
        selfId: id,
        sendNoise: (to: string, frame: NoiseFrame) => channels[to]?.onSignal(id, frame),
      });
    }
    channels[hostId].ensureChannel(guestId);
    channels[guestId].ensureChannel(hostId);
    expect(channels[hostId].isReady(guestId)).toBe(true);
    expect(channels[guestId].isReady(hostId)).toBe(true);

    // ── Build a FILE whose cleartext carries a unique sentinel + byte pattern ─
    const sentinel = `PLAINTEXT_CANARY_${randomUUID()}`;
    const marker = new TextEncoder().encode(sentinel);
    const pattern = new Uint8Array(512);
    for (let i = 0; i < pattern.length; i++) pattern[i] = [0xde, 0xad, 0xbe, 0xef][i % 4];
    const rawBytes = new Uint8Array(marker.length + pattern.length);
    rawBytes.set(marker, 0);
    rawBytes.set(pattern, marker.length);
    const rawDataB64 = toBase64(rawBytes);

    const attachment: FileAttachment = {
      name: `${sentinel}.bin`,
      mime: 'application/octet-stream',
      size: rawBytes.length,
      data: rawDataB64,
    };

    // Mirror the production sendFile wire format exactly (useRelay.ts).
    const inner = encodeFileAttachment(attachment);
    const wirePayload = JSON.stringify(channels[hostId].encryptForAll(inner));
    const nonce = randomUUID();
    const envelope = {
      sessionId,
      from: hostId,
      type: EnvelopeType.FILE,
      timestamp: Date.now(),
      nonce,
      payload: wirePayload,
    };

    // ── Capture what the server logs (event bus is the only logging source) ──
    const loggedEvents: DomainEvent[] = [];
    const collect = (e: DomainEvent) => loggedEvents.push(e);
    for (const t of EVENT_TYPES) container.eventBus.on(t, collect);

    // Also capture anything the process actually writes to stdout/stderr,
    // covering log statements that bypass the event bus.
    const stdoutWrites: string[] = [];
    const origOut = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    (process.stdout as any).write = (chunk: any, ...rest: any[]) => {
      stdoutWrites.push(chunk.toString());
      return origOut(chunk, ...rest);
    };
    (process.stderr as any).write = (chunk: any, ...rest: any[]) => {
      stdoutWrites.push(chunk.toString());
      return origErr(chunk, ...rest);
    };

    let relayedFrame: string;
    try {
      const framePromise = captureRawFrame(guestWs, EnvelopeType.FILE);
      hostWs.send(JSON.stringify(envelope));
      relayedFrame = await framePromise;
      // Give synchronous log handlers a tick to flush.
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      (process.stdout as any).write = origOut;
      (process.stderr as any).write = origErr;
      for (const t of EVENT_TYPES) container.eventBus.off?.(t, collect);
    }

    // ── 1. The relayed frame leaks no plaintext ──────────────────────────────
    expect(relayedFrame).not.toContain(sentinel);
    expect(relayedFrame).not.toContain(rawDataB64);
    expect(relayedFrame.includes(Buffer.from(pattern).toString('latin1'))).toBe(false);

    // ── 2. Nothing the server logs leaks plaintext ───────────────────────────
    const relayLog = loggedEvents.find((e) => e.type === 'MessageRelayed');
    expect(relayLog).toBeDefined();
    // The relay event may carry only metadata.
    expect(Object.keys(relayLog!.payload).sort()).toEqual(['byteSize', 'envelopeType', 'from']);
    const allLogged = JSON.stringify(loggedEvents) + stdoutWrites.join('');
    expect(allLogged).not.toContain(sentinel);
    expect(allLogged).not.toContain(rawDataB64);

    // ── 3. The receiving peer recovers the cleartext exactly ─────────────────
    const relayedEnvelope = JSON.parse(relayedFrame);
    const recovered = channels[guestId].decryptFrom(hostId, JSON.parse(relayedEnvelope.payload));
    expect(recovered).not.toBeNull();
    const recoveredAtt = decodeFileAttachment(recovered!);
    expect(recoveredAtt).not.toBeNull();
    expect(recoveredAtt!.name).toBe(`${sentinel}.bin`);
    expect(recoveredAtt!.data).toBe(rawDataB64);
    expect(Array.from(fromBase64(recoveredAtt!.data))).toEqual(Array.from(rawBytes));

    hostWs.close();
    guestWs.close();
  });
});
