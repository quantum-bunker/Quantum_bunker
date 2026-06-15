// Length-prefixed bucket padding for traffic-analysis resistance. Applied to
// the plaintext bytes BEFORE they enter the ratchet, so the relay only ever
// observes a handful of fixed ciphertext sizes instead of the true message
// length. Round-trips are exact: the real length is recorded in a fixed-width
// header, so unpadding strips the filler deterministically.
//
// Source of truth for the tiers is src/backend/core/constants.ts (PADDING).
// They are mirrored here so the frontend has no import dependency on backend
// code; keep the two in sync.

const LENGTH_PREFIX_BYTES = 4;
const BUCKETS = [8 * 1024, 64 * 1024, 512 * 1024, 4 * 1024 * 1024];

// Smallest tier that fits the framed content. Content larger than every tier
// is framed but not padded further (returns its own length) — this clamp keeps
// a padded plaintext from ever exceeding MAX_PADDED_BYTES through padding.
function targetSize(framedLength: number): number {
  for (const bucket of BUCKETS) {
    if (framedLength <= bucket) return bucket;
  }
  return framedLength;
}

export function padPlaintext(content: Uint8Array): Uint8Array {
  const framedLength = LENGTH_PREFIX_BYTES + content.length;
  const total = targetSize(framedLength);
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, content.length, false);
  out.set(content, LENGTH_PREFIX_BYTES);
  return out;
}

export function unpadPlaintext(padded: Uint8Array): Uint8Array {
  if (padded.length < LENGTH_PREFIX_BYTES) throw new Error('PADDING_HEADER_TRUNCATED');
  const length = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(0, false);
  const end = LENGTH_PREFIX_BYTES + length;
  if (end > padded.length) throw new Error('PADDING_LENGTH_OUT_OF_RANGE');
  return padded.slice(LENGTH_PREFIX_BYTES, end);
}
