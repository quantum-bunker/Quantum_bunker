import { describe, it, expect } from 'vitest';
import { parseIceServers, getP2PIceConfig, stripRelayServers, resolveStunServers } from '../../src/transport/ice-config';

describe('parseIceServers', () => {
  it('defaults to an empty list (no third-party STUN)', () => {
    expect(parseIceServers(undefined)).toEqual([]);
    expect(parseIceServers('')).toEqual([]);
    expect(parseIceServers('   ')).toEqual([]);
  });

  it('parses a comma-separated URL list', () => {
    expect(parseIceServers('stun:a.example:3478, turn:b.example:3478')).toEqual([
      { urls: ['stun:a.example:3478', 'turn:b.example:3478'] },
    ]);
  });

  it('parses a JSON array of RTCIceServer objects', () => {
    const json = JSON.stringify([
      { urls: 'stun:a.example' },
      { urls: ['turn:b.example'], username: 'u', credential: 'p' },
    ]);
    expect(parseIceServers(json)).toEqual([
      { urls: 'stun:a.example' },
      { urls: ['turn:b.example'], username: 'u', credential: 'p' },
    ]);
  });

  it('falls back to empty on malformed JSON', () => {
    expect(parseIceServers('[not json')).toEqual([]);
    expect(parseIceServers('[1, 2, 3]')).toEqual([]); // entries without `urls`
    expect(parseIceServers('{"urls":"x"}')).toEqual([{ urls: ['{"urls":"x"}'] }]); // non-array treated as URL token
  });
});

describe('stripRelayServers', () => {
  it('removes turn:/turns: URLs and keeps stun:', () => {
    expect(stripRelayServers([{ urls: ['stun:a.example', 'turn:b.example'] }])).toEqual([
      { urls: 'stun:a.example' },
    ]);
    expect(stripRelayServers([{ urls: ['turns:b.example'], username: 'u', credential: 'p' }])).toEqual([]);
    expect(stripRelayServers([{ urls: 'stun:a.example' }])).toEqual([{ urls: 'stun:a.example' }]);
  });
});

describe('resolveStunServers', () => {
  it('returns an empty list when nothing is configured (host candidates only)', () => {
    expect(resolveStunServers({})).toEqual([]);
  });

  it('uses VITE_STUN_URL (comma-separated), stripping any relay URL', () => {
    expect(resolveStunServers({ VITE_STUN_URL: 'stun:self.example:3478, turn:self.example:3478' }))
      .toEqual([{ urls: ['stun:self.example:3478'] }]);
  });

  it('prefers VITE_ICE_SERVERS and strips relay entries', () => {
    const json = JSON.stringify([{ urls: 'stun:a.example' }, { urls: ['turn:b.example'], username: 'u', credential: 'p' }]);
    expect(resolveStunServers({ VITE_ICE_SERVERS: json })).toEqual([{ urls: 'stun:a.example' }]);
  });
});

describe('getP2PIceConfig', () => {
  it('defaults to no ICE servers (host-only) and never a relay when unconfigured', () => {
    const cfg = getP2PIceConfig();
    const urls = (cfg.iceServers ?? []).flatMap(s => (Array.isArray(s.urls) ? s.urls : [s.urls]));
    // Unconfigured => empty (anonymous, LAN-only). Never a bandwidth-costing TURN server.
    expect(urls.some(u => u.startsWith('turn:') || u.startsWith('turns:'))).toBe(false);
  });
});
