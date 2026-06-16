// Client-only TOFU (trust-on-first-use) pin store for peer identity keys. The
// Noise handshake is relayed THROUGH the server, so the server sits in the
// natural man-in-the-middle position. The only defense is users comparing the
// safety number / SHA-256 fingerprint out of band and pinning the result here.
//
// A pin records the fingerprint a user verified out of band. If a peer's live
// fingerprint ever stops matching its pin, that is an interception signal — the
// UI must block and force re-verification. Pins live in localStorage
// (preferences tier per CLAUDE.md). The server is never involved.

export const VERIFIED_CONTACTS_KEY = 'qb-verified-contacts';

export type ContactStatus = 'unverified' | 'verified' | 'changed';

export interface PinnedContact {
  fingerprint: string;
  verifiedAt: number;
}

export type ContactPins = Record<string, PinnedContact>;

// Identity keys are per-session (see loadOrCreateIdentity in peer-channels.ts),
// so a pin is scoped to the session + peer it was captured in.
export function contactKey(sessionId: string, peerId: string): string {
  return `${sessionId}:${peerId}`;
}

// The core detection rule, kept pure so it is trivially testable:
//   no pin            → 'unverified'
//   no live key yet   → 'unverified' (handshake not finished)
//   pin === live key  → 'verified'
//   pin !== live key  → 'changed'  (possible interception — block messaging)
export function contactStatus(
  pin: PinnedContact | undefined,
  currentFingerprint: string | null | undefined,
): ContactStatus {
  if (!pin || !currentFingerprint) return 'unverified';
  return pin.fingerprint === currentFingerprint ? 'verified' : 'changed';
}

export function hasKeyChanged(
  pin: PinnedContact | undefined,
  currentFingerprint: string | null | undefined,
): boolean {
  return contactStatus(pin, currentFingerprint) === 'changed';
}

export function loadPins(): ContactPins {
  try {
    const raw = localStorage.getItem(VERIFIED_CONTACTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isContactPins(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function savePins(pins: ContactPins): void {
  try {
    localStorage.setItem(VERIFIED_CONTACTS_KEY, JSON.stringify(pins));
  } catch {
    // localStorage unavailable — pins stay in memory for this session only.
  }
}

// Pins (or re-pins) a verified fingerprint. Re-pinning overwrites the previous
// value, so this doubles as the re-verification path after a key change.
export function pinContact(pins: ContactPins, key: string, fingerprint: string): ContactPins {
  return { ...pins, [key]: { fingerprint, verifiedAt: Date.now() } };
}

export function unpinContact(pins: ContactPins, key: string): ContactPins {
  if (!(key in pins)) return pins;
  const { [key]: _removed, ...rest } = pins;
  return rest;
}

function isContactPins(value: unknown): value is ContactPins {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value as Record<string, unknown>).every(
    (p) => typeof p === 'object' && p !== null && typeof (p as PinnedContact).fingerprint === 'string',
  );
}
