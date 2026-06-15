import { describe, it, expect } from 'vitest';
import {
  createFileStream,
  bytesSource,
  chunkCount,
  FileStreamReceiver,
} from '../../src/crypto/file-stream';
import { FILE_CHUNK_BYTES } from '../../src/file-transfer';

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
