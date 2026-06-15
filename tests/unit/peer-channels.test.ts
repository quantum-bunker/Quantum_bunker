import { describe, it, expect } from 'vitest';
import { PeerChannels, NoiseFrame } from '../../src/crypto/peer-channels';

function mesh(...ids: string[]): Record<string, PeerChannels> {
  const managers: Record<string, PeerChannels> = {};
  for (const id of ids) {
    managers[id] = new PeerChannels({
      sessionId: 'test-session',
      selfId: id,
      sendNoise: (to: string, frame: NoiseFrame) => managers[to]?.onSignal(id, frame),
    });
  }
  return managers;
}

function connect(managers: Record<string, PeerChannels>): void {
  const ids = Object.keys(managers);
  for (const a of ids) {
    for (const b of ids) {
      if (a !== b) managers[a].ensureChannel(b);
    }
  }
}

describe('PeerChannels', () => {
  it('completes a pairwise handshake and round-trips a message', () => {
    const m = mesh('peer-a', 'peer-b');
    connect(m);

    expect(m['peer-a'].isReady('peer-b')).toBe(true);
    expect(m['peer-b'].isReady('peer-a')).toBe(true);

    const payload = m['peer-a'].encryptForAll('hello bob');
    expect(payload.c['peer-b']).toMatchObject({ h: expect.any(Object), ct: expect.any(String) });
    expect(payload.c['peer-b'].ct).not.toContain('hello');
    expect(m['peer-b'].decryptFrom('peer-a', payload)).toBe('hello bob');

    const reply = m['peer-b'].encryptForAll('hi alice');
    expect(m['peer-a'].decryptFrom('peer-b', reply)).toBe('hi alice');
  });

  it('agrees on the same safety number on both sides', () => {
    const m = mesh('peer-a', 'peer-b');
    connect(m);
    expect(m['peer-a'].safetyNumbers()['peer-b']).toBe(m['peer-b'].safetyNumbers()['peer-a']);
    expect(m['peer-a'].safetyNumbers()['peer-b']).toMatch(/^(\d{5} ){5}\d{5}$/);
  });

  it('assigns deterministic initiator/responder roles by peer id', () => {
    // Connecting in either trigger order must still converge.
    const m = mesh('peer-b', 'peer-a');
    m['peer-b'].ensureChannel('peer-a');
    m['peer-a'].ensureChannel('peer-b');
    expect(m['peer-a'].isReady('peer-b')).toBe(true);
    expect(m['peer-b'].isReady('peer-a')).toBe(true);
  });

  it('supports a three-peer mesh where every pair can talk', () => {
    const m = mesh('peer-a', 'peer-b', 'peer-c');
    connect(m);

    const fromA = m['peer-a'].encryptForAll('group hello');
    expect(Object.keys(fromA.c).sort()).toEqual(['peer-b', 'peer-c']);
    expect(m['peer-b'].decryptFrom('peer-a', fromA)).toBe('group hello');
    expect(m['peer-c'].decryptFrom('peer-a', fromA)).toBe('group hello');
  });

  it('keeps consecutive messages decryptable in order', () => {
    const m = mesh('peer-a', 'peer-b');
    connect(m);
    const p1 = m['peer-a'].encryptForAll('one');
    const p2 = m['peer-a'].encryptForAll('two');
    expect(m['peer-b'].decryptFrom('peer-a', p1)).toBe('one');
    expect(m['peer-b'].decryptFrom('peer-a', p2)).toBe('two');
  });

  it('returns null when no channel exists or slot is missing', () => {
    const m = mesh('peer-a', 'peer-b');
    connect(m);
    expect(m['peer-a'].decryptFrom('peer-unknown', { c: {} })).toBeNull();
    expect(m['peer-b'].decryptFrom('peer-a', { c: { 'peer-other': { h: { dh: 'x', n: 0, pn: 0 }, ct: 'x' } } })).toBeNull();
  });

  it('handles out-of-order delivery via skipped message keys', () => {
    const m = mesh('peer-a', 'peer-b');
    connect(m);
    const p1 = m['peer-a'].encryptForAll('first');
    const p2 = m['peer-a'].encryptForAll('second');
    const p3 = m['peer-a'].encryptForAll('third');
    // Deliver out of order: 2, 1, 3
    expect(m['peer-b'].decryptFrom('peer-a', p2)).toBe('second');
    expect(m['peer-b'].decryptFrom('peer-a', p1)).toBe('first');
    expect(m['peer-b'].decryptFrom('peer-a', p3)).toBe('third');
  });

  it('each message uses a unique ciphertext (per-message key)', () => {
    const m = mesh('peer-a', 'peer-b');
    connect(m);
    const p1 = m['peer-a'].encryptForAll('hello');
    const p2 = m['peer-a'].encryptForAll('hello');
    // Same plaintext → different ciphertexts (ratchet produces different keys)
    expect(p1.c['peer-b'].ct).not.toBe(p2.c['peer-b'].ct);
  });

  it('returns matching fingerprints for each peer', () => {
    const m = mesh('peer-a', 'peer-b');
    connect(m);
    const fpFromA = m['peer-a'].fingerprints()['peer-b'];
    const fpFromB = m['peer-b'].fingerprints()['peer-a'];
    // A's view of B's fingerprint should equal B's own fingerprint, and vice versa
    expect(fpFromA).toBe(m['peer-b'].ownFingerprint());
    expect(fpFromB).toBe(m['peer-a'].ownFingerprint());
    expect(fpFromA).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails the handshake when a transcript is replayed into a different session', () => {
    // peer-a and peer-b each believe they are in a different session, so their
    // prologues diverge. Relaying one side's handshake frames to the other (a
    // captured-transcript replay across sessions) must never complete.
    const a = new PeerChannels({
      sessionId: 'session-A',
      selfId: 'peer-a',
      sendNoise: (to: string, frame: NoiseFrame) => { if (to === 'peer-b') b.onSignal('peer-a', frame); },
    });
    const b = new PeerChannels({
      sessionId: 'session-B',
      selfId: 'peer-b',
      sendNoise: (to: string, frame: NoiseFrame) => { if (to === 'peer-a') a.onSignal('peer-b', frame); },
    });

    a.ensureChannel('peer-b');
    b.ensureChannel('peer-a');

    expect(a.isReady('peer-b')).toBe(false);
    expect(b.isReady('peer-a')).toBe(false);
  });

  it('drops a removed peer', () => {
    const m = mesh('peer-a', 'peer-b');
    connect(m);
    m['peer-a'].removePeer('peer-b');
    expect(m['peer-a'].isReady('peer-b')).toBe(false);
    expect(m['peer-a'].encryptForAll('x').c['peer-b']).toBeUndefined();
  });
});
