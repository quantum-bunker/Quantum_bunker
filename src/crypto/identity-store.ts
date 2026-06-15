// Source and lifetime of the Noise static identity keypair. Three modes:
//
//   ephemeral    — a fresh keypair per session (burner). Never persisted.
//   per-session  — the legacy sessionStorage identity (plaintext JSON), kept
//                  only as a migration source. See loadOrCreateIdentity in
//                  peer-channels.ts.
//   long-term    — an opt-in keypair persisted in localStorage with the secret
//                  key ENCRYPTED at rest under a passphrase-derived key. This is
//                  the durable identity whose fingerprint survives browser
//                  restarts, enabling TOFU pinning of a stable key.
//
// The wire handshake is unchanged: only where the static key comes from differs.
// Nothing here touches the server — identity is entirely client-side.

import { generateKeyPair } from '@stablelib/x25519';
import { KeyPair } from './noise-xx';
import { toBase64, fromBase64 } from './noise-primitives';
import { encryptFileData, decryptFileData, FileCipher, FileLock } from '../file-crypto';

export const LONG_TERM_IDENTITY_KEY = 'qb-identity-v1';
const SESSION_IDENTITY_PREFIX = 'qb-noise-id-';

// The public key is, by definition, public — stored in the clear. The secret
// key never lands on disk except as AEAD ciphertext (data + lock), wrapped by a
// key derived from the passphrase via the same PBKDF2-SHA256/210k path used for
// password-protected files.
export interface StoredIdentity {
  v: 1;
  pub: string;
  sec: string;
  lock: FileLock;
  createdAt: number;
}

export function sessionIdentityKey(sessionId: string): string {
  return `${SESSION_IDENTITY_PREFIX}${sessionId}`;
}

export function hasLongTermIdentity(): boolean {
  try {
    return localStorage.getItem(LONG_TERM_IDENTITY_KEY) !== null;
  } catch {
    return false;
  }
}

// Burner identity: lives only in memory for the lifetime of the PeerChannels
// instance. Opting out of long-term identity yields this.
export function createEphemeralIdentity(): KeyPair {
  return generateKeyPair();
}

export async function createLongTermIdentity(
  passphrase: string,
  algo: FileCipher = 'AES-GCM',
): Promise<KeyPair> {
  if (!passphrase) throw new Error('IDENTITY_PASSPHRASE_REQUIRED');
  const pair = generateKeyPair();
  await persistLongTerm(pair, passphrase, algo);
  return pair;
}

// Returns null on a missing/corrupt blob or a wrong passphrase — the AEAD auth
// failure inside decryptFileData is indistinguishable from a bad password, and
// both must be treated as "cannot unlock".
export async function unlockLongTermIdentity(passphrase: string): Promise<KeyPair | null> {
  const stored = readStoredIdentity();
  if (!stored) return null;
  const secretKey = await decryptFileData(stored.sec, stored.lock, passphrase);
  if (!secretKey) return null;
  return { publicKey: fromBase64(stored.pub), secretKey };
}

// Migration: promote the legacy plaintext sessionStorage identity to an
// encrypted long-term identity. Returns the promoted keypair, or null if there
// was no session identity to promote.
export async function promoteSessionIdentity(
  sessionId: string,
  passphrase: string,
  algo: FileCipher = 'AES-GCM',
): Promise<KeyPair | null> {
  if (!passphrase) throw new Error('IDENTITY_PASSPHRASE_REQUIRED');
  const pair = readSessionIdentity(sessionId);
  if (!pair) return null;
  await persistLongTerm(pair, passphrase, algo);
  return pair;
}

export function clearLongTermIdentity(): void {
  try {
    localStorage.removeItem(LONG_TERM_IDENTITY_KEY);
  } catch {
    // localStorage unavailable — nothing to clear.
  }
}

async function persistLongTerm(pair: KeyPair, passphrase: string, algo: FileCipher): Promise<void> {
  const { data, lock } = await encryptFileData(pair.secretKey, passphrase, algo);
  const stored: StoredIdentity = {
    v: 1,
    pub: toBase64(pair.publicKey),
    sec: data,
    lock,
    createdAt: Date.now(),
  };
  localStorage.setItem(LONG_TERM_IDENTITY_KEY, JSON.stringify(stored));
}

function readStoredIdentity(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(LONG_TERM_IDENTITY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredIdentity(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readSessionIdentity(sessionId: string): KeyPair | null {
  try {
    const raw = sessionStorage.getItem(sessionIdentityKey(sessionId));
    if (!raw) return null;
    const { pub, sec } = JSON.parse(raw);
    if (typeof pub !== 'string' || typeof sec !== 'string') return null;
    return { publicKey: fromBase64(pub), secretKey: fromBase64(sec) };
  } catch {
    return null;
  }
}

function isStoredIdentity(value: unknown): value is StoredIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === 1 &&
    typeof v.pub === 'string' &&
    typeof v.sec === 'string' &&
    typeof v.lock === 'object' &&
    v.lock !== null
  );
}
