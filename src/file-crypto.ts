import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305';
import { toBase64, fromBase64, utf8 } from './crypto/noise-primitives';

// User-selectable cipher for the optional password layer. Both are AEAD and
// run on top of the existing Noise/Double-Ratchet E2E encryption — they add a
// second, password-gated lock that not even an admitted peer can open without
// the secret. The password is shared out of band; it never enters the relay.
export type FileCipher = 'AES-GCM' | 'ChaCha20-Poly1305';

export interface FileLock {
  algo: FileCipher;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string; // base64
  iv: string; // base64 (GCM IV / ChaCha nonce)
}

// OWASP 2023 floor for PBKDF2-HMAC-SHA256. High enough to make offline brute
// force of a captured ciphertext costly, low enough to derive in well under a
// second on a typical client.
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12; // AES-GCM IV and ChaCha20-Poly1305 nonce are both 12 bytes

export function isFileCipher(v: unknown): v is FileCipher {
  return v === 'AES-GCM' || v === 'ChaCha20-Poly1305';
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

async function deriveKeyBytes(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

export async function encryptFileData(
  plaintext: Uint8Array,
  password: string,
  algo: FileCipher,
): Promise<{ data: string; lock: FileLock }> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const keyBytes = await deriveKeyBytes(password, salt, PBKDF2_ITERATIONS);

  let ct: Uint8Array;
  if (algo === 'AES-GCM') {
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
    ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  } else {
    ct = new ChaCha20Poly1305(keyBytes).seal(iv, plaintext);
  }

  return {
    data: toBase64(ct),
    lock: { algo, kdf: 'PBKDF2-SHA256', iter: PBKDF2_ITERATIONS, salt: toBase64(salt), iv: toBase64(iv) },
  };
}

// Returns null on a wrong password or tampered ciphertext (AEAD auth failure).
export async function decryptFileData(
  data: string,
  lock: FileLock,
  password: string,
): Promise<Uint8Array | null> {
  try {
    const salt = fromBase64(lock.salt);
    const iv = fromBase64(lock.iv);
    const ct = fromBase64(data);
    const keyBytes = await deriveKeyBytes(password, salt, lock.iter);

    if (lock.algo === 'AES-GCM') {
      const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return new Uint8Array(pt);
    }
    return new ChaCha20Poly1305(keyBytes).open(iv, ct);
  } catch {
    return null;
  }
}
