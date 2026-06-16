import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LONG_TERM_IDENTITY_KEY,
  sessionIdentityKey,
  hasLongTermIdentity,
  createEphemeralIdentity,
  createLongTermIdentity,
  unlockLongTermIdentity,
  promoteSessionIdentity,
  clearLongTermIdentity,
  StoredIdentity,
} from '../../src/crypto/identity-store';
import { toBase64 } from '../../src/crypto/noise-primitives';

function storageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear: vi.fn(() => { store = {}; }),
    raw: () => store,
  };
}

let local = storageMock();
let session = storageMock();

beforeEach(() => {
  local = storageMock();
  session = storageMock();
  Object.defineProperty(globalThis, 'localStorage', { value: local, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, writable: true });
});

describe('identity-store: long-term encrypt-at-rest', () => {
  it('persists a long-term identity and unlocks it with the passphrase', async () => {
    const created = await createLongTermIdentity('correct horse');
    expect(hasLongTermIdentity()).toBe(true);

    const unlocked = await unlockLongTermIdentity('correct horse');
    expect(unlocked).not.toBeNull();
    expect(toBase64(unlocked!.publicKey)).toBe(toBase64(created.publicKey));
    expect(toBase64(unlocked!.secretKey)).toBe(toBase64(created.secretKey));
  });

  it('produces a stable fingerprint across reloads (same public key)', async () => {
    const a = await createLongTermIdentity('pw');
    const b = await unlockLongTermIdentity('pw');
    expect(toBase64(b!.publicKey)).toBe(toBase64(a.publicKey));
  });

  it('stores the secret key as ciphertext, never plaintext', async () => {
    const created = await createLongTermIdentity('pw');
    const raw = local.raw()[LONG_TERM_IDENTITY_KEY];
    const stored: StoredIdentity = JSON.parse(raw);

    const secretB64 = toBase64(created.secretKey);
    // The on-disk blob must not contain the plaintext secret in any field.
    expect(raw).not.toContain(secretB64);
    expect(stored.sec).not.toBe(secretB64);
    expect(stored.lock.kdf).toBe('PBKDF2-SHA256');
    expect(stored.lock.iter).toBe(210_000);
  });

  it('returns null for a wrong passphrase', async () => {
    await createLongTermIdentity('right');
    expect(await unlockLongTermIdentity('wrong')).toBeNull();
  });

  it('returns null when no long-term identity exists', async () => {
    expect(hasLongTermIdentity()).toBe(false);
    expect(await unlockLongTermIdentity('whatever')).toBeNull();
  });

  it('clears a long-term identity', async () => {
    await createLongTermIdentity('pw');
    clearLongTermIdentity();
    expect(hasLongTermIdentity()).toBe(false);
  });

  it('rejects an empty passphrase', async () => {
    await expect(createLongTermIdentity('')).rejects.toThrow('IDENTITY_PASSPHRASE_REQUIRED');
  });
});

describe('identity-store: ephemeral (burner)', () => {
  it('returns a fresh keypair that is never persisted', () => {
    const a = createEphemeralIdentity();
    const b = createEphemeralIdentity();
    expect(toBase64(a.publicKey)).not.toBe(toBase64(b.publicKey));
    expect(hasLongTermIdentity()).toBe(false);
  });
});

describe('identity-store: migration', () => {
  const sessionId = 'sess-123';

  function seedSessionIdentity() {
    const pair = createEphemeralIdentity();
    session.raw()[sessionIdentityKey(sessionId)] = JSON.stringify({
      pub: toBase64(pair.publicKey),
      sec: toBase64(pair.secretKey),
    });
    return pair;
  }

  it('promotes a sessionStorage identity to an encrypted long-term identity', async () => {
    const seeded = seedSessionIdentity();
    const promoted = await promoteSessionIdentity(sessionId, 'pw');

    expect(promoted).not.toBeNull();
    // Same key material is carried over so the fingerprint is preserved.
    expect(toBase64(promoted!.publicKey)).toBe(toBase64(seeded.publicKey));
    expect(toBase64(promoted!.secretKey)).toBe(toBase64(seeded.secretKey));

    // And it is now durably persisted, encrypted, and unlockable.
    expect(hasLongTermIdentity()).toBe(true);
    const unlocked = await unlockLongTermIdentity('pw');
    expect(toBase64(unlocked!.publicKey)).toBe(toBase64(seeded.publicKey));

    const raw = local.raw()[LONG_TERM_IDENTITY_KEY];
    expect(raw).not.toContain(toBase64(seeded.secretKey));
  });

  it('returns null when there is no session identity to promote', async () => {
    expect(await promoteSessionIdentity(sessionId, 'pw')).toBeNull();
    expect(hasLongTermIdentity()).toBe(false);
  });
});
