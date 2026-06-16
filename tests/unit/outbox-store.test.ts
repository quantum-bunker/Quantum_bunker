import { describe, it, expect, beforeEach } from 'vitest';
import {
  MessageOutbox,
  MemoryOutboxBackend,
  WILDCARD_RECIPIENT,
  FLUSH_INTERVAL_MS,
} from '../../src/outbox-store';
import { PeerMailbox } from '../../src/peer-mailbox';
import { EnvelopeType, RelayEnvelope } from '../../src/shared/contracts/v1/envelope';

const SESSION = 'sess-1';
const SECRET = 'device-noise-identity-secret';
const noSleep = () => Promise.resolve();

function entry(nonce: string, plaintext: string, timestamp = Date.now()) {
  return { nonce, to: WILDCARD_RECIPIENT, type: EnvelopeType.NOISE_MESSAGE, plaintext, timestamp };
}

describe('MessageOutbox', () => {
  let backend: MemoryOutboxBackend;
  let outbox: MessageOutbox;

  beforeEach(async () => {
    backend = new MemoryOutboxBackend();
    outbox = await MessageOutbox.open(SESSION, SECRET, backend);
  });

  it('queues a message and returns it with its original nonce', async () => {
    await outbox.enqueue(entry('nonce-a', 'hello while offline'));
    const pending = await outbox.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].nonce).toBe('nonce-a');
    expect(pending[0].plaintext).toBe('hello while offline');
    expect(pending[0].attempts).toBe(0);
  });

  it('encrypts entries at rest — plaintext never hits the backend', async () => {
    await outbox.enqueue(entry('nonce-secret', 'TOP SECRET PAYLOAD'));
    const raw = await backend.list();
    expect(raw).toHaveLength(1);
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain('TOP SECRET PAYLOAD'); // sealed at rest
    expect(raw[0].nonce).toBe('nonce-secret'); // nonce is the cleartext key — needed for lookup/dedup
  });

  it('cannot be decrypted with the wrong secret', async () => {
    await outbox.enqueue(entry('nonce-b', 'private'));
    const wrong = await MessageOutbox.open(SESSION, 'different-secret', backend);
    expect(await wrong.pending()).toHaveLength(0); // AEAD auth fails → entry skipped
  });

  it('flushes pending entries in timestamp order, preserving nonces', async () => {
    await outbox.enqueue(entry('n2', 'second', 200));
    await outbox.enqueue(entry('n1', 'first', 100));
    const sent: string[] = [];
    const count = await outbox.drain(e => { sent.push(e.nonce); return true; }, { sleep: noSleep });
    expect(count).toBe(2);
    expect(sent).toEqual(['n1', 'n2']);
  });

  it('delivers exactly once across a reconnect (ack removes the entry; dedup drops duplicates)', async () => {
    // Recipient models the peer's client-side nonce dedup (CLAUDE.md rule 5).
    const received = new Set<string>();
    const deliveries: string[] = [];
    const recipientReceive = (nonce: string) => {
      if (received.has(nonce)) return; // duplicate — dropped
      received.add(nonce);
      deliveries.push(nonce);
    };

    await outbox.enqueue(entry('n-once', 'deliver me'));

    // First reconnect: flush, recipient receives, ACK comes back.
    await outbox.drain(e => { recipientReceive(e.nonce); return true; }, { sleep: noSleep });
    await outbox.markDelivered('n-once'); // simulated ACK

    // Second reconnect: nothing left to send.
    const resent = await outbox.drain(e => { recipientReceive(e.nonce); return true; }, { sleep: noSleep });

    expect(resent).toBe(0);
    expect(deliveries).toEqual(['n-once']);
    expect(await outbox.pending()).toHaveLength(0);
  });

  it('keeps the queue intact when no transport is available', async () => {
    await outbox.enqueue(entry('n-stuck', 'no path'));
    const count = await outbox.drain(() => false, { sleep: noSleep }); // no live path
    expect(count).toBe(0);
    expect(await outbox.pending()).toHaveLength(1);
  });

  it('throttles flush to respect MSG_PER_SECOND_LIMIT', async () => {
    expect(FLUSH_INTERVAL_MS).toBe(100); // 1000 / 10
    await outbox.enqueue(entry('a', '1', 1));
    await outbox.enqueue(entry('b', '2', 2));
    await outbox.enqueue(entry('c', '3', 3));
    const waits: number[] = [];
    await outbox.drain(() => true, { sleep: async (ms: number) => { waits.push(ms); } });
    // One spacer between each of three sends → two waits at the interval.
    expect(waits).toEqual([FLUSH_INTERVAL_MS, FLUSH_INTERVAL_MS]);
  });
});

describe('PeerMailbox (tier-2 carry/forward)', () => {
  const sealed = (nonce: string, recipients: string[]): RelayEnvelope => ({
    sessionId: SESSION,
    from: 'peer-sender',
    type: EnvelopeType.NOISE_MESSAGE,
    timestamp: Date.now(),
    nonce,
    payload: JSON.stringify({ c: Object.fromEntries(recipients.map(r => [r, { h: 'h', ct: 'ct' }])) }),
  });

  it('holds an envelope for an absent recipient and replays it on return', () => {
    const box = new PeerMailbox();
    box.hold(sealed('m1', ['peer-online', 'peer-offline']), new Set(['peer-online', 'self']));
    expect(box.size).toBe(1);

    const replay = box.release('peer-offline');
    expect(replay).toHaveLength(1);
    expect(replay[0].nonce).toBe('m1');
    expect(box.size).toBe(0); // no absent recipients left
  });

  it('holds nothing when every recipient is already present', () => {
    const box = new PeerMailbox();
    box.hold(sealed('m2', ['peer-a', 'peer-b']), new Set(['peer-a', 'peer-b']));
    expect(box.size).toBe(0);
  });

  it('never exposes plaintext — it only routes opaque slots', () => {
    const box = new PeerMailbox();
    const env = sealed('m3', ['peer-offline']);
    box.hold(env, new Set(['self']));
    const [replayed] = box.release('peer-offline');
    expect(replayed.payload).toBe(env.payload); // forwarded byte-for-byte, still encrypted
  });
});
