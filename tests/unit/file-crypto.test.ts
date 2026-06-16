import { describe, it, expect } from 'vitest';
import { encryptFileData, decryptFileData, FileCipher } from '../../src/file-crypto';
import { fromBase64, toBase64 } from '../../src/crypto/noise-primitives';

const ciphers: FileCipher[] = ['AES-GCM', 'ChaCha20-Poly1305'];

describe('file-crypto password layer', () => {
  for (const algo of ciphers) {
    it(`${algo}: round-trips with the correct password`, async () => {
      const plaintext = new TextEncoder().encode('top secret video bytes');
      const { data, lock } = await encryptFileData(plaintext, 'hunter2', algo);
      expect(lock.algo).toBe(algo);
      const out = await decryptFileData(data, lock, 'hunter2');
      expect(out).not.toBeNull();
      expect(new TextDecoder().decode(out!)).toBe('top secret video bytes');
    });

    it(`${algo}: returns null for a wrong password`, async () => {
      const { data, lock } = await encryptFileData(new Uint8Array([1, 2, 3]), 'correct', algo);
      expect(await decryptFileData(data, lock, 'wrong')).toBeNull();
    });

    it(`${algo}: returns null when the ciphertext is tampered`, async () => {
      const plaintext = new Uint8Array([9, 9, 9, 9]);
      const { data, lock } = await encryptFileData(plaintext, 'pw', algo);
      // Decode to raw ciphertext, flip a byte, re-encode – guarantees the
      // binary ciphertext bytes differ so the AEAD tag cannot match.
      const raw = fromBase64(data);
      raw[0] ^= 0x01;
      const corrupted = toBase64(raw);
      expect(await decryptFileData(corrupted, lock, 'pw')).toBeNull();
    });
  }

  it('uses a fresh salt and IV per encryption', async () => {
    const a = await encryptFileData(new Uint8Array([1]), 'pw', 'AES-GCM');
    const b = await encryptFileData(new Uint8Array([1]), 'pw', 'AES-GCM');
    expect(a.lock.salt).not.toBe(b.lock.salt);
    expect(a.lock.iv).not.toBe(b.lock.iv);
    expect(a.data).not.toBe(b.data);
  });
});
