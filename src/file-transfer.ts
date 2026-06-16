import type { FileLock } from './file-crypto';

export interface FileAttachment {
  name: string;
  mime: string;
  size: number; // original raw byte size (before any password encryption)
  data: string; // base64: raw file bytes, or password-encrypted ciphertext when `enc` is set
  enc?: FileLock; // present => an extra password lock wraps `data`
}

export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';

// Mirrors RELAY_LIMITS.MAX_FILE_BYTES in src/backend/core/constants.ts. The
// frontend cannot import backend modules across the hexagonal boundary, so the
// value is duplicated here with the backend kept as the source of truth.
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Mirrors RELAY_LIMITS.MAX_P2P_FILE_BYTES and RELAY_LIMITS.FILE_CHUNK_BYTES.
// The direct P2P path streams files in fixed chunks and never relays the bytes,
// so it permits a much larger cap than MAX_FILE_BYTES.
export const MAX_P2P_FILE_BYTES = 256 * 1024 * 1024;
export const FILE_CHUNK_BYTES = 64 * 1024;

export function isWithinFileLimit(size: number): boolean {
  return Number.isFinite(size) && size > 0 && size <= MAX_FILE_BYTES;
}

export function isWithinP2PFileLimit(size: number): boolean {
  return Number.isFinite(size) && size > 0 && size <= MAX_P2P_FILE_BYTES;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const GENERIC_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

const EXT_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  ogv: 'video/ogg',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};

// A specific, valid MIME is kept verbatim. Only when the provided value is
// empty or a generic octet-stream do we try to infer a better type from the
// file extension — otherwise video/audio playback breaks on streamed files.
export function resolveMime(mime: string, name: string): string {
  const lower = mime.trim().toLowerCase();
  if (!GENERIC_MIMES.has(lower) && lower.includes('/')) return mime;
  const dot = name.lastIndexOf('.');
  if (dot >= 0) {
    const ext = name.slice(dot + 1).toLowerCase();
    if (EXT_MIME[ext]) return EXT_MIME[ext];
  }
  return mime || 'application/octet-stream';
}

export function attachmentKind(mime: string): AttachmentKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export function attachmentDataUrl(att: FileAttachment): string {
  return `data:${att.mime};base64,${att.data}`;
}

export function encodeFileAttachment(att: FileAttachment): string {
  return JSON.stringify(att);
}

export function decodeFileAttachment(raw: string): FileAttachment | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (
    typeof o.name !== 'string' ||
    typeof o.mime !== 'string' ||
    typeof o.size !== 'number' ||
    typeof o.data !== 'string' ||
    o.data.length === 0
  ) {
    return null;
  }
  const enc = decodeFileLock(o.enc);
  if (o.enc !== undefined && enc === null) return null;
  return {
    name: o.name.slice(0, 256),
    mime: o.mime.slice(0, 128),
    size: o.size,
    data: o.data,
    ...(enc ? { enc } : {}),
  };
}

export function decodeFileLock(raw: unknown): FileLock | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (
    (e.algo !== 'AES-GCM' && e.algo !== 'ChaCha20-Poly1305') ||
    e.kdf !== 'PBKDF2-SHA256' ||
    typeof e.iter !== 'number' ||
    typeof e.salt !== 'string' ||
    typeof e.iv !== 'string'
  ) {
    return null;
  }
  return { algo: e.algo, kdf: 'PBKDF2-SHA256', iter: e.iter, salt: e.salt, iv: e.iv };
}
