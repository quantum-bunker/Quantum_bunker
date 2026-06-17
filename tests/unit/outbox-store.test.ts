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

  it('filters pending by an explicit recipient, always including wildcards', async () => {
    await outbox.enqueue({ nonce: 'w', to: WILDCARD_RECIPIENT, type: EnvelopeType.NOISE_MESSAGE, plaintext: 'any', timestamp: 1 });
    await outbox.enqueue({ nonce: 'a', to: 'peer-a', type: EnvelopeType.NOISE_MESSAGE, plaintext: 'for a', timestamp: 2 });
    await outbox.enqueue({ nonce: 'b', to: 'peer-b', type: EnvelopeType.NOISE_MESSAGE, plaintext: 'for b', timestamp: 3 });

    const forA = await outbox.pending('peer-a');
    expect(forA.map(e => e.nonce)).toEqual(['w', 'a']); // wildcard + addressed, in timestamp order
    expect(await outbox.pending()).toHaveLength(3); // no filter → everything
  });

  it('increments attempts each time an entry is drained', async () => {
    await outbox.enqueue(entry('retry', 'flaky'));
    await outbox.drain(() => true, { sleep: noSleep });
    expect((await outbox.pending())[0].attempts).toBe(1);
    await outbox.drain(() => true, { sleep: noSleep });
    expect((await outbox.pending())[0].attempts).toBe(2);
  });

  it('stops draining at the first entry with no live path, preserving the rest', async () => {
    await outbox.enqueue(entry('n1', 'first', 1));
    await outbox.enqueue(entry('n2', 'second', 2));
    await outbox.enqueue(entry('n3', 'third', 3));
    const seen: string[] = [];
    const count = await outbox.drain(e => {
      seen.push(e.nonce);
      return e.nonce !== 'n2'; // transport drops mid-flush
    }, { sleep: noSleep });
    expect(count).toBe(1); // only n1 sent
    expect(seen).toEqual(['n1', 'n2']); // n2 attempted then aborted; n3 never tried
    expect((await outbox.pending())).toHaveLength(3); // nothing removed — ack does that
  });

  it('supports an async send callback', async () => {
    await outbox.enqueue(entry('async-1', 'x'));
    const count = await outbox.drain(async () => Promise.resolve(true), { sleep: noSleep });
    expect(count).toBe(1);
  });

  it('clear() empties the queue', async () => {
    await outbox.enqueue(entry('c1', 'gone'));
    await outbox.enqueue(entry('c2', 'gone too'));
    await outbox.clear();
    expect(await outbox.pending()).toHaveLength(0);
  });

  it('drains nothing when the queue is empty (no spacer sleeps)', async () => {
    const waits: number[] = [];
    const count = await outbox.drain(() => true, { sleep: async ms => { waits.push(ms); } });
    expect(count).toBe(0);
    expect(waits).toEqual([]);
  });

  it('persists across a reopen with the same secret (sealed at rest, decryptable)', async () => {
    await outbox.enqueue(entry('survivor', 'still here'));
    const reopened = await MessageOutbox.open(SESSION, SECRET, backend);
    const pending = await reopened.pending();
    expect(pending.map(e => e.nonce)).toEqual(['survivor']);
    expect(pending[0].plaintext).toBe('still here');
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
