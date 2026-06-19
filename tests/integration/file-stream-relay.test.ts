import { describe, it, expect } from 'vitest';
import { PeerChannels, NoiseFrame } from '../../src/crypto/peer-channels';
import {
  createFileStream,
  blobSource,
  decodeFileStreamInit,
  frameFileId,
  FileStreamReceiver,
} from '../../src/crypto/file-stream';

// End-to-end wiring of the streamed-file path, exercised through the REAL
// double-ratchet (PeerChannels) and the REAL chunk/seal/reassemble engine —
// only the WebRTC mesh is mocked. This mirrors exactly what useRelay does:
//   sender:  createFileStream -> init through encryptForAll -> bulk frames raw
//   receiver: decryptFrom -> decodeFileStreamInit -> register -> route by fileId
// so a regression in any link (key exchange, init detection, frame routing,
// reassembly, tamper rejection) fails here without needing a browser.

function handshake(): Record<string, PeerChannels> {
  const managers: Record<string, PeerChannels> = {};
  for (const id of ['alice', 'bob']) {
    managers[id] = new PeerChannels({
      sessionId: 'stream-session',
      selfId: id,
      sendNoise: (to, frame: NoiseFrame) => managers[to]?.onSignal(id, frame),
    });
  }
  managers['alice'].ensureChannel('bob');
  managers['bob'].ensureChannel('alice');
  return managers;
}

// Mirrors the receive-side glue in useRelay: the FILE-envelope init handler plus
// the binary frame router keyed by fileId.
class ReceiverNode {
  readonly recv = new Map<string, { receiver: FileStreamReceiver; from: string; nonce: string }>();
  progress = 0;
  failed = false;
  result: Blob | null = null;
  ackedNonce: string | null = null;

  constructor(private readonly channels: PeerChannels) {}

  onMessage(from: string, envStr: string): void {
    const env = JSON.parse(envStr);
    if (env.type !== 'file') return;
    const decoded = this.channels.decryptFrom(from, JSON.parse(env.payload));
    if (decoded === null) return;
    const init = decodeFileStreamInit(decoded);
    if (!init || this.recv.has(init.fileId)) return;
    const receiver = new FileStreamReceiver(init, (rcv, total) => {
      this.progress = total > 0 ? rcv / total : 0;
    });
    this.recv.set(init.fileId, { receiver, from, nonce: env.nonce });
  }

  onBinary(from: string, ab: ArrayBuffer): void {
    const frame = new Uint8Array(ab);
    const fileId = frameFileId(frame);
    if (!fileId) return;
    const entry = this.recv.get(fileId);
    if (!entry || entry.from !== from) return;
    try {
      entry.receiver.acceptFrame(frame);
    } catch {
      this.failed = true;
      this.recv.delete(fileId);
      return;
    }
    if (entry.receiver.isDone) {
      this.recv.delete(fileId);
      this.result = entry.receiver.result();
      this.ackedNonce = entry.nonce;
    }
  }
}

interface Transport {
  message(envStr: string): void;
  binary(ab: ArrayBuffer): void;
}

// Mirrors the send-side glue in sendFileStream: ratchet-encrypt the init into a
// FILE envelope, then stream the bulk frames as raw ArrayBuffers.
async function streamFile(
  channels: PeerChannels,
  blob: Blob,
  meta: { name: string; mime: string },
  transport: Transport,
): Promise<{ nonce: string; chunks: number }> {
  const { init, frames } = createFileStream(blobSource(blob), meta);
  const nonce = 'file-nonce';
  const payload = JSON.stringify(channels.encryptForAll(JSON.stringify(init)));
  transport.message(JSON.stringify({ type: 'file', from: 'alice', nonce, timestamp: 0, payload, sessionId: 's' }));
  for await (const frame of frames()) {
    transport.binary(frame.buffer.slice(0));
  }
  return { nonce, chunks: init.chunks };
}

function randomBlob(size: number, mime: string): { blob: Blob; bytes: Uint8Array } {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 53 + 11) & 0xff;
  return { blob: new Blob([bytes], { type: mime }), bytes };
}

describe('streamed file over the relay/mesh wiring', () => {
  it('round-trips a multi-chunk file: init through ratchet, chunks routed by fileId', async () => {
    const m = handshake();
    const bob = new ReceiverNode(m['bob']);
    const { blob, bytes } = randomBlob(200 * 1024 + 77, 'video/mp4'); // ~3+ chunks at 64KB

    const transport: Transport = {
      message: (env) => bob.onMessage('alice', env),
      binary: (ab) => bob.onBinary('alice', ab),
    };
    const { nonce, chunks } = await streamFile(m['alice'], blob, { name: 'clip.mp4', mime: 'video/mp4' }, transport);

    expect(chunks).toBeGreaterThan(3);
    expect(bob.failed).toBe(false);
    expect(bob.result).not.toBeNull();
    expect(bob.progress).toBe(1);
    expect(bob.ackedNonce).toBe(nonce);

    const received = new Uint8Array(await (bob.result as Blob).arrayBuffer());
    expect(received).toEqual(bytes);
    expect((bob.result as Blob).type).toBe('video/mp4');
  });

  it('keeps the init opaque on the wire — no key or filename leaks to the relay', async () => {
    const m = handshake();
    let captured = '';
    const { blob } = randomBlob(100 * 1024, 'application/octet-stream');
    await streamFile(m['alice'], blob, { name: 'secret-dossier.bin', mime: 'application/octet-stream' }, {
      message: (env) => { captured = env; },
      binary: () => {},
    });
    expect(captured).not.toContain('secret-dossier');
    expect(captured).not.toContain('fileId');
    expect(captured).not.toContain('key');
  });

  it('rejects the whole transfer when a single chunk is tampered in transit', async () => {
    const m = handshake();
    const bob = new ReceiverNode(m['bob']);
    const { blob } = randomBlob(150 * 1024, 'application/octet-stream');

    let frameIdx = 0;
    const transport: Transport = {
      message: (env) => bob.onMessage('alice', env),
      binary: (ab) => {
        // Corrupt the second chunk's ciphertext mid-flight.
        if (frameIdx === 1) {
          const u8 = new Uint8Array(ab);
          u8[u8.length - 1] ^= 0x01;
        }
        frameIdx++;
        bob.onBinary('alice', ab);
      },
    };
    await streamFile(m['alice'], blob, { name: 'a.bin', mime: 'application/octet-stream' }, transport);

    expect(bob.failed).toBe(true);
    expect(bob.result).toBeNull();
    expect(bob.ackedNonce).toBeNull();
  });

  it('ignores binary frames whose sender does not match the init sender', async () => {
    const m = handshake();
    const bob = new ReceiverNode(m['bob']);
    const { blob } = randomBlob(100 * 1024, 'application/octet-stream');

    const transport: Transport = {
      message: (env) => bob.onMessage('alice', env),
      // A frame arriving from an impostor peer id must be dropped, not applied.
      binary: (ab) => bob.onBinary('mallory', ab),
    };
    await streamFile(m['alice'], blob, { name: 'a.bin', mime: 'application/octet-stream' }, transport);

    expect(bob.failed).toBe(false);
    expect(bob.result).toBeNull();
  });
});
