import { generateKeyPair, sign, verify } from '@stablelib/ed25519';
import { hash as sha256 } from '@stablelib/sha256';

// Stateless whitelist primitives. The host signs a member's public key into a
// bearer-resistant token the member keeps on their own device; the server (or
// any peer) verifies it against the host public key without storing anything.
//
// Two artifacts:
//   - MembershipToken: signed by the host, says "this member key may enter this
//     vault until exp". Long-lived, reusable across reconnects.
//   - JoinProof: signed by the member at join time over a fresh
//     (sessionId, peerId, timestamp, nonce) tuple, proving live possession of
//     the member secret key. Single-use; defeats token replay.

export const MEMBERSHIP_VERSION = 1;
export const JOIN_PROOF_TOLERANCE_MS = 60 * 1000;
export const DEFAULT_MEMBERSHIP_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type KeyPairB64 = { publicKey: string; secretKey: string };

export interface MembershipClaims {
  v: number;
  sid: string; // bound vault id
  mpk: string; // member public key (base64url)
  iat: number;
  exp: number;
}

export interface MembershipToken {
  claims: MembershipClaims;
  sig: string; // host signature over canonical(claims), base64url
}

export interface JoinProof {
  mpk: string; // member public key (base64url)
  sessionId: string;
  peerId: string;
  timestamp: number;
  nonce: string;
  sig: string; // member signature over the proof tuple, base64url
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// Deterministic serialization so signer and verifier hash identical bytes.
function canonicalClaims(c: MembershipClaims): Uint8Array {
  return utf8(`${c.v}\n${c.sid}\n${c.mpk}\n${c.iat}\n${c.exp}`);
}

function canonicalProof(p: Omit<JoinProof, 'sig'>): Uint8Array {
  return utf8(`${p.mpk}\n${p.sessionId}\n${p.peerId}\n${p.timestamp}\n${p.nonce}`);
}

export function generateIdentity(): KeyPairB64 {
  const kp = generateKeyPair();
  return { publicKey: b64urlEncode(kp.publicKey), secretKey: b64urlEncode(kp.secretKey) };
}

export function issueMembershipToken(
  hostSecretKeyB64: string,
  memberPublicKeyB64: string,
  sessionId: string,
  ttlMs: number = DEFAULT_MEMBERSHIP_TTL_MS,
  now: number = Date.now()
): MembershipToken {
  const claims: MembershipClaims = {
    v: MEMBERSHIP_VERSION,
    sid: sessionId,
    mpk: memberPublicKeyB64,
    iat: now,
    exp: now + ttlMs,
  };
  const sig = sign(b64urlDecode(hostSecretKeyB64), canonicalClaims(claims));
  return { claims, sig: b64urlEncode(sig) };
}

export function createJoinProof(
  memberIdentity: KeyPairB64,
  sessionId: string,
  peerId: string,
  nonce: string,
  now: number = Date.now()
): JoinProof {
  const base = { mpk: memberIdentity.publicKey, sessionId, peerId, timestamp: now, nonce };
  const sig = sign(b64urlDecode(memberIdentity.secretKey), canonicalProof(base));
  return { ...base, sig: b64urlEncode(sig) };
}

export function encodeToken(token: MembershipToken): string {
  return b64urlEncode(utf8(JSON.stringify(token)));
}

export function decodeToken(encoded: string): MembershipToken | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(encoded)));
    if (
      parsed &&
      parsed.claims &&
      typeof parsed.claims.sid === 'string' &&
      typeof parsed.claims.mpk === 'string' &&
      typeof parsed.sig === 'string'
    ) {
      return parsed as MembershipToken;
    }
  } catch {
    // fall through
  }
  return null;
}

// Stable, human-comparable fingerprint of a membership public key, used to
// "pin" a trusted contact so a later key swap (a relay-mounted impersonation)
// is visible. Same key in → same fingerprint out on every device, so two people
// can read it aloud to confirm they pinned each other. Returns '' for a
// malformed key rather than throwing, so callers can render a single check.
export function fingerprintPublicKey(publicKeyB64: string): string {
  try {
    const digest = sha256(b64urlDecode(publicKeyB64));
    let hex = '';
    for (let i = 0; i < 8; i++) hex += digest[i].toString(16).padStart(2, '0');
    return hex.match(/.{4}/g)!.join(' ').toUpperCase();
  } catch {
    return '';
  }
}

export type VerifyResult = { valid: boolean; reason?: string; memberPublicKey?: string };

// Verifies that a member presenting `proof` is authorized to enter `sessionId`:
// the host vouched for their key (token) and they hold the matching secret key
// (proof). Pure and stateless — replay defense (nonce dedup) is the caller's job.
export function verifyMembership(
  hostPublicKeyB64: string,
  sessionId: string,
  peerId: string,
  token: MembershipToken,
  proof: JoinProof,
  now: number = Date.now()
): VerifyResult {
  if (token.claims.v !== MEMBERSHIP_VERSION) return { valid: false, reason: 'Unsupported token version' };
  if (token.claims.sid !== sessionId) return { valid: false, reason: 'Token not for this vault' };
  if (token.claims.exp < now) return { valid: false, reason: 'Token expired' };
  if (proof.sessionId !== sessionId || proof.peerId !== peerId) return { valid: false, reason: 'Proof binding mismatch' };
  if (proof.mpk !== token.claims.mpk) return { valid: false, reason: 'Proof key does not match token' };
  if (Math.abs(now - proof.timestamp) > JOIN_PROOF_TOLERANCE_MS) return { valid: false, reason: 'Proof timestamp out of tolerance' };

  let hostOk = false;
  let memberOk = false;
  try {
    hostOk = verify(b64urlDecode(hostPublicKeyB64), canonicalClaims(token.claims), b64urlDecode(token.sig));
  } catch {
    return { valid: false, reason: 'Malformed token signature' };
  }
  if (!hostOk) return { valid: false, reason: 'Token signature invalid' };

  try {
    const { sig, ...base } = proof;
    memberOk = verify(b64urlDecode(proof.mpk), canonicalProof(base), b64urlDecode(sig));
  } catch {
    return { valid: false, reason: 'Malformed proof signature' };
  }
  if (!memberOk) return { valid: false, reason: 'Proof signature invalid' };

  return { valid: true, memberPublicKey: token.claims.mpk };
}
