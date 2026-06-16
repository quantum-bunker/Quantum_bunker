export const SESSION_LIMITS = {
  MAX_PEERS: 10,
  DEFAULT_TTL_MS: 15 * 60 * 1000, // 15 minutes
  MAX_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  RECONNECT_GRACE_MS: 30 * 1000, // 30 seconds
  INACTIVITY_TTL_MS: 30 * 60 * 1000, // 30 minutes
  EMPTY_SESSION_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_PENDING_PEERS: 10,
};

export const RELAY_LIMITS = {
  // Sized to carry one ~5MB file after base64 + per-peer ratchet ciphertext
  // inflation (~1.8x). Group sends fan out per peer, so very large files in
  // large groups may exceed this and be rejected — that is the intended safety
  // valve protecting the in-memory relay from runaway memory use.
  MAX_PAYLOAD_BYTES: 16 * 1024 * 1024, // 16MB
  // Per-file raw byte cap (client-enforced before encryption). Supports short
  // videos; kept under MAX_PAYLOAD_BYTES to leave room for encoding overhead.
  MAX_FILE_BYTES: 5 * 1024 * 1024, // 5MB
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
  CONN_PER_IP_LIMIT: parseInt(process.env.RELAY_CONN_PER_IP_LIMIT || '50', 10),
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
export const PADDING = {
  // 8KB / 64KB / 512KB / 4MB. The 8KB floor covers the vast majority of text
  // messages, so a 5-char and a 4KB message land in the same bucket.
  BUCKETS: [8 * 1024, 64 * 1024, 512 * 1024, 4 * 1024 * 1024] as const,
  // 4-byte big-endian length prefix; the real content length is recorded so
  // padding is stripped unambiguously on decrypt.
  LENGTH_PREFIX_BYTES: 4,
  // A padded plaintext is never grown beyond this. Kept well under
  // MAX_PAYLOAD_BYTES (16MB) to leave headroom for ciphertext + base64 + the
  // per-peer fan-out JSON envelope.
  MAX_PADDED_BYTES: 4 * 1024 * 1024,
  // Upper bound on the random delay added before relaying non-interactive
  // frames (receipts/edits/deletes) to blunt timing correlation. Small enough
  // not to be felt in the UI.
  TIMING_JITTER_MAX_MS: 120,
};

export const REST_LIMITS = {
  WINDOW_MS: 60 * 1000,
  SESSION_CREATE_PER_WINDOW: parseInt(process.env.REST_SESSION_CREATE_LIMIT || '10', 10),
  GENERAL_PER_WINDOW: parseInt(process.env.REST_GENERAL_LIMIT || '120', 10),
};

export const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
