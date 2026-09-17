import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  STUN_KEY,
  DEFAULT_STUN_SETTING,
  isStunUrl,
  parseStunUrls,
  loadStunSetting,
  saveStunSetting,
  describeStunMode,
} from '../../src/stun-settings';

// The store runs in the browser; the node test env has no localStorage, so a
// minimal in-memory stand-in is installed per test.
function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const map = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  });
  return map;
}

describe('isStunUrl', () => {
  it('accepts stun:/stuns: and refuses relay or junk URLs', () => {
    expect(isStunUrl('stun:a.example:3478')).toBe(true);
    expect(isStunUrl('  STUNS:a.example ')).toBe(true);
    expect(isStunUrl('turn:a.example')).toBe(false);
    expect(isStunUrl('turns:a.example')).toBe(false);
    expect(isStunUrl('https://a.example')).toBe(false);
    expect(isStunUrl('')).toBe(false);
  });
});

describe('parseStunUrls', () => {
  it('splits on commas and whitespace, dropping anything that is not STUN', () => {
    expect(parseStunUrls('stun:a.example, turn:b.example\nstun:c.example')).toEqual([
      'stun:a.example',
      'stun:c.example',
    ]);
  });

  it('returns an empty list for blank or fully invalid input', () => {
    expect(parseStunUrls('   ')).toEqual([]);
    expect(parseStunUrls('turn:a.example, turns:b.example')).toEqual([]);
  });

  it('caps the list so a pasted blob cannot balloon the ICE config', () => {
    const many = Array.from({ length: 30 }, (_, i) => `stun:s${i}.example`).join(',');
    expect(parseStunUrls(many)).toHaveLength(8);
  });
});

describe('loadStunSetting', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('defaults when storage is unavailable', () => {
    vi.unstubAllGlobals();
    expect(loadStunSetting()).toEqual(DEFAULT_STUN_SETTING);
  });

  it('defaults when nothing is stored', () => {
    installStorage();
    expect(loadStunSetting()).toEqual(DEFAULT_STUN_SETTING);
  });

  it('defaults on malformed JSON rather than disabling connectivity', () => {
    installStorage({ [STUN_KEY]: '{not json' });
    expect(loadStunSetting()).toEqual(DEFAULT_STUN_SETTING);
  });

  it('round-trips a saved custom setting', () => {
    installStorage();
    saveStunSetting({ mode: 'custom', urls: ['stun:mine.example'] });
    expect(loadStunSetting()).toEqual({ mode: 'custom', urls: ['stun:mine.example'] });
  });

  it('round-trips off mode', () => {
    installStorage();
    saveStunSetting({ mode: 'off', urls: [] });
    expect(loadStunSetting()).toEqual({ mode: 'off', urls: [] });
  });

  it('drops relay URLs written by any other build', () => {
    installStorage({ [STUN_KEY]: JSON.stringify({ mode: 'custom', urls: ['stun:ok.example', 'turn:bad.example'] }) });
    expect(loadStunSetting()).toEqual({ mode: 'custom', urls: ['stun:ok.example'] });
  });

  it('falls back to default when a custom setting has no usable URL left', () => {
    installStorage({ [STUN_KEY]: JSON.stringify({ mode: 'custom', urls: ['turn:bad.example'] }) });
    expect(loadStunSetting()).toEqual(DEFAULT_STUN_SETTING);
  });

  it('treats an unknown mode as default', () => {
    installStorage({ [STUN_KEY]: JSON.stringify({ mode: 'relay-everything', urls: [] }) });
    expect(loadStunSetting().mode).toBe('default');
  });
});

describe('describeStunMode', () => {
  it('names each mode for the settings UI', () => {
    expect(describeStunMode({ mode: 'off', urls: [] })).toMatch(/LAN only/);
    expect(describeStunMode({ mode: 'default', urls: [] })).toMatch(/default/i);
    expect(describeStunMode({ mode: 'custom', urls: ['stun:a'] })).toBe('1 custom server');
    expect(describeStunMode({ mode: 'custom', urls: ['stun:a', 'stun:b'] })).toBe('2 custom servers');
  });
});
