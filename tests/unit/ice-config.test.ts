import { describe, it, expect } from 'vitest';
import {
  parseIceServers,
  getP2PIceConfig,
  stripRelayServers,
  resolveStunServers,
  hasStunConfigured,
  DEFAULT_STUN_SERVERS,
} from '../../src/transport/ice-config';
import { StunSetting } from '../../src/stun-settings';

const urlsOf = (servers: RTCIceServer[]): string[] =>
  servers.flatMap(s => (Array.isArray(s.urls) ? s.urls : [s.urls]));

describe('parseIceServers', () => {
  it('returns an empty list for missing or blank input', () => {
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

describe('resolveStunServers precedence', () => {
  const custom = (urls: string[]): StunSetting => ({ mode: 'custom', urls });

  it('falls back to the built-in public STUN servers when nothing is configured', () => {
    expect(resolveStunServers({})).toEqual(DEFAULT_STUN_SERVERS);
    expect(resolveStunServers({}, { mode: 'default', urls: [] })).toEqual(DEFAULT_STUN_SERVERS);
  });

  it('never includes a relay URL in the built-in defaults', () => {
    const urls = urlsOf(resolveStunServers({}));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.some(u => u.startsWith('turn:') || u.startsWith('turns:'))).toBe(false);
  });

  it('returns an empty list in `off` mode, overriding every other source', () => {
    const off: StunSetting = { mode: 'off', urls: [] };
    expect(resolveStunServers({}, off)).toEqual([]);
    expect(resolveStunServers({ VITE_STUN_URL: 'stun:self.example' }, off)).toEqual([]);
    expect(resolveStunServers({ VITE_ICE_SERVERS: '[{"urls":"stun:a.example"}]' }, off)).toEqual([]);
  });

  it('prefers a custom user setting over both env vars and the defaults', () => {
    const env = { VITE_STUN_URL: 'stun:env.example', VITE_ICE_SERVERS: '[{"urls":"stun:json.example"}]' };
    expect(resolveStunServers(env, custom(['stun:user.example']))).toEqual([{ urls: 'stun:user.example' }]);
  });

  it('strips relay URLs from a custom user setting', () => {
    expect(resolveStunServers({}, custom(['stun:user.example', 'turn:user.example'])))
      .toEqual([{ urls: 'stun:user.example' }]);
  });

  it('falls through to env when a custom setting has no usable URL left', () => {
    expect(resolveStunServers({ VITE_STUN_URL: 'stun:env.example' }, custom(['turn:only.example'])))
      .toEqual([{ urls: ['stun:env.example'] }]);
  });

  it('prefers VITE_ICE_SERVERS over VITE_STUN_URL and strips relay entries', () => {
    const json = JSON.stringify([{ urls: 'stun:a.example' }, { urls: ['turn:b.example'], username: 'u', credential: 'p' }]);
    expect(resolveStunServers({ VITE_ICE_SERVERS: json, VITE_STUN_URL: 'stun:ignored.example' }))
      .toEqual([{ urls: 'stun:a.example' }]);
  });

  it('uses VITE_STUN_URL (comma-separated), stripping any relay URL', () => {
    expect(resolveStunServers({ VITE_STUN_URL: 'stun:self.example:3478, turn:self.example:3478' }))
      .toEqual([{ urls: ['stun:self.example:3478'] }]);
  });
});

describe('hasStunConfigured', () => {
  it('distinguishes a reflection-capable config from an empty one', () => {
    expect(hasStunConfigured({ iceServers: [] })).toBe(false);
    expect(hasStunConfigured({})).toBe(false);
    expect(hasStunConfigured({ iceServers: [{ urls: 'stun:a.example' }] })).toBe(true);
  });
});

describe('getP2PIceConfig', () => {
  it('reflects by default and never configures a relay', () => {
    const cfg = getP2PIceConfig();
    const urls = urlsOf(cfg.iceServers ?? []);
    expect(urls.length).toBeGreaterThan(0);
    // Bandwidth-costing TURN is barred regardless of how the list was resolved.
    expect(urls.some(u => u.startsWith('turn:') || u.startsWith('turns:'))).toBe(false);
  });

  it('pre-gathers candidates so trickle ICE is not the only source', () => {
    expect(getP2PIceConfig().iceCandidatePoolSize).toBeGreaterThan(0);
  });
});
