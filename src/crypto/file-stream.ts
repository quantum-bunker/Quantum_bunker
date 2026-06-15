import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305';
import { FILE_CHUNK_BYTES } from '../file-transfer';
import { hkdf, toBase64, fromBase64, concatBytes } from './noise-primitives';

// Streamed file transfer over the direct P2P data channel.
//
// A file is split into fixed-size plaintext chunks (FILE_CHUNK_BYTES). One
// random 32-byte file key is generated per transfer; the AEAD key is HKDF-
// derived from it so the wire key is never used directly. Each chunk is sealed
// independently with ChaCha20-Poly1305 under a per-chunk nonce (the chunk
// index), and the chunk header — which carries the index and total — is bound
// in as associated data so a chunk can be neither reordered, dropped, nor
// spliced into another transfer without breaking authentication.
//
// The file key and metadata travel as a FileStreamInit through the double
// ratchet (the only base64/JSON hop, where forward secrecy is needed); the bulk
// chunks travel as raw ArrayBuffers to avoid base64's ~33% inflation.

const MAGIC = 0x51424653; // "QBFS"
const VERSION = 1;
const FILE_ID_BYTES = 16;
const KEY_BYTES = 32;
const HEADER_BYTES = 30; // magic(4) + version(1) + reserved(1) + index(4) + total(4) + fileId(16)
const TAG_BYTES = 16;

export interface FileStreamInit {
  fileId: string; // base64url-free base64 of FILE_ID_BYTES random bytes
  key: string; // base64 of the 32-byte per-file key (carried inside the ratchet)
  name: string;
  mime: string;
  size: number;
  chunks: number;
}

// Validates a decrypted JSON blob as a FileStreamInit. Used to tell a streamed
// transfer's opening control message apart from a single-shot FileAttachment,
// both of which arrive ratchet-encrypted inside a FILE envelope.
export function decodeFileStreamInit(raw: string): FileStreamInit | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  if (
    typeof o.fileId !== 'string' ||
    typeof o.key !== 'string' ||
    typeof o.name !== 'string' ||
    typeof o.mime !== 'string' ||
    typeof o.size !== 'number' ||
    typeof o.chunks !== 'number' ||
    o.chunks < 0
  ) {
    return null;
  }
  return {
    fileId: o.fileId,
    key: o.key,
    name: o.name.slice(0, 256),
    mime: o.mime.slice(0, 128),
    size: o.size,
    chunks: o.chunks,
  };
}

export interface ChunkSource {
  readonly size: number;
  slice(start: number, end: number): Promise<Uint8Array>;
}

export function bytesSource(bytes: Uint8Array): ChunkSource {
  return {
    size: bytes.length,
    slice: (start, end) => Promise.resolve(bytes.subarray(start, end)),
  };
}

export function blobSource(blob: Blob): ChunkSource {
  return {
    size: blob.size,
    slice: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()),
  };
}

export function chunkCount(size: number): number {
  return size <= 0 ? 0 : Math.ceil(size / FILE_CHUNK_BYTES);
}

function deriveAeadKey(fileId: Uint8Array, fileKey: Uint8Array): Uint8Array {
  return hkdf(fileId, fileKey, 2)[0];
}

function nonce(index: number): Uint8Array {
  const n = new Uint8Array(12);
  new DataView(n.buffer).setBigUint64(4, BigInt(index), true);
  return n;
}

function frameHeader(fileId: Uint8Array, index: number, total: number): Uint8Array {
  const h = new Uint8Array(HEADER_BYTES);
  const view = new DataView(h.buffer);
  view.setUint32(0, MAGIC, false);
  view.setUint8(4, VERSION);
  view.setUint8(5, 0);
  view.setUint32(6, index, false);
  view.setUint32(10, total, false);
  h.set(fileId, 14);
  return h;
}

interface ParsedFrame {
  fileId: Uint8Array;
  index: number;
  total: number;
  header: Uint8Array;
  ciphertext: Uint8Array;
}

function parseFrame(frame: Uint8Array): ParsedFrame | null {
  if (frame.length < HEADER_BYTES + TAG_BYTES) return null;
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  if (view.getUint32(0, false) !== MAGIC || view.getUint8(4) !== VERSION) return null;
  return {
    fileId: frame.subarray(14, 14 + FILE_ID_BYTES),
    index: view.getUint32(6, false),
    total: view.getUint32(10, false),
    header: frame.subarray(0, HEADER_BYTES),
    ciphertext: frame.subarray(HEADER_BYTES),
  };
}

// The whole header — including the fileId and per-chunk index — is the AEAD
// associated data, so a sealed chunk cannot be reordered within its transfer
// nor spliced into a different one without breaking authentication.
function chunkAd(header: Uint8Array): Uint8Array {
  return header;
}

// Routing key for the receiver registry: the base64 fileId carried in a frame's
// header, or null if the frame is malformed. Lets a binary handler dispatch a
// chunk to the right transfer without holding the AEAD key.
export function frameFileId(frame: Uint8Array): string | null {
  const parsed = parseFrame(frame);
  return parsed ? toBase64(parsed.fileId) : null;
}

export function createFileStream(
  source: ChunkSource,
  meta: { name: string; mime: string },
): { init: FileStreamInit; frames: () => AsyncGenerator<Uint8Array> } {
  const fileId = crypto.getRandomValues(new Uint8Array(FILE_ID_BYTES));
  const fileKey = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const aeadKey = deriveAeadKey(fileId, fileKey);
  const total = chunkCount(source.size);

  const init: FileStreamInit = {
    fileId: toBase64(fileId),
    key: toBase64(fileKey),
    name: meta.name,
    mime: meta.mime,
    size: source.size,
    chunks: total,
  };

  async function* frames(): AsyncGenerator<Uint8Array> {
    const aead = new ChaCha20Poly1305(aeadKey);
    for (let index = 0; index < total; index++) {
      const start = index * FILE_CHUNK_BYTES;
      const end = Math.min(start + FILE_CHUNK_BYTES, source.size);
      const plain = await source.slice(start, end);
      const header = frameHeader(fileId, index, total);
      const sealed = aead.seal(nonce(index), plain, chunkAd(header));
      yield concatBytes(header, sealed);
    }
  }

  return { init, frames };
}

export type FileStreamProgress = (received: number, total: number) => void;

// Reassembles chunks in arrival order, verifying each AEAD tag. Any failure —
// bad tag, wrong/duplicate index, count mismatch — fails the whole transfer
// permanently; no partial result is ever surfaced. Decrypted chunks are handed
// straight to a Blob part array, so at most one chunk lives on the JS heap at a
// time and the full file is never buffered contiguously.
export class FileStreamReceiver {
  private readonly aeadKey: Uint8Array;
  private readonly fileId: Uint8Array;
  private readonly parts: BlobPart[] = [];
  private next = 0;
  private received = 0;
  private failed = false;
  private complete = false;

  private readonly fileIdB64: string;

  constructor(
    private readonly init: FileStreamInit,
    private readonly onProgress?: FileStreamProgress,
  ) {
    this.fileId = fromBase64(init.fileId);
    this.fileIdB64 = init.fileId;
    this.aeadKey = deriveAeadKey(this.fileId, fromBase64(init.key));
  }

  get isDone(): boolean {
    return this.complete;
  }

  get isFailed(): boolean {
    return this.failed;
  }

  acceptFrame(frame: Uint8Array): void {
    if (this.failed || this.complete) throw new Error('FILE_STREAM_CLOSED');
    const parsed = parseFrame(frame);
    if (
      !parsed ||
      parsed.total !== this.init.chunks ||
      parsed.index !== this.next ||
      toBase64(parsed.fileId) !== this.fileIdB64
    ) {
      return this.fail();
    }
    const aead = new ChaCha20Poly1305(this.aeadKey);
    const plain = aead.open(nonce(parsed.index), parsed.ciphertext, chunkAd(parsed.header));
    if (plain === null) return this.fail();

    this.parts.push(plain);
    this.next += 1;
    this.received += plain.length;
    this.onProgress?.(this.received, this.init.size);
    if (this.next === this.init.chunks) this.complete = true;
  }

  result(): Blob {
    if (this.failed) throw new Error('FILE_STREAM_REJECTED');
    if (!this.complete || this.received !== this.init.size) throw new Error('FILE_STREAM_INCOMPLETE');
    return new Blob(this.parts, { type: this.init.mime });
  }

  private fail(): never {
    this.failed = true;
    this.parts.length = 0;
    throw new Error('FILE_STREAM_REJECTED');
  }
}
