import { describe, it, expect } from 'vitest';
import {
  createFileStream,
  bytesSource,
  chunkCount,
  FileStreamReceiver,
} from '../../src/crypto/file-stream';
import { FILE_CHUNK_BYTES, resolveMime } from '../../src/file-transfer';
import { encryptFileData, decryptFileData } from '../../src/file-crypto';
import { fromBase64 } from '../../src/crypto/noise-primitives';

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 0xff;
  return b;
}

async function collect(gen: AsyncGenerator<Uint8Array>): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const f of gen) out.push(f);
  return out;
}

describe('file-stream', () => {
  it('splits into ceil(size / FILE_CHUNK_BYTES) chunks', () => {
    expect(chunkCount(0)).toBe(0);
    expect(chunkCount(1)).toBe(1);
    expect(chunkCount(FILE_CHUNK_BYTES)).toBe(1);
    expect(chunkCount(FILE_CHUNK_BYTES + 1)).toBe(2);
  });

  it('round-trips a multi-chunk file through chunk -> encrypt -> reassemble', async () => {
    const original = randomBytes(FILE_CHUNK_BYTES * 3 + 123);
    const progress: number[] = [];
    const { init, frames } = createFileStream(bytesSource(original), {
      name: 'clip.mp4',
      mime: 'video/mp4',
    });
    expect(init.chunks).toBe(4);

    const receiver = new FileStreamReceiver(init, (rcv) => progress.push(rcv));
    for (const frame of await collect(frames())) receiver.acceptFrame(frame);

    expect(receiver.isDone).toBe(true);
    const blob = receiver.result();
    expect(blob.type).toBe('video/mp4');
    const round = new Uint8Array(await blob.arrayBuffer());
    expect(round).toEqual(original);
    expect(progress.at(-1)).toBe(original.length);
  });

  it('rejects the whole transfer when a single chunk is tampered', async () => {
    const original = randomBytes(FILE_CHUNK_BYTES * 2 + 10);
    const { init, frames } = createFileStream(bytesSource(original), {
      name: 'a.bin',
      mime: 'application/octet-stream',
    });
    const all = await collect(frames());

    // Flip a byte inside the second chunk's ciphertext (past the header).
    all[1][all[1].length - 1] ^= 0x01;

    const receiver = new FileStreamReceiver(init);
    receiver.acceptFrame(all[0]);
    expect(() => receiver.acceptFrame(all[1])).toThrow(/REJECTED/);
    expect(receiver.isFailed).toBe(true);
    expect(() => receiver.result()).toThrow(/REJECTED/);
  });

  it('rejects out-of-order chunks', async () => {
    const original = randomBytes(FILE_CHUNK_BYTES * 2);
    const { init, frames } = createFileStream(bytesSource(original), {
      name: 'a.bin',
      mime: 'application/octet-stream',
    });
    const all = await collect(frames());

    const receiver = new FileStreamReceiver(init);
    expect(() => receiver.acceptFrame(all[1])).toThrow(/REJECTED/);
  });

  it('refuses to produce a result before all chunks arrive', async () => {
    const original = randomBytes(FILE_CHUNK_BYTES * 2);
    const { init, frames } = createFileStream(bytesSource(original), {
      name: 'a.bin',
      mime: 'application/octet-stream',
    });
    const all = await collect(frames());

    const receiver = new FileStreamReceiver(init);
    receiver.acceptFrame(all[0]);
    expect(receiver.isDone).toBe(false);
    expect(() => receiver.result()).toThrow(/INCOMPLETE/);
  });

  it('does not authenticate a chunk under the wrong file key', async () => {
    const original = randomBytes(FILE_CHUNK_BYTES + 1);
    const a = createFileStream(bytesSource(original), { name: 'x', mime: 'application/octet-stream' });
    const b = createFileStream(bytesSource(original), { name: 'x', mime: 'application/octet-stream' });
    const aFrames = await collect(a.frames());

    // Receiver initialized with B's init (different random key) must reject A's frames.
    const receiver = new FileStreamReceiver(b.init);
    expect(() => receiver.acceptFrame(aFrames[0])).toThrow(/REJECTED/);
  });
});

describe('resolveMime', () => {
  it('preserves a specific valid MIME', () => {
    expect(resolveMime('video/mp4', 'clip.webm')).toBe('video/mp4');
    expect(resolveMime('image/png', 'a.jpg')).toBe('image/png');
  });

  it('infers from extension when MIME is empty or generic', () => {
    expect(resolveMime('', 'clip.mp4')).toBe('video/mp4');
    expect(resolveMime('application/octet-stream', 'clip.webm')).toBe('video/webm');
    expect(resolveMime('BINARY/OCTET-STREAM', 'clip.mov')).toBe('video/quicktime');
    expect(resolveMime('', 'clip.mkv')).toBe('video/x-matroska');
    expect(resolveMime('', 'clip.m4v')).toBe('video/x-m4v');
    expect(resolveMime('', 'clip.avi')).toBe('video/x-msvideo');
    expect(resolveMime('', 'clip.ogv')).toBe('video/ogg');
  });

  it('falls back to octet-stream for an unknown extension and empty MIME', () => {
    expect(resolveMime('', 'data.xyz')).toBe('application/octet-stream');
    expect(resolveMime('', 'noext')).toBe('application/octet-stream');
  });

  it('keeps the original generic MIME when extension is unknown', () => {
    expect(resolveMime('application/octet-stream', 'data.xyz')).toBe('application/octet-stream');
  });
});

describe('password-protected streamed file (approach a)', () => {
  it('round-trips: ciphertext streams, reassembles, decryptFileData yields original', async () => {
    const original = randomBytes(FILE_CHUNK_BYTES * 2 + 99);
    const password = 'correct horse battery staple';
    const sealed = await encryptFileData(original, password, 'AES-GCM');
    const ciphertext = fromBase64(sealed.data);

    const { init, frames } = createFileStream(bytesSource(ciphertext), {
      name: 'secret.mp4',
      mime: 'video/mp4',
      size: original.length,
      enc: sealed.lock,
    });
    expect(init.enc).toEqual(sealed.lock);
    expect(init.size).toBe(original.length);
    expect(init.encSize).toBe(ciphertext.length);

    const receiver = new FileStreamReceiver(init);
    for (const frame of await collect(frames())) receiver.acceptFrame(frame);
    expect(receiver.isDone).toBe(true);

    const reassembled = receiver.resultBytes();
    expect(reassembled).toEqual(ciphertext);

    const opened = await decryptFileData(sealed.data, sealed.lock, password);
    expect(opened).not.toBeNull();
    expect(new Uint8Array(opened as Uint8Array)).toEqual(original);
  });

  it('wrong password fails to decrypt the reassembled ciphertext', async () => {
    const original = randomBytes(FILE_CHUNK_BYTES + 5);
    const sealed = await encryptFileData(original, 'right', 'ChaCha20-Poly1305');
    const ciphertext = fromBase64(sealed.data);

    const { init, frames } = createFileStream(bytesSource(ciphertext), {
      name: 'x.bin', mime: 'application/octet-stream', size: original.length, enc: sealed.lock,
    });
    const receiver = new FileStreamReceiver(init);
    for (const frame of await collect(frames())) receiver.acceptFrame(frame);

    const reassembled = receiver.resultBytes();
    const { toBase64 } = await import('../../src/crypto/noise-primitives');
    const opened = await decryptFileData(toBase64(reassembled), sealed.lock, 'wrong');
    expect(opened).toBeNull();
  });
});
