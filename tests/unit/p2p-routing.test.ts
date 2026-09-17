import { describe, it, expect } from 'vitest';
import {
  P2P_FILE_THRESHOLD_BYTES,
  RELAY_FANOUT_MAX_PEERS,
  requiresDirectPath,
  exceedsRelayFanout,
  classifyIceFailure,
  describeP2PFailure,
  p2pReducer,
  meshStateToEvent,
  P2PFailureReason,
} from '../../src/transport/p2p-policy';
import { MAX_FILE_BYTES } from '../../src/file-transfer';

const MB = 1024 * 1024;

describe('relay/direct routing at the 1 MB boundary', () => {
  it('keeps the threshold and the relay file cap in agreement', () => {
    // If these diverge, a file can be too big to relay but not big enough to be
    // routed direct — an unsendable gap. The composer's error text cites
    // MAX_FILE_BYTES, so a mismatch also makes the message wrong.
    expect(P2P_FILE_THRESHOLD_BYTES).toBe(MAX_FILE_BYTES);
    expect(P2P_FILE_THRESHOLD_BYTES).toBe(1 * MB);
  });

  it('relays everything below the threshold', () => {
    expect(requiresDirectPath(0)).toBe(false);
    expect(requiresDirectPath(64 * 1024)).toBe(false);
    // A minute of Opus voice: ~180 KB. Under the old 64 KB threshold this was
    // forced onto a direct path that could not connect, so it never sent.
    expect(requiresDirectPath(180 * 1024)).toBe(false);
    expect(requiresDirectPath(1 * MB - 1)).toBe(false);
  });

  it('forces the direct path at and above the threshold', () => {
    expect(requiresDirectPath(1 * MB)).toBe(true);
    expect(requiresDirectPath(5 * MB)).toBe(true);
  });

  it('refuses a non-finite size rather than routing it', () => {
    expect(requiresDirectPath(Number.NaN)).toBe(false);
    expect(requiresDirectPath(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('exceedsRelayFanout', () => {
  it('permits the relay path for small vaults', () => {
    for (let n = 0; n <= RELAY_FANOUT_MAX_PEERS; n++) expect(exceedsRelayFanout(n)).toBe(false);
  });

  it('forces the direct path once per-recipient ciphertext fan-out gets costly', () => {
    expect(exceedsRelayFanout(RELAY_FANOUT_MAX_PEERS + 1)).toBe(true);
    expect(exceedsRelayFanout(10)).toBe(true);
  });
});

describe('classifyIceFailure', () => {
  it('blames the switched-off setting before anything else', () => {
    expect(classifyIceFailure(false, false)).toBe('no-stun');
    expect(classifyIceFailure(false, true)).toBe('no-stun');
  });

  it('reports a missing reflexive candidate when STUN was available', () => {
    expect(classifyIceFailure(true, false)).toBe('no-reflexive-candidate');
  });

  it('reports symmetric NAT when a public address was found but no route worked', () => {
    expect(classifyIceFailure(true, true)).toBe('symmetric-nat');
  });
});

describe('describeP2PFailure', () => {
  const reasons: P2PFailureReason[] = [
    'no-stun', 'no-reflexive-candidate', 'symmetric-nat', 'timeout', 'signaling-error', 'peer-left',
  ];

  it('gives every reason its own non-empty explanation', () => {
    const texts = reasons.map(describeP2PFailure);
    expect(new Set(texts).size).toBe(reasons.length);
    for (const t of texts) expect(t.length).toBeGreaterThan(20);
  });

  it('tells a mobile-data user to try WiFi on the symmetric-NAT path', () => {
    expect(describeP2PFailure('symmetric-nat')).toMatch(/WiFi/i);
    expect(describeP2PFailure('symmetric-nat')).toMatch(/mobile data/i);
  });

  it('points at the connection setting when reflection is off', () => {
    expect(describeP2PFailure('no-stun')).toMatch(/STUN/);
  });
});

describe('dropped link state', () => {
  it('surfaces a link that dies after being established', () => {
    // `fail` deliberately cannot downgrade a connected peer (transient ICE blips
    // would otherwise flap the UI), which is why a real mid-session death needs
    // its own event — without it the dead channel stayed reported as connected.
    expect(p2pReducer('connected', 'fail')).toBe('connected');
    expect(p2pReducer('connected', 'drop')).toBe('dropped');
  });

  it('ignores a drop for a peer that was never connected', () => {
    expect(p2pReducer('connecting', 'drop')).toBe('connecting');
    expect(p2pReducer('failed', 'drop')).toBe('failed');
    expect(p2pReducer('idle', 'drop')).toBe('idle');
  });

  it('lets a fresh attempt revive a dropped peer', () => {
    expect(p2pReducer('dropped', 'ensure')).toBe('connecting');
    expect(p2pReducer('dropped', 'open')).toBe('connected');
  });

  it('maps the mesh dropped state onto the drop event', () => {
    expect(meshStateToEvent('dropped')).toBe('drop');
    expect(meshStateToEvent('failed')).toBe('fail');
  });
});
