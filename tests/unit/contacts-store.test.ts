import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadContacts,
  upsertContact,
  attachContactToken,
  revokeContact,
  isPinIntact,
  encodeTrustPayload,
  decodeTrustPayload,
  CONTACTS_KEY,
} from '../../src/contacts-store';
import {
  generateIdentity,
  issueMembershipToken,
  createJoinProof,
  encodeToken,
  verifyMembership,
  fingerprintPublicKey,
} from '../../src/shared/membership';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('trust payload', () => {
  it('round-trips a public key and label', () => {
    const id = generateIdentity();
    const encoded = encodeTrustPayload(id.publicKey, 'Alice');
    const decoded = decodeTrustPayload(encoded);
    expect(decoded).toEqual({ publicKey: id.publicKey, label: 'Alice' });
  });

  it('strips a ?trust= link prefix before decoding', () => {
    const id = generateIdentity();
    const encoded = encodeTrustPayload(id.publicKey);
    const decoded = decodeTrustPayload(`https://example.com/?trust=${encoded}`);
    expect(decoded?.publicKey).toBe(id.publicKey);
  });

  it('returns null for garbage', () => {
    expect(decodeTrustPayload('not-a-payload')).toBeNull();
    expect(decodeTrustPayload('')).toBeNull();
  });
});

describe('fingerprintPublicKey', () => {
  it('is stable for the same key and differs across keys', () => {
    const a = generateIdentity();
    const b = generateIdentity();
    expect(fingerprintPublicKey(a.publicKey)).toBe(fingerprintPublicKey(a.publicKey));
    expect(fingerprintPublicKey(a.publicKey)).not.toBe(fingerprintPublicKey(b.publicKey));
  });

  it('returns empty string for a malformed key', () => {
    expect(fingerprintPublicKey('!!!')).toBe('');
  });
});

describe('contact book CRUD', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('pins a contact and persists it', () => {
    const id = generateIdentity();
    const contacts = upsertContact(id.publicKey, 'Bob');
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ label: 'Bob', publicKey: id.publicKey, membershipToken: null });
    expect(contacts[0].pinnedFingerprint).toBe(fingerprintPublicKey(id.publicKey));
    expect(loadContacts()).toHaveLength(1);
  });

  it('upsert is idempotent by public key and refreshes the label', () => {
    const id = generateIdentity();
    upsertContact(id.publicKey, 'Bob');
    const contacts = upsertContact(id.publicKey, 'Bobby');
    expect(contacts).toHaveLength(1);
    expect(contacts[0].label).toBe('Bobby');
  });

  it('revokes a contact (drops the pin)', () => {
    const id = generateIdentity();
    upsertContact(id.publicKey, 'Bob');
    expect(revokeContact(id.publicKey)).toHaveLength(0);
    expect(loadContacts()).toHaveLength(0);
  });

  it('detects a pin mismatch when the key no longer matches the stored fingerprint', () => {
    const id = generateIdentity();
    upsertContact(id.publicKey, 'Bob');
    const [contact] = loadContacts();
    expect(isPinIntact(contact)).toBe(true);
    expect(isPinIntact({ ...contact, pinnedFingerprint: 'DEAD BEEF DEAD BEEF' })).toBe(false);
  });
});

describe('attachContactToken', () => {
  const sessionId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('stores a received token and surfaces the vault id it admits to', () => {
    const host = generateIdentity();
    const member = generateIdentity();
    upsertContact(host.publicKey, 'Host');
    const token = encodeToken(issueMembershipToken(host.secretKey, member.publicKey, sessionId));

    const { contacts, sessionId: sid } = attachContactToken(host.publicKey, token);
    expect(sid).toBe(sessionId);
    expect(contacts.find(c => c.publicKey === host.publicKey)?.membershipToken).toBe(token);
  });
});

// Acceptance: a token issued for a pinned contact's key verifies — the basis for
// auto-admit with no host prompt.
describe('token issue/verify against a pinned key', () => {
  const sessionId = '33333333-3333-3333-3333-333333333333';
  const peerId = 'pinned-peer';

  beforeEach(() => {
    localStorageMock.clear();
  });

  it('admits a pinned contact presenting the host-issued token + fresh proof', () => {
    const host = generateIdentity();
    const member = generateIdentity();

    // Host pins the member as a trusted contact, then issues a token for its key.
    upsertContact(member.publicKey, 'Member');
    const [pinned] = loadContacts();
    expect(isPinIntact(pinned)).toBe(true);

    const token = issueMembershipToken(host.secretKey, pinned.publicKey, sessionId);
    const proof = createJoinProof(member, sessionId, peerId, 'nonce-pinned');

    const res = verifyMembership(host.publicKey, sessionId, peerId, token, proof);
    expect(res).toMatchObject({ valid: true, memberPublicKey: member.publicKey });
  });

  it('rejects a token whose member key was not the pinned one', () => {
    const host = generateIdentity();
    const pinnedMember = generateIdentity();
    const impostor = generateIdentity();

    upsertContact(pinnedMember.publicKey, 'Member');
    const token = issueMembershipToken(host.secretKey, pinnedMember.publicKey, sessionId);
    const forgedProof = createJoinProof(impostor, sessionId, peerId, 'nonce-x');

    const res = verifyMembership(host.publicKey, sessionId, peerId, token, forgedProof);
    expect(res.valid).toBe(false);
  });
});
