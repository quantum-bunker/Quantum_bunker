import { fingerprintPublicKey, decodeToken } from './shared/membership';

// Client-only contact book. Trust lives ENTIRELY on this device: a contact is a
// pinned membership public key the user has decided to trust. The server never
// sees this list — it only ever holds the host public key in the ephemeral
// session. Persisted in localStorage (preferences tier per CLAUDE.md).
//
// REVOCATION IS CLIENT-SIDE ONLY. Dropping a contact removes our pin so we stop
// auto-presenting/accepting its token, but a host-signed membership token is a
// bearer credential — once issued it stays valid until it expires. True
// server-side revocation is impossible by design: the relay is stateless and
// stores no membership state to revoke against. Issue short TTLs if that matters.

export const CONTACTS_KEY = 'qb-contacts';

export interface Contact {
  label: string;
  publicKey: string; // contact's Ed25519 member public key (base64url)
  // Token the contact issued US, letting us auto-join one of their vaults. Null
  // until they hand one over. Vault-scoped via the token's embedded `sid`.
  membershipToken: string | null;
  // fingerprintPublicKey(publicKey) captured at pin time. Recomputing it later
  // and comparing detects a swapped key.
  pinnedFingerprint: string;
  addedAt: number;
}

interface TrustPayload {
  v: number;
  pk: string;
  label?: string;
}

const TRUST_PAYLOAD_VERSION = 1;

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

// One-time public-key exchange artifact. Encodes only a public key + optional
// label — no secret, so it is safe to share over any channel (link/QR). The
// recipient pins the key; trust is mutual once both sides have exchanged.
export function encodeTrustPayload(publicKey: string, label?: string): string {
  const payload: TrustPayload = { v: TRUST_PAYLOAD_VERSION, pk: publicKey.trim() };
  if (label && label.trim()) payload.label = label.trim().slice(0, 64);
  return b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeTrustPayload(encoded: string): { publicKey: string; label?: string } | null {
  try {
    const raw = encoded.trim().replace(/^.*[?&#]trust=/, '');
    const parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(raw))) as TrustPayload;
    if (parsed && parsed.v === TRUST_PAYLOAD_VERSION && typeof parsed.pk === 'string' && parsed.pk) {
      return { publicKey: parsed.pk, label: typeof parsed.label === 'string' ? parsed.label : undefined };
    }
  } catch {
    // fall through
  }
  return null;
}

export function loadContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Contact[];
    }
  } catch {
    // ignore
  }
  return [];
}

function persist(contacts: Contact[]): void {
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  } catch {
    // storage unavailable — contacts stay in memory for this session only
  }
}

// Pins a contact (idempotent by public key). Re-pinning an existing key keeps
// its token unless a new one is supplied, and refreshes the label.
export function upsertContact(
  publicKey: string,
  label: string,
  membershipToken?: string | null,
): Contact[] {
  const pk = publicKey.trim();
  if (!pk) return loadContacts();
  const contacts = loadContacts();
  const existing = contacts.find(c => c.publicKey === pk);
  if (existing) {
    existing.label = label.trim() || existing.label;
    if (membershipToken !== undefined) existing.membershipToken = membershipToken;
    persist(contacts);
    return contacts;
  }
  const next: Contact[] = [
    ...contacts,
    {
      label: label.trim() || pk.slice(0, 8),
      publicKey: pk,
      membershipToken: membershipToken ?? null,
      pinnedFingerprint: fingerprintPublicKey(pk),
      addedAt: Date.now(),
    },
  ];
  persist(next);
  return next;
}

// Attaches a token a contact issued us, also returning the vault id it admits us
// to (decoded from the token's claims) so the caller can fold it into the
// session-keyed token wallet that buildJoinCredentials reads.
export function attachContactToken(publicKey: string, encodedToken: string): { contacts: Contact[]; sessionId: string | null } {
  const decoded = decodeToken(encodedToken.trim());
  const sessionId = decoded ? decoded.claims.sid : null;
  const contacts = upsertContact(publicKey, '', encodedToken.trim());
  return { contacts, sessionId };
}

// Client-side revocation: drop the pin. See the module header — this cannot
// revoke an already-issued bearer token server-side.
export function revokeContact(publicKey: string): Contact[] {
  const next = loadContacts().filter(c => c.publicKey !== publicKey.trim());
  persist(next);
  return next;
}

// True when the live key still matches the fingerprint we pinned. A false here
// means the key changed since we trusted it — treat as an impersonation signal.
export function isPinIntact(contact: Contact): boolean {
  return fingerprintPublicKey(contact.publicKey) === contact.pinnedFingerprint;
}
