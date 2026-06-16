import { describe, it, expect } from 'vitest';
import {
  generateKemKeyPair,
  kemEncapsulate,
  kemDecapsulate,
  combineHybridSecret,
  KEM_PUBLIC_KEY_BYTES,
  KEM_CIPHERTEXT_BYTES,
  KEM_SHARED_SECRET_BYTES,
} from '../../src/crypto/hybrid-kem';
import { bytesEqual } from '../../src/crypto/noise-primitives';

function fill(byte: number, len = 32): Uint8Array {
  return new Uint8Array(len).fill(byte);
}

describe('ML-KEM-768 encapsulation', () => {
  it('round-trips a shared secret with the documented sizes', () => {
    const kp = generateKemKeyPair();
    expect(kp.publicKey.length).toBe(KEM_PUBLIC_KEY_BYTES);

    const { ciphertext, sharedSecret } = kemEncapsulate(kp.publicKey);
    expect(ciphertext.length).toBe(KEM_CIPHERTEXT_BYTES);
    expect(sharedSecret.length).toBe(KEM_SHARED_SECRET_BYTES);

    const recovered = kemDecapsulate(kp.secretKey, ciphertext);
    expect(bytesEqual(sharedSecret, recovered)).toBe(true);
  });

  it('rejects malformed public keys and ciphertexts', () => {
    expect(() => kemEncapsulate(fill(1, 10))).toThrow('KEM_BAD_PUBLIC_KEY');
    const kp = generateKemKeyPair();
    expect(() => kemDecapsulate(kp.secretKey, fill(1, 10))).toThrow('KEM_BAD_CIPHERTEXT');
  });
});

describe('combineHybridSecret', () => {
  it('produces a deterministic 32-byte root', () => {
    const out1 = combineHybridSecret(fill(0x11), fill(0x22));
    const out2 = combineHybridSecret(fill(0x11), fill(0x22));
    expect(out1.length).toBe(32);
    expect(bytesEqual(out1, out2)).toBe(true);
  });

  it('depends on both contributions', () => {
    const base = combineHybridSecret(fill(0x11), fill(0x22));
    const classicalChanged = combineHybridSecret(fill(0x33), fill(0x22));
    const pqChanged = combineHybridSecret(fill(0x11), fill(0x44));
    expect(bytesEqual(base, classicalChanged)).toBe(false);
    expect(bytesEqual(base, pqChanged)).toBe(false);
  });

  // ACCEPTANCE: a break in one primitive (modeled as zeroing its contribution)
  // must still yield a root with full entropy from the surviving primitive.
  it('stays secret-dependent on ML-KEM when X25519 is zeroed', () => {
    const zero = fill(0x00);
    const a = combineHybridSecret(zero, fill(0xaa));
    const b = combineHybridSecret(zero, fill(0xbb));
    // Different PQ secrets → different roots even with no classical entropy.
    expect(bytesEqual(a, b)).toBe(false);
    // And the zeroed-classical root differs from the full hybrid root.
    expect(bytesEqual(a, combineHybridSecret(fill(0xcc), fill(0xaa)))).toBe(false);
  });

  it('stays secret-dependent on X25519 when ML-KEM is zeroed', () => {
    const zero = fill(0x00);
    const a = combineHybridSecret(fill(0xaa), zero);
    const b = combineHybridSecret(fill(0xbb), zero);
    expect(bytesEqual(a, b)).toBe(false);
    expect(bytesEqual(a, combineHybridSecret(fill(0xaa), fill(0xcc)))).toBe(false);
  });

  it('is not symmetric in its arguments (domain separation by position)', () => {
    const ab = combineHybridSecret(fill(0x11), fill(0x22));
    const ba = combineHybridSecret(fill(0x22), fill(0x11));
    expect(bytesEqual(ab, ba)).toBe(false);
  });

  it('matches across the two real KEM endpoints', () => {
    const kp = generateKemKeyPair();
    const { ciphertext, sharedSecret } = kemEncapsulate(kp.publicKey);
    const peerSecret = kemDecapsulate(kp.secretKey, ciphertext);

    const classical = fill(0x5a);
    const initiatorRoot = combineHybridSecret(classical, sharedSecret);
    const responderRoot = combineHybridSecret(classical, peerSecret);
    expect(bytesEqual(initiatorRoot, responderRoot)).toBe(true);
  });
});
