import { describe, it, expect } from 'vitest';
import { isOfferer, shouldUseP2P, WebRTCMesh } from '../../src/transport/webrtc-mesh';

describe('isOfferer', () => {
  it('makes the lexicographically-smaller peer the offerer', () => {
    expect(isOfferer('peer-a', 'peer-b')).toBe(true);
    expect(isOfferer('peer-b', 'peer-a')).toBe(false);
  });

  it('agrees with the inverse on the other side (exactly one offerer per pair)', () => {
    expect(isOfferer('peer-a', 'peer-c')).not.toBe(isOfferer('peer-c', 'peer-a'));
  });
});

describe('shouldUseP2P', () => {
  const connected = (ids: string[]) => (id: string) => ids.includes(id);

  it('is false when there are no other peers', () => {
    expect(shouldUseP2P([], connected([]))).toBe(false);
  });

  it('is true only when every other peer has an open channel', () => {
    expect(shouldUseP2P(['peer-b'], connected(['peer-b']))).toBe(true);
    expect(shouldUseP2P(['peer-b', 'peer-c'], connected(['peer-b', 'peer-c']))).toBe(true);
  });

  it('is false when any peer lacks a channel (avoids mixed-mode duplicate delivery)', () => {
    expect(shouldUseP2P(['peer-b', 'peer-c'], connected(['peer-b']))).toBe(false);
    expect(shouldUseP2P(['peer-b'], connected([]))).toBe(false);
  });
});

// The mesh class itself had no coverage (and is excluded from the coverage
// report), so its resource-teardown behaviour was unverified.
describe('WebRTCMesh transport teardown', () => {
  class FakeDataChannel {
    binaryType = '';
    readyState = 'connecting';
    closed = false;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((e: any) => void) | null = null;
    close() {
      this.closed = true;
      this.readyState = 'closed';
    }
  }

  class FakePeerConnection {
    static instances: FakePeerConnection[] = [];
    closed = false;
    channel = new FakeDataChannel();
    oniceconnectionstatechange: (() => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    onicecandidate: ((e: any) => void) | null = null;
    ondatachannel: ((e: any) => void) | null = null;
    iceConnectionState = 'new';
    connectionState = 'new';
    signalingState = 'stable';
    constructor() {
      FakePeerConnection.instances.push(this);
    }
    createDataChannel() {
      return this.channel;
    }
    async createOffer() {
      return { type: 'offer', sdp: 'x' };
    }
    async createAnswer() {
      return { type: 'answer', sdp: 'x' };
    }
    async setLocalDescription() {}
    async setRemoteDescription() {}
    async addIceCandidate() {}
    restartIce() {}
    close() {
      this.closed = true;
    }
  }

  const install = () => {
    FakePeerConnection.instances = [];
    (globalThis as any).RTCPeerConnection = FakePeerConnection;
  };

  const newMesh = () =>
    new WebRTCMesh({
      selfId: 'peer-a',
      sendRtc: () => {},
      onMessage: () => {},
      onStateChange: () => {},
    });

  it('closes the peer connection when a link is declared failed', () => {
    install();
    const mesh = newMesh();
    mesh.ensurePeer('peer-b');
    const pc = FakePeerConnection.instances[0];
    expect(pc.closed).toBe(false);

    // Drive the peer to a terminal failure the way an ICE error would.
    (mesh as any).markFailed('peer-b', 'timeout');

    expect(pc.closed).toBe(true);
    expect(pc.channel.closed).toBe(true);
  });

  it('closes the peer connection when a live link drops', () => {
    install();
    const mesh = newMesh();
    mesh.ensurePeer('peer-b');
    const pc = FakePeerConnection.instances[0];
    (mesh as any).peers.get('peer-b').state = 'connected';

    (mesh as any).markDropped('peer-b');

    expect(pc.closed).toBe(true);
  });

  it('clears pending timers so nothing fires into a dead connection', () => {
    install();
    const mesh = newMesh();
    mesh.ensurePeer('peer-b');
    const peer = (mesh as any).peers.get('peer-b');
    peer.flushTimer = setTimeout(() => {}, 60_000);

    (mesh as any).markFailed('peer-b', 'timeout');

    expect(peer.timer).toBeNull();
    expect(peer.flushTimer).toBeNull();
  });

  it('does not strand a previous data channel when one is rewired', () => {
    install();
    const mesh = newMesh();
    mesh.ensurePeer('peer-b');
    const peer = (mesh as any).peers.get('peer-b');
    const first = peer.dc ?? new FakeDataChannel();
    peer.dc = first;

    const second = new FakeDataChannel();
    (mesh as any).wireDataChannel('peer-b', peer, second);

    expect(first.closed).toBe(true);
    expect(peer.dc).toBe(second);
  });
});
