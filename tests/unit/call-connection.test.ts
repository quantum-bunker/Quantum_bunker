import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CallConnection, CallSignal, isAddressedTo } from '../../src/transport/call-connection';

// RTCPeerConnection is browser-only. A minimal stand-in captures the handlers
// CallConnection installs so the batching and receive paths can be driven
// directly, without a browser or a real ICE agent.
class FakePeerConnection {
  onicecandidate: ((e: { candidate: FakeCandidate | null }) => void) | null = null;
  ontrack: unknown = null;
  onnegotiationneeded: unknown = null;
  onconnectionstatechange: unknown = null;
  oniceconnectionstatechange: unknown = null;
  connectionState = 'new';
  iceConnectionState = 'new';
  signalingState = 'stable';
  localDescription: RTCSessionDescriptionInit | null = null;
  readonly added: RTCIceCandidateInit[] = [];

  async addIceCandidate(c: RTCIceCandidateInit): Promise<void> { this.added.push(c); }
  async setRemoteDescription(): Promise<void> {}
  async setLocalDescription(): Promise<void> {}
  addTrack(): unknown { return {}; }
  getSenders(): unknown[] { return []; }
  close(): void {}
}

interface FakeCandidate {
  type: string;
  toJSON: () => RTCIceCandidateInit;
}

const candidate = (type: string, id: string): FakeCandidate => ({
  type,
  toJSON: () => ({ candidate: id, sdpMid: '0' }),
});

let lastPc: FakePeerConnection;

function build() {
  const sent: Omit<CallSignal, 'kind' | 'to'>[] = [];
  const states: string[] = [];
  const conn = new CallConnection({
    selfId: 'aaa',
    peerId: 'zzz',
    sendSignal: (s) => sent.push(s),
    onRemoteStream: () => {},
    onState: (st) => states.push(st),
  });
  return { conn, sent, states, pc: lastPc };
}

describe('CallConnection ICE candidate batching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('RTCPeerConnection', function (this: unknown) {
      lastPc = new FakePeerConnection();
      return lastPc;
    });
    vi.stubGlobal('MediaStream', class { getTracks() { return []; } removeTrack() {} });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('collapses a trickle burst into a single envelope', () => {
    const { sent, pc } = build();
    for (let i = 0; i < 12; i++) pc.onicecandidate?.({ candidate: candidate('host', `c${i}`) });

    // Nothing has gone out yet — the batch window is still open.
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(100);

    // Twelve candidates, one envelope, instead of twelve envelopes against a
    // per-peer limit of ten per second.
    expect(sent).toHaveLength(1);
    expect(sent[0].call).toBe('ice');
    expect(sent[0].candidates).toHaveLength(12);
    expect(sent[0].candidate).toBeUndefined();
  });

  it('opens a fresh batch for candidates gathered after a flush', () => {
    const { sent, pc } = build();
    pc.onicecandidate?.({ candidate: candidate('host', 'a') });
    vi.advanceTimersByTime(100);
    pc.onicecandidate?.({ candidate: candidate('host', 'b') });
    vi.advanceTimersByTime(100);
    expect(sent).toHaveLength(2);
    expect(sent[1].candidates).toHaveLength(1);
  });

  it('ignores the end-of-gathering null candidate', () => {
    const { sent, pc } = build();
    pc.onicecandidate?.({ candidate: null });
    vi.advanceTimersByTime(100);
    expect(sent).toHaveLength(0);
  });

  it('records whether a reflexive candidate was ever gathered', () => {
    const { conn, pc } = build();
    expect(conn.gatheredReflexive).toBe(false);
    pc.onicecandidate?.({ candidate: candidate('host', 'h') });
    expect(conn.gatheredReflexive).toBe(false);
    pc.onicecandidate?.({ candidate: candidate('srflx', 's') });
    expect(conn.gatheredReflexive).toBe(true);
  });

  it('accepts a batched ice frame once the remote description is set', async () => {
    const { conn, pc } = build();
    await conn.onSignal({ kind: 'call', call: 'sdp', to: 'aaa', sdp: { type: 'answer', sdp: 'x' } as any });
    await conn.onSignal({
      kind: 'call', call: 'ice', to: 'aaa',
      candidates: [{ candidate: 'x' }, { candidate: 'y' }],
    });
    expect(pc.added).toEqual([{ candidate: 'x' }, { candidate: 'y' }]);
  });

  it('still accepts the previous single-candidate shape', async () => {
    const { conn, pc } = build();
    await conn.onSignal({ kind: 'call', call: 'sdp', to: 'aaa', sdp: { type: 'answer', sdp: 'x' } as any });
    await conn.onSignal({ kind: 'call', call: 'ice', to: 'aaa', candidate: { candidate: 'legacy' } });
    expect(pc.added).toEqual([{ candidate: 'legacy' }]);
  });

  // Both sides batch trickle ICE over the same rate-limited relay, so an 'ice'
  // frame routinely arrives before the 'sdp' it belongs to. Adding a candidate
  // with no remote description throws InvalidStateError, which used to fail the
  // whole call.
  it('buffers candidates that arrive before the remote description', async () => {
    const { conn, pc, states } = build();
    await conn.onSignal({
      kind: 'call', call: 'ice', to: 'aaa',
      candidates: [{ candidate: 'early-1' }, { candidate: 'early-2' }],
    });
    expect(pc.added).toEqual([]);
    expect(states).not.toContain('failed');

    await conn.onSignal({ kind: 'call', call: 'sdp', to: 'aaa', sdp: { type: 'answer', sdp: 'x' } as any });
    expect(pc.added).toEqual([{ candidate: 'early-1' }, { candidate: 'early-2' }]);
  });

  it('one unusable candidate does not fail the call', async () => {
    const { conn, pc, states } = build();
    pc.addIceCandidate = async (c: any) => {
      if (c.candidate === 'bad') throw new Error('InvalidStateError');
      pc.added.push(c);
    };
    await conn.onSignal({ kind: 'call', call: 'sdp', to: 'aaa', sdp: { type: 'answer', sdp: 'x' } as any });
    await conn.onSignal({
      kind: 'call', call: 'ice', to: 'aaa',
      candidates: [{ candidate: 'bad' }, { candidate: 'good' }],
    });
    expect(pc.added).toEqual([{ candidate: 'good' }]);
    expect(states).not.toContain('failed');
  });
});

describe('isAddressedTo', () => {
  const frame = (to: string): CallSignal => ({ kind: 'call', call: 'invite', to });

  it('accepts a frame addressed to this peer', () => {
    expect(isAddressedTo(frame('me'), 'me')).toBe(true);
  });

  it('rejects a frame addressed to someone else', () => {
    // The regression this guards: in a 3+ peer vault the relay broadcasts an
    // invite to everyone, and an unaddressed peer would ring and have its chat
    // covered by the fullscreen call modal.
    expect(isAddressedTo(frame('someone-else'), 'me')).toBe(false);
  });

  it('rejects everything before this peer has an id', () => {
    expect(isAddressedTo(frame('me'), null)).toBe(false);
    expect(isAddressedTo(frame(''), null)).toBe(false);
  });

  it('does not treat an empty addressee as a wildcard', () => {
    expect(isAddressedTo(frame(''), 'me')).toBe(false);
  });
});
