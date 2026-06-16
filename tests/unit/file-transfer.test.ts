import { describe, it, expect } from 'vitest';
import {
  FileAttachment,
  MAX_FILE_BYTES,
  isWithinFileLimit,
  formatBytes,
  attachmentKind,
  attachmentDataUrl,
  encodeFileAttachment,
  decodeFileAttachment,
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
  });
});
