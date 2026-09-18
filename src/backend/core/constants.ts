// parseInt returns NaN for a malformed value, and every limit comparison
// against NaN is false — so RELAY_CONN_PER_IP_LIMIT=abc silently rejects every
// connection instead of failing at boot. Refuse the value rather than serve
// with a limit nobody can reason about.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer, got "${raw}"`);
  }
  return parsed;
}

export const SESSION_LIMITS = {
  MAX_PEERS: 10,
  DEFAULT_TTL_MS: 15 * 60 * 1000, // 15 minutes
  MAX_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  RECONNECT_GRACE_MS: 30 * 1000, // 30 seconds
  INACTIVITY_TTL_MS: 30 * 60 * 1000, // 30 minutes
  EMPTY_SESSION_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_PENDING_PEERS: 10,
  // How long a deleted session id stays poisoned. A join that was already
  // in flight when the cleanup sweep ran would otherwise re-insert the session
  // via store.save(), leaving a copy nothing can reach or reap.
  TOMBSTONE_TTL_MS: 60 * 1000,
  // Hard ceiling on concurrently held sessions. Each session retains a Map entry,
  // peer state, and cleanup bookkeeping in memory, so an unbounded create rate is
  // a DoS vector. New creates are refused at capacity (the per-IP create rate
  // limit is the first line of defence; this is the global backstop).
  MAX_ACTIVE_SESSIONS: envInt('MAX_ACTIVE_SESSIONS', 10000),
};

export const RELAY_LIMITS = {
  // Sized to carry one ~5MB file after base64 + per-peer ratchet ciphertext
  // inflation (~1.8x). Group sends fan out per peer, so very large files in
  // large groups may exceed this and be rejected — that is the intended safety
  // valve protecting the in-memory relay from runaway memory use.
  MAX_PAYLOAD_BYTES: 16 * 1024 * 1024, // 16MB
  // Per-file raw byte cap on the RELAY path (client-enforced before encryption).
  // Matches P2P_FILE_THRESHOLD_BYTES in src/transport/p2p-policy.ts: anything at
  // or above the threshold is routed peer-to-peer, so a relay file can never
  // exceed it and the two values must agree. Kept modest because encryptForAll
  // produces one ciphertext per recipient — a 1MB file in a large group fans out
  // to many times its own size in a single payload.
  MAX_FILE_BYTES: 1024 * 1024, // 1MB
  // Raw byte cap for files sent over the direct P2P data channel (chunked,
  // streamed). These bytes never touch the blind relay, so the cap is far higher
  // than MAX_FILE_BYTES — bounded only by the receiver streaming to a Blob.
  MAX_P2P_FILE_BYTES: 256 * 1024 * 1024, // 256MB
  // Fixed plaintext size of each streamed file chunk. Each chunk is AEAD-sealed
  // independently, so this bounds the working-set memory of both sender and
  // receiver regardless of total file size.
  FILE_CHUNK_BYTES: 64 * 1024, // 64KB
  WS_MAX_FRAME_BYTES: 16 * 1024 * 1024 + 64 * 1024, // envelope payload + JSON overhead
  TIMESTAMP_TOLERANCE_MS: 60 * 1000, // 1 minute drift allowed
  MSG_PER_SECOND_LIMIT: 10,
  SOCKET_MSG_PER_SECOND_LIMIT: 20, // all frame types, incl. control messages
  CONN_PER_IP_LIMIT: envInt('RELAY_CONN_PER_IP_LIMIT', 50),
  CONN_WINDOW_MS: 60 * 1000, // 1 minute
  JOIN_TIMEOUT_MS: 10 * 1000, // socket must join within this or be dropped
  MAX_BUFFERED_BYTES: 24 * 1024 * 1024, // skip sends to backpressured sockets
  NONCE_CACHE_MAX: 50_000,
};

// Traffic-analysis hardening. Even though payloads are encrypted, the relay
// still observes byteSize, from, type, and timing per envelope. Clients pad the
// plaintext up to one of these fixed size tiers *before* encryption so the
// relay cannot tell a one-word text from a multi-KB note. Padding is purely
// client-side and lives inside the encrypted blob — the server never pads (it
// must not touch the payload). These tiers are the SOURCE OF TRUTH; the
// frontend mirror is src/crypto/message-padding.ts.
//
// Tiers climb ~8x so a small message is rounded up modestly while large media
// is not over-inflated. Content larger than the top tier is length-prefixed but
// not padded further (clamped) so a padded plaintext never approaches
// MAX_PAYLOAD_BYTES after AEAD + base64 expansion.
// Re-exported so existing backend call sites keep importing limits from one
// place; the definition lives in the shared contract because the client pads.
export { PADDING } from '../../shared/contracts/v1/padding';

export const REST_LIMITS = {
  WINDOW_MS: 60 * 1000,
  SESSION_CREATE_PER_WINDOW: envInt('REST_SESSION_CREATE_LIMIT', 10),
  GENERAL_PER_WINDOW: envInt('REST_GENERAL_LIMIT', 120),
};

export const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
