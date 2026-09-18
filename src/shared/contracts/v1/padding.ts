// Padding is a wire-format concern: the client pads before encrypting and the
// relay's limits are sized around the result, so both sides must agree byte for
// byte. It lives here, in the shared contract, rather than being mirrored in
// backend constants and frontend crypto where the two copies could drift apart
// silently.
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
