import { ChaCha20Poly1305, TAG_LENGTH } from '@stablelib/chacha20poly1305';
import { HKDF } from '@stablelib/hkdf';
import { SHA256, hash } from '@stablelib/sha256';

export const HASHLEN = 32;
export const DHLEN = 32;
export const KEYLEN = 32;
export const EMPTY = new Uint8Array(0);

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function fromUtf8(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function sha256(data: Uint8Array): Uint8Array {
  return hash(data);
}

// Noise HKDF: derives `outputs` (2 or 3) keys of HASHLEN bytes from a chaining
// key and input key material. stablelib's HKDF is RFC5869 with empty `info`,
// which is byte-for-byte identical to the Noise specification's HKDF.
export function hkdf(chainingKey: Uint8Array, ikm: Uint8Array, outputs: 2 | 3): Uint8Array[] {
  const stream = new HKDF(SHA256, ikm, chainingKey).expand(HASHLEN * outputs);
  const result: Uint8Array[] = [];
  for (let i = 0; i < outputs; i++) {
    result.push(stream.subarray(i * HASHLEN, (i + 1) * HASHLEN));
  }
  return result;
}

// 96-bit ChaCha20-Poly1305 nonce per the Noise spec: 32 bits of zeros followed
// by the 64-bit little-endian counter.
function nonceBytes(n: number): Uint8Array {
  const nonce = new Uint8Array(12);
  new DataView(nonce.buffer).setBigUint64(4, BigInt(n), true);
  return nonce;
}

export class CipherState {
  private k: Uint8Array | null = null;
  private n = 0;

  initializeKey(key: Uint8Array | null): void {
    this.k = key;
    this.n = 0;
  }

  hasKey(): boolean {
    return this.k !== null;
  }

  encryptWithAd(ad: Uint8Array, plaintext: Uint8Array): Uint8Array {
    if (!this.k) return plaintext;
    const aead = new ChaCha20Poly1305(this.k);
    const sealed = aead.seal(nonceBytes(this.n), plaintext, ad);
    this.n += 1;
    return sealed;
  }

  decryptWithAd(ad: Uint8Array, ciphertext: Uint8Array): Uint8Array {
    if (!this.k) return ciphertext;
    const aead = new ChaCha20Poly1305(this.k);
    const opened = aead.open(nonceBytes(this.n), ciphertext, ad);
    if (opened === null) throw new Error('NOISE_DECRYPT_FAILED');
    this.n += 1;
    return opened;
  }
}

export class SymmetricState {
  private ck!: Uint8Array;
  private h!: Uint8Array;
  private cipher = new CipherState();

  constructor(protocolName: string) {
    const name = utf8(protocolName);
    if (name.length <= HASHLEN) {
      const h = new Uint8Array(HASHLEN);
      h.set(name);
      this.h = h;
    } else {
      this.h = sha256(name);
    }
    this.ck = this.h;
  }

  mixKey(ikm: Uint8Array): void {
    const [ck, tempK] = hkdf(this.ck, ikm, 2);
    this.ck = ck;
    this.cipher.initializeKey(tempK);
  }

  mixHash(data: Uint8Array): void {
    this.h = sha256(concatBytes(this.h, data));
  }

  hasKey(): boolean {
    return this.cipher.hasKey();
  }

  get handshakeHash(): Uint8Array {
    return this.h;
  }

  encryptAndHash(plaintext: Uint8Array): Uint8Array {
    const ciphertext = this.cipher.encryptWithAd(this.h, plaintext);
    this.mixHash(ciphertext);
    return ciphertext;
  }

  decryptAndHash(ciphertext: Uint8Array): Uint8Array {
    const plaintext = this.cipher.decryptWithAd(this.h, ciphertext);
    this.mixHash(ciphertext);
    return plaintext;
  }

  get chainKey(): Uint8Array {
    return this.ck;
  }

  // Returns the two transport CipherStates: the first is used by the initiator
  // to send (and the responder to receive), the second is the reverse.
  split(): [CipherState, CipherState] {
    const [tempK1, tempK2] = hkdf(this.ck, EMPTY, 2);
    const c1 = new CipherState();
    const c2 = new CipherState();
    c1.initializeKey(tempK1);
    c2.initializeKey(tempK2);
    return [c1, c2];
  }
}

export { TAG_LENGTH };
