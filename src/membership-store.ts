import {
  KeyPairB64,
  generateIdentity,
  createJoinProof,
  decodeToken,
} from './shared/membership';
import { randomId } from './random';

export const MEMBER_KEY = 'qb-member-identity';
export const HOST_KEY = 'qb-host-identity';
export const TOKENS_KEY = 'qb-membership-tokens';

export function loadIdentity(storageKey: string): KeyPairB64 {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) return JSON.parse(stored) as KeyPairB64;
  } catch {
    // fall through to generate
  }
  const id = generateIdentity();
  try {
    localStorage.setItem(storageKey, JSON.stringify(id));
  } catch {
    // storage unavailable — identity stays in memory for this session
  }
  return id;
}

// Reads the session-keyed token wallet, dropping any tokens whose embedded `exp`
// has passed (the server rejects these on join anyway — see verifyMembership).
// Prunes the stored copy when it removes something so dead vaults don't linger.
export function loadTokens(now: number = Date.now()): Record<string, string> {
  let stored: Record<string, string>;
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    stored = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }

  const live: Record<string, string> = {};
  let pruned = false;
  for (const [sessionId, encoded] of Object.entries(stored)) {
    const token = decodeToken(encoded);
    if (token && token.claims.exp > now) {
      live[sessionId] = encoded;
    } else {
      pruned = true;
    }
  }

  if (pruned) {
    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify(live));
    } catch {
      // storage unavailable — the in-memory pruned view is still correct
    }
  }
  return live;
}

// Builds the join-time whitelist credentials for a vault if this device holds a
// membership token for it: the stored token plus a freshly signed possession
// proof. Returns null when no token exists (normal host-approval join).
export function buildJoinCredentials(
  sessionId: string,
  peerId: string
): { membershipToken: string; joinProof: ReturnType<typeof createJoinProof> } | null {
  const tokens = loadTokens();
  const membershipToken = tokens[sessionId];
  if (!membershipToken) return null;
  const member = loadIdentity(MEMBER_KEY);
  const joinProof = createJoinProof(member, sessionId, peerId, randomId());
  return { membershipToken, joinProof };
}
