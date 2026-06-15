import { describe, it, expect } from 'vitest';
import { padPlaintext, unpadPlaintext } from '../../src/crypto/message-padding';

const BUCKETS = [8 * 1024, 64 * 1024, 512 * 1024, 4 * 1024 * 1024];

function bytes(n: number, fill = 0x41): Uint8Array {
  return new Uint8Array(n).fill(fill);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

describe('message-padding', () => {
  it('pads a tiny and a multi-KB message to the SAME bucket size', () => {
    const small = padPlaintext(bytes(5));
    const text4k = padPlaintext(bytes(4 * 1024));
    expect(small.length).toBe(BUCKETS[0]);
    expect(text4k.length).toBe(BUCKETS[0]);
    expect(small.length).toBe(text4k.length);
  });

  it('round-trips exact bytes with padding stripped', () => {
    const original = new TextEncoder().encode('the quick brown fox');
    const recovered = unpadPlaintext(padPlaintext(original));
    expect(Array.from(recovered)).toEqual(Array.from(original));
    expect(bytesEqual(recovered, original)).toBe(true);
  });

  it('round-trips an empty payload', () => {
    expect(unpadPlaintext(padPlaintext(new Uint8Array(0))).length).toBe(0);
  });

  it('round-trips across every bucket boundary', () => {
    // One byte under, exactly on, and one over each tier's framed capacity.
    const probes = BUCKETS.flatMap(b => [b - 4 - 1, b - 4, b - 4 + 1]);
    for (const len of probes) {
      const original = bytes(len, (len % 251) || 1);
      const padded = padPlaintext(original);
      expect(padded.length).toBeGreaterThanOrEqual(4 + len);
      const recovered = unpadPlaintext(padded);
      expect(recovered.length).toBe(len);
      expect(bytesEqual(recovered, original)).toBe(true);
    }
  });

  it('selects the smallest tier that fits the framed content', () => {
    expect(padPlaintext(bytes(BUCKETS[0] - 4)).length).toBe(BUCKETS[0]);
    expect(padPlaintext(bytes(BUCKETS[0] - 4 + 1)).length).toBe(BUCKETS[1]);
    expect(padPlaintext(bytes(BUCKETS[1])).length).toBe(BUCKETS[2]);
  });

  it('does not pad content larger than the top tier (clamp)', () => {
    const huge = bytes(BUCKETS[3] + 1024);
    const padded = padPlaintext(huge);
    expect(padded.length).toBe(4 + huge.length);
    expect(bytesEqual(unpadPlaintext(padded), huge)).toBe(true);
  });

  it('rejects a truncated or corrupt header', () => {
    expect(() => unpadPlaintext(new Uint8Array(2))).toThrow();
    const bogus = new Uint8Array(16);
    new DataView(bogus.buffer).setUint32(0, 9999, false);
    expect(() => unpadPlaintext(bogus)).toThrow();
  });
});
