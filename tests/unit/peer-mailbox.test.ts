import { describe, it, expect, vi, afterEach } from 'vitest';
import { PeerMailbox } from '../../src/peer-mailbox';
import { EnvelopeType, RelayEnvelope } from '../../src/shared/contracts/v1/envelope';

const ENTRY_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;

function sealed(nonce: string, recipients: string[], type = EnvelopeType.NOISE_MESSAGE): RelayEnvelope {
  return {
    sessionId: 'sess-1',
    from: 'peer-sender',
    type,
    timestamp: Date.now(),
    nonce,
    payload: JSON.stringify({ c: Object.fromEntries(recipients.map(r => [r, { h: 'h', ct: 'ct' }])) }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PeerMailbox recipient extraction', () => {
  it('holds nothing for non-message envelope types (no routing map)', () => {
    const box = new PeerMailbox();
    box.hold(sealed('s1', ['peer-offline'], EnvelopeType.SIGNALING), new Set(['self']));
    box.hold(sealed('a1', ['peer-offline'], EnvelopeType.ACK), new Set(['self']));
    expect(box.size).toBe(0);
  });

  it('holds a FILE envelope for an absent recipient', () => {
    const box = new PeerMailbox();
    box.hold(sealed('f1', ['peer-offline'], EnvelopeType.FILE), new Set(['self']));
    expect(box.size).toBe(1);
    expect(box.release('peer-offline')).toHaveLength(1);
  });

  it('ignores an envelope whose payload is not valid JSON', () => {
    const box = new PeerMailbox();
    const env = { ...sealed('bad', ['x']), payload: 'not-json{' };
    box.hold(env, new Set(['self']));
    expect(box.size).toBe(0);
  });

  it('ignores an envelope whose payload lacks a recipient map', () => {
    const box = new PeerMailbox();
    const env = { ...sealed('nomap', ['x']), payload: JSON.stringify({ something: 'else' }) };
    box.hold(env, new Set(['self']));
    expect(box.size).toBe(0);
  });
});

describe('PeerMailbox release semantics', () => {
  it('returns nothing for a peer that was never an addressed recipient', () => {
    const box = new PeerMailbox();
    box.hold(sealed('m1', ['peer-offline']), new Set(['self']));
    expect(box.release('someone-else')).toEqual([]);
    expect(box.size).toBe(1); // entry untouched
  });

  it('keeps an entry alive until its last absent recipient returns', () => {
    const box = new PeerMailbox();
    box.hold(sealed('m1', ['peer-x', 'peer-y']), new Set(['self']));
    expect(box.size).toBe(1);

    expect(box.release('peer-x')).toHaveLength(1);
    expect(box.size).toBe(1); // peer-y still owed

    expect(box.release('peer-y')).toHaveLength(1);
    expect(box.size).toBe(0); // both delivered → entry dropped
  });

  it('does not replay the same envelope twice to the same returning peer', () => {
    const box = new PeerMailbox();
    box.hold(sealed('m1', ['peer-x', 'peer-y']), new Set(['self']));
    expect(box.release('peer-x')).toHaveLength(1);
    expect(box.release('peer-x')).toEqual([]); // slot already cleared
  });
});

describe('PeerMailbox TTL pruning', () => {
  it('drops entries older than the TTL on the next hold/release', () => {
    vi.useFakeTimers();
    const box = new PeerMailbox();
    box.hold(sealed('old', ['peer-offline']), new Set(['self']));
    expect(box.size).toBe(1);

    vi.advanceTimersByTime(ENTRY_TTL_MS + 1);

    // prune() runs at the top of release(); the stale entry is gone.
    expect(box.release('peer-offline')).toEqual([]);
    expect(box.size).toBe(0);
  });

  it('keeps entries that are still within the TTL window', () => {
    vi.useFakeTimers();
    const box = new PeerMailbox();
    box.hold(sealed('fresh', ['peer-offline']), new Set(['self']));
    vi.advanceTimersByTime(ENTRY_TTL_MS - 1_000);
    expect(box.release('peer-offline')).toHaveLength(1);
  });
});

describe('PeerMailbox capacity bound', () => {
  it('evicts the oldest entry once MAX_ENTRIES is exceeded', () => {
    const box = new PeerMailbox();
    for (let i = 0; i < MAX_ENTRIES; i++) {
      box.hold(sealed(`n${i}`, ['peer-offline']), new Set(['self']));
    }
    expect(box.size).toBe(MAX_ENTRIES);

    box.hold(sealed('overflow', ['peer-offline']), new Set(['self']));
    expect(box.size).toBe(MAX_ENTRIES); // capped, not grown — oldest evicted to make room
  });
});
