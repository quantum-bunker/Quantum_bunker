import { describe, it, expect } from 'vitest';
import {
  FileAttachment,
  MAX_FILE_BYTES,
  MAX_P2P_FILE_BYTES,
  isWithinFileLimit,
  isWithinP2PFileLimit,
  formatBytes,
  attachmentKind,
  attachmentDataUrl,
  encodeFileAttachment,
  decodeFileAttachment,
  decodeFileLock,
  resolveMime,
} from '../../src/file-transfer';

const sample: FileAttachment = { name: 'photo.png', mime: 'image/png', size: 1234, data: 'AAEC' };

describe('file-transfer', () => {
  describe('isWithinFileLimit', () => {
    it('accepts a positive size at or below the cap', () => {
      expect(isWithinFileLimit(1)).toBe(true);
      expect(isWithinFileLimit(MAX_FILE_BYTES)).toBe(true);
    });
    it('rejects zero, negative, oversize, and non-finite sizes', () => {
      expect(isWithinFileLimit(0)).toBe(false);
      expect(isWithinFileLimit(-5)).toBe(false);
      expect(isWithinFileLimit(MAX_FILE_BYTES + 1)).toBe(false);
      expect(isWithinFileLimit(NaN)).toBe(false);
    });
  });

  describe('formatBytes', () => {
    it('renders B / KB / MB scales', () => {
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(2048)).toBe('2.0 KB');
      expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    });
  });

  describe('attachmentKind', () => {
    it('classifies by mime prefix, defaulting to file', () => {
      expect(attachmentKind('image/jpeg')).toBe('image');
      expect(attachmentKind('audio/webm')).toBe('audio');
      expect(attachmentKind('video/mp4')).toBe('video');
      expect(attachmentKind('application/pdf')).toBe('file');
    });
  });

  describe('attachmentDataUrl', () => {
    it('builds a base64 data URL', () => {
      expect(attachmentDataUrl(sample)).toBe('data:image/png;base64,AAEC');
    });

    it('infers a playable type from the filename when the source mime is generic', () => {
      const vid: FileAttachment = { name: 'clip.mp4', mime: 'application/octet-stream', size: 9, data: 'AAEC' };
      expect(attachmentDataUrl(vid)).toBe('data:video/mp4;base64,AAEC');
    });
  });

  describe('encode / decode round trip', () => {
    it('survives a round trip', () => {
      expect(decodeFileAttachment(encodeFileAttachment(sample))).toEqual(sample);
    });

    it('returns null on malformed JSON', () => {
      expect(decodeFileAttachment('not json')).toBeNull();
    });

    it('rejects objects missing required fields or with wrong types', () => {
      expect(decodeFileAttachment(JSON.stringify({ name: 'x', mime: 'image/png', size: 1 }))).toBeNull();
      expect(decodeFileAttachment(JSON.stringify({ ...sample, data: '' }))).toBeNull();
      expect(decodeFileAttachment(JSON.stringify({ ...sample, size: '10' }))).toBeNull();
    });

    it('clamps absurdly long name and mime fields', () => {
      const decoded = decodeFileAttachment(JSON.stringify({ ...sample, name: 'a'.repeat(500), mime: 'm'.repeat(500) }));
      expect(decoded?.name.length).toBe(256);
      expect(decoded?.mime.length).toBe(128);
    });

    it('rejects a non-object payload', () => {
      expect(decodeFileAttachment('42')).toBeNull();
      expect(decodeFileAttachment('null')).toBeNull();
      expect(decodeFileAttachment('"a string"')).toBeNull();
    });
  });

  describe('isWithinP2PFileLimit', () => {
    it('accepts positive sizes up to the much larger P2P cap', () => {
      expect(isWithinP2PFileLimit(1)).toBe(true);
      expect(isWithinP2PFileLimit(MAX_FILE_BYTES + 1)).toBe(true); // would fail the relay cap
      expect(isWithinP2PFileLimit(MAX_P2P_FILE_BYTES)).toBe(true);
    });
    it('rejects zero, negative, oversize, and non-finite sizes', () => {
      expect(isWithinP2PFileLimit(0)).toBe(false);
      expect(isWithinP2PFileLimit(-1)).toBe(false);
      expect(isWithinP2PFileLimit(MAX_P2P_FILE_BYTES + 1)).toBe(false);
      expect(isWithinP2PFileLimit(Infinity)).toBe(false);
    });
  });

  describe('resolveMime', () => {
    it('keeps a specific valid mime verbatim', () => {
      expect(resolveMime('image/png', 'photo.bin')).toBe('image/png');
    });
    it('infers from the extension when the mime is empty or generic', () => {
      expect(resolveMime('', 'clip.webm')).toBe('video/webm');
      expect(resolveMime('application/octet-stream', 'song.mp3')).toBe('audio/mpeg');
      expect(resolveMime('binary/octet-stream', 'pic.JPG')).toBe('image/jpeg'); // case-insensitive ext
    });
    it('falls back to octet-stream when generic and the extension is unknown', () => {
      expect(resolveMime('', 'mystery.xyz')).toBe('application/octet-stream');
      expect(resolveMime('application/octet-stream', 'noext')).toBe('application/octet-stream');
    });
    it('treats a bare token without a slash as generic and tries the extension', () => {
      expect(resolveMime('weird', 'a.gif')).toBe('image/gif');
    });
  });

  describe('decodeFileLock', () => {
    const lock = { algo: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: 210000, salt: 'c2FsdA', iv: 'aXY' };

    it('accepts both supported AEAD algorithms', () => {
      expect(decodeFileLock(lock)).toEqual(lock);
      expect(decodeFileLock({ ...lock, algo: 'ChaCha20-Poly1305' })?.algo).toBe('ChaCha20-Poly1305');
    });

    it('rejects an unsupported algo, kdf, or missing fields', () => {
      expect(decodeFileLock({ ...lock, algo: 'DES' })).toBeNull();
      expect(decodeFileLock({ ...lock, kdf: 'scrypt' })).toBeNull();
      expect(decodeFileLock({ ...lock, iter: '210000' })).toBeNull();
      expect(decodeFileLock({ ...lock, salt: 123 })).toBeNull();
      const { iv: _omit, ...noIv } = lock;
      expect(decodeFileLock(noIv)).toBeNull();
    });

    it('rejects non-object inputs', () => {
      expect(decodeFileLock(null)).toBeNull();
      expect(decodeFileLock('lock')).toBeNull();
      expect(decodeFileLock(undefined)).toBeNull();
    });

    it('round-trips a password-locked attachment through encode/decode', () => {
      const locked: FileAttachment = { ...sample, enc: lock as FileAttachment['enc'] };
      expect(decodeFileAttachment(encodeFileAttachment(locked))).toEqual(locked);
    });

    it('rejects an attachment carrying a malformed enc lock', () => {
      const bad = JSON.stringify({ ...sample, enc: { algo: 'AES-GCM' } });
      expect(decodeFileAttachment(bad)).toBeNull();
    });
  });
});
