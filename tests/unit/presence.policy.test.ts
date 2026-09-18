import { describe, it, expect } from 'vitest';
import { stalePeerIds } from '../../src/backend/core/policies/presence.policy';
import { SessionPeer } from '../../src/shared/contracts/v1/session';

const peer = (id: string, lastSeenAt: number): SessionPeer => ({ id, joinedAt: 0, lastSeenAt });

describe('stalePeerIds', () => {
  const now = 1_000_000;
  const grace = 30_000;

  it('keeps peers that still hold a live socket', () => {
    const peers = { a: peer('a', 0), b: peer('b', 0) };
    expect(stalePeerIds(peers, new Set(['a', 'b']), 'host', now, grace)).toEqual([]);
  });

  it('keeps a departed peer inside the reconnect grace window', () => {
    const peers = { a: peer('a', now - 1_000) };
    expect(stalePeerIds(peers, new Set(), 'host', now, grace)).toEqual([]);
  });

  it('reclaims a departed peer past the grace window', () => {
    const peers = { a: peer('a', now - grace - 1) };
    expect(stalePeerIds(peers, new Set(), 'host', now, grace)).toEqual(['a']);
  });

  it('never reclaims the host slot', () => {
    const peers = { host: peer('host', 0) };
    expect(stalePeerIds(peers, new Set(), 'host', now, grace)).toEqual([]);
  });

  it('reclaims only the peers that are both gone and past grace', () => {
    const peers = {
      host: peer('host', 0),
      live: peer('live', 0),
      recent: peer('recent', now - 1_000),
      gone: peer('gone', now - grace - 1),
    };
    expect(stalePeerIds(peers, new Set(['live']), 'host', now, grace)).toEqual(['gone']);
  });
});
