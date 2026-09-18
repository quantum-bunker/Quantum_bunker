import { describe, it, expect } from 'vitest';
import {
  generateIdentity,
  issueMembershipToken,
  createJoinProof,
  encodeToken,
  decodeToken,
  verifyMembership,
  JOIN_PROOF_TOLERANCE_MS,
  fingerprintPublicKey,
  fingerprintMatches,
} from '../../src/shared/membership';

describe('Membership tokens', () => {
  const sessionId = '11111111-1111-1111-1111-111111111111';
  const peerId = 'user-abc';

  function setup() {
    const host = generateIdentity();
    const member = generateIdentity();
    const token = issueMembershipToken(host.secretKey, member.publicKey, sessionId);
    const proof = createJoinProof(member, sessionId, peerId, 'nonce-1');
    return { host, member, token, proof };
  }

  it('accepts a valid token + fresh proof', () => {
    const { host, token, proof } = setup();
    const res = verifyMembership(host.publicKey, sessionId, peerId, token, proof);
    expect(res.valid).toBe(true);
  });

  it('survives encode/decode round-trip', () => {
    const { token } = setup();
    const decoded = decodeToken(encodeToken(token));
    expect(decoded).toEqual(token);
  });

  it('rejects a token signed by a different host', () => {
    const { token, proof } = setup();
    const attacker = generateIdentity();
    const res = verifyMembership(attacker.publicKey, sessionId, peerId, token, proof);
    expect(res.valid).toBe(false);
  });

  it('rejects a token bound to a different vault', () => {
    const { host, token, proof } = setup();
    const res = verifyMembership(host.publicKey, 'other-vault', peerId, token, proof);
    expect(res).toMatchObject({ valid: false, reason: 'Token not for this vault' });
  });

  it('rejects a proof from a key the host did not whitelist', () => {
    const { host, token } = setup();
    const impostor = generateIdentity();
    const forgedProof = createJoinProof(impostor, sessionId, peerId, 'nonce-2');
    const res = verifyMembership(host.publicKey, sessionId, peerId, token, forgedProof);
    expect(res).toMatchObject({ valid: false, reason: 'Proof key does not match token' });
  });

  it('rejects a proof bound to a different peerId', () => {
    const { host, member, token } = setup();
    const proof = createJoinProof(member, sessionId, 'someone-else', 'nonce-3');
    const res = verifyMembership(host.publicKey, sessionId, peerId, token, proof);
    expect(res).toMatchObject({ valid: false, reason: 'Proof binding mismatch' });
  });

  it('rejects a stale proof', () => {
    const { host, member, token } = setup();
    const proof = createJoinProof(member, sessionId, peerId, 'nonce-4', Date.now() - JOIN_PROOF_TOLERANCE_MS - 1000);
    const res = verifyMembership(host.publicKey, sessionId, peerId, token, proof);
    expect(res).toMatchObject({ valid: false, reason: 'Proof timestamp out of tolerance' });
  });

  it('rejects an expired token', () => {
    const host = generateIdentity();
    const member = generateIdentity();
    const token = issueMembershipToken(host.secretKey, member.publicKey, sessionId, 1000, Date.now() - 5000);
    const proof = createJoinProof(member, sessionId, peerId, 'nonce-5');
    const res = verifyMembership(host.publicKey, sessionId, peerId, token, proof);
    expect(res).toMatchObject({ valid: false, reason: 'Token expired' });
  });

  it('rejects a tampered proof signature', () => {
    const { host, token, proof } = setup();
    const tampered = { ...proof, timestamp: proof.timestamp + 1 };
    const res = verifyMembership(host.publicKey, sessionId, peerId, token, tampered);
    expect(res.valid).toBe(false);
  });

  it('returns null when decoding garbage', () => {
    expect(decodeToken('not-a-token')).toBeNull();
  });
});

describe('fingerprint width and legacy pins', () => {
  // This is the artifact two people read aloud to detect a key substitution;
  // it used to publish only 8 bytes of the digest, below the 128-bit floor
  // such comparisons need.
  it('publishes 128 bits', () => {
    const id = generateIdentity();
    const fp = fingerprintPublicKey(id.publicKey);
    const hex = fp.replace(/ /g, '');
    expect(hex).toHaveLength(32);
    expect(hex).toMatch(/^[0-9A-F]{32}$/);
  });

  it('is stable for a key and distinct between keys', () => {
    const a = generateIdentity();
    const b = generateIdentity();
    expect(fingerprintPublicKey(a.publicKey)).toBe(fingerprintPublicKey(a.publicKey));
    expect(fingerprintPublicKey(a.publicKey)).not.toBe(fingerprintPublicKey(b.publicKey));
  });

  it('still verifies a contact pinned before the widening', () => {
    const id = generateIdentity();
    // The old 8-byte form is a prefix of the current one for the same key.
    const legacy = fingerprintPublicKey(id.publicKey).split(' ').slice(0, 4).join(' ');
    expect(legacy).toHaveLength(19);
    expect(fingerprintMatches(id.publicKey, legacy)).toBe(true);
  });

  it('accepts the current form and rejects another key', () => {
    const id = generateIdentity();
    const other = generateIdentity();
    expect(fingerprintMatches(id.publicKey, fingerprintPublicKey(id.publicKey))).toBe(true);
    expect(fingerprintMatches(other.publicKey, fingerprintPublicKey(id.publicKey))).toBe(false);
  });

  it('rejects an empty or malformed pin rather than matching it', () => {
    const id = generateIdentity();
    expect(fingerprintMatches(id.publicKey, '')).toBe(false);
    expect(fingerprintMatches('!!!', 'AAAA BBBB CCCC DDDD')).toBe(false);
  });
});
