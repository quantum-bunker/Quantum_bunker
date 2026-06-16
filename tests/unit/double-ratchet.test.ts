import { describe, it, expect } from 'vitest';
import { generateKeyPair } from '@stablelib/x25519';
import { hkdf } from '../../src/crypto/noise-primitives';
import { DoubleRatchet } from '../../src/crypto/double-ratchet';

function sharedChainKey(): Uint8Array {
  const a = generateKeyPair();
  const b = generateKeyPair();
  const [ck] = hkdf(new Uint8Array(32), new Uint8Array(32), 2);
  return ck;
}

function makePair() {
  const aliceKP = generateKeyPair();
  const bobKP = generateKeyPair();
  const ck = sharedChainKey();
  const alice = DoubleRatchet.initAlice(ck, aliceKP, bobKP.publicKey);
  const bob = DoubleRatchet.initBob(ck, bobKP, aliceKP.publicKey);
  return { alice, bob };
}

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe('DoubleRatchet', () => {
  it('alice encrypts, bob decrypts', () => {
    const { alice, bob } = makePair();
    const slot = alice.encrypt(enc('hello'));
    expect(dec(bob.decrypt(slot))).toBe('hello');
  });

  it('multi-message round-trip: alice → bob', () => {
    const { alice, bob } = makePair();
    const messages = ['first', 'second', 'third'];
    const slots = messages.map(m => alice.encrypt(enc(m)));
    for (let i = 0; i < messages.length; i++) {
      expect(dec(bob.decrypt(slots[i]))).toBe(messages[i]);
    }
  });

  it('bidirectional messaging', () => {
    const { alice, bob } = makePair();
    const s1 = alice.encrypt(enc('ping'));
    expect(dec(bob.decrypt(s1))).toBe('ping');

    const s2 = bob.encrypt(enc('pong'));
    expect(dec(alice.decrypt(s2))).toBe('pong');

    const s3 = alice.encrypt(enc('ack'));
    expect(dec(bob.decrypt(s3))).toBe('ack');
  });

  it('bob can send before receiving (proactive DH ratchet)', () => {
    const { alice, bob } = makePair();
    const slot = bob.encrypt(enc('bob goes first'));
    expect(dec(alice.decrypt(slot))).toBe('bob goes first');
  });

  it('out-of-order delivery is handled with skipped message keys', () => {
    const { alice, bob } = makePair();
    const s1 = alice.encrypt(enc('msg1'));
    const s2 = alice.encrypt(enc('msg2'));
    const s3 = alice.encrypt(enc('msg3'));

    // deliver out of order
    expect(dec(bob.decrypt(s3))).toBe('msg3');
    expect(dec(bob.decrypt(s1))).toBe('msg1');
    expect(dec(bob.decrypt(s2))).toBe('msg2');
  });

  it('each message uses a unique key (ciphertext differs)', () => {
    const { alice, bob } = makePair();
    const s1 = alice.encrypt(enc('same plaintext'));
    const s2 = alice.encrypt(enc('same plaintext'));
    expect(s1.ct).not.toBe(s2.ct);
    expect(s1.h.n).toBe(0);
    expect(s2.h.n).toBe(1);
    bob.decrypt(s1);
    bob.decrypt(s2);
  });

  it('header n counter increments monotonically', () => {
    const { alice } = makePair();
    for (let i = 0; i < 5; i++) {
      const slot = alice.encrypt(enc(`msg${i}`));
      expect(slot.h.n).toBe(i);
    }
  });

  it('tampered ciphertext throws DR_DECRYPT_FAILED', () => {
    const { alice, bob } = makePair();
    const slot = alice.encrypt(enc('secret'));
    const tampered = { ...slot, ct: slot.ct.slice(0, -4) + 'XXXX' };
    expect(() => bob.decrypt(tampered)).toThrow('DR_DECRYPT_FAILED');
  });

  it('tampered header (ad) causes decryption failure', () => {
    const { alice, bob } = makePair();
    const slot = alice.encrypt(enc('secret'));
    const tampered = { ...slot, h: { ...slot.h, n: slot.h.n + 1 } };
    expect(() => bob.decrypt(tampered)).toThrow();
  });

  it('skip limit exceeded throws DR_SKIP_LIMIT_EXCEEDED', () => {
    const { alice, bob } = makePair();
    // produce 102 messages; bob gets the last one first, which would require
    // skipping 101 keys (> MAX_SKIP=100)
    const slots = [];
    for (let i = 0; i < 102; i++) slots.push(alice.encrypt(enc(`m${i}`)));
    expect(() => bob.decrypt(slots[101])).toThrow('DR_SKIP_LIMIT_EXCEEDED');
  });

  it('multiple DH ratchet steps maintain correctness', () => {
    const { alice, bob } = makePair();
    for (let round = 0; round < 4; round++) {
      const sa = alice.encrypt(enc(`a${round}`));
      expect(dec(bob.decrypt(sa))).toBe(`a${round}`);
      const sb = bob.encrypt(enc(`b${round}`));
      expect(dec(alice.decrypt(sb))).toBe(`b${round}`);
    }
  });

  it('encrypts binary payloads faithfully', () => {
    const { alice, bob } = makePair();
    const bin = new Uint8Array([0, 1, 127, 128, 255]);
    const slot = alice.encrypt(bin);
    const result = bob.decrypt(slot);
    expect(Array.from(result)).toEqual(Array.from(bin));
  });
});
