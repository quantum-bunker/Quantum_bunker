import { KeyPairB64 } from '../shared/membership';
import { MEMBER_KEY } from '../membership-store';
import {
  ENTROPY_BYTES,
  decodeEntropy,
  encodeEntropy,
  entropyFromPhrase,
  generatePhrase,
  keyPairFromEntropy,
  phraseFromEntropy,
} from './bunker-id';

// Persistence for the Bunker ID.
//
// AT REST: the phrase entropy is stored unencrypted, matching the existing
// qb-member-identity precedent rather than the passphrase-locked Noise key.
// Direct mode needs the identity on every cold load with no prompt, or presence
// and queue flushing silently do nothing until the user types a passphrase. The
// consequence — anyone with this browser profile can become you — is surfaced in
// the UI rather than left implicit. An optional passphrase lock is a follow-up.
//
// The key pair is re-derived on every load and never written down.

export const BUNKER_ID_KEY = 'qb-bunker-id';
export const BUNKER_ID_VERSION = 1;

interface StoredBunkerId {
  v: number;
  // base64url of the 16 phrase bytes. Null for an identity migrated from
  // qb-member-identity, which predates phrases and so has none to show.
  entropy: string | null;
  // Only set for a migrated identity, whose key cannot be re-derived.
  secretKey?: string;
  publicKey?: string;
  createdAt: number;
}

export interface BunkerId {
  keyPair: KeyPairB64;
  createdAt: number;
  // False for a migrated identity: there is no phrase to write down, which is
  // exactly why the UI prompts the user to mint a backed-up one.
  hasBackup: boolean;
}

function read(): StoredBunkerId | null {
  try {
    const raw = localStorage.getItem(BUNKER_ID_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBunkerId;
    if (!parsed || parsed.v !== BUNKER_ID_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(stored: StoredBunkerId): void {
  try {
    localStorage.setItem(BUNKER_ID_KEY, JSON.stringify(stored));
  } catch {
    // Storage unavailable — the identity stays in memory for this tab only.
    // Losing it on reload is bad, but refusing to run is worse.
  }
}

function hydrate(stored: StoredBunkerId): BunkerId | null {
  if (stored.entropy) {
    const bytes = decodeEntropy(stored.entropy);
    if (bytes.length !== ENTROPY_BYTES) return null;
    return { keyPair: keyPairFromEntropy(bytes), createdAt: stored.createdAt, hasBackup: true };
  }
  if (stored.publicKey && stored.secretKey) {
    return {
      keyPair: { publicKey: stored.publicKey, secretKey: stored.secretKey },
      createdAt: stored.createdAt,
      hasBackup: false,
    };
  }
  return null;
}

// Adopts an existing qb-member-identity as the Bunker ID rather than minting a
// second one, so a user who has already been whitelisted somewhere keeps that
// key working. There is no phrase for it — hasBackup stays false and the UI
// nags — but silently orphaning their existing identity would be worse.
function migrateMemberIdentity(): BunkerId | null {
  try {
    const raw = localStorage.getItem(MEMBER_KEY);
    if (!raw) return null;
    const kp = JSON.parse(raw) as KeyPairB64;
    if (!kp || typeof kp.publicKey !== 'string' || typeof kp.secretKey !== 'string') return null;
    const stored: StoredBunkerId = {
      v: BUNKER_ID_VERSION,
      entropy: null,
      publicKey: kp.publicKey,
      secretKey: kp.secretKey,
      createdAt: Date.now(),
    };
    write(stored);
    return hydrate(stored);
  } catch {
    return null;
  }
}

function mint(): { id: BunkerId; phrase: string } {
  const phrase = generatePhrase();
  const entropy = entropyFromPhrase(phrase)!;
  const stored: StoredBunkerId = {
    v: BUNKER_ID_VERSION,
    entropy: encodeEntropy(entropy),
    createdAt: Date.now(),
  };
  write(stored);
  return { id: hydrate(stored)!, phrase };
}

// Resolution order: a stored Bunker ID, then an existing member identity to
// adopt, then a fresh one. Always returns an identity — direct mode is unusable
// without one and there is nothing to prompt for.
export function loadBunkerId(): BunkerId {
  const stored = read();
  if (stored) {
    const hydrated = hydrate(stored);
    if (hydrated) return hydrated;
  }
  const migrated = migrateMemberIdentity();
  if (migrated) return migrated;
  return mint().id;
}

// Only ever returns a phrase for an identity that was minted from one. A
// migrated identity has no phrase and must be replaced to gain a backup.
export function revealPhrase(): string | null {
  const stored = read();
  if (!stored?.entropy) return null;
  return phraseFromEntropy(decodeEntropy(stored.entropy));
}

export function restoreFromPhrase(phrase: string): BunkerId | null {
  const entropy = entropyFromPhrase(phrase);
  if (!entropy) return null;
  const stored: StoredBunkerId = {
    v: BUNKER_ID_VERSION,
    entropy: encodeEntropy(entropy),
    createdAt: Date.now(),
  };
  write(stored);
  return hydrate(stored);
}

// Burns the current identity for a fresh one. Every person who added the old
// code can no longer reach this user, so the caller is responsible for clearing
// known-peer records and for double-confirming with the user first.
export function regenerateBunkerId(): { id: BunkerId; phrase: string } {
  return mint();
}
