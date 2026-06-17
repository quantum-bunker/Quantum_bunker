import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  contactStatus,
  hasKeyChanged,
  contactKey,
  loadPins,
  savePins,
  pinContact,
  unpinContact,
  VERIFIED_CONTACTS_KEY,
  PinnedContact,
} from '../../src/contact-verification';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

const pin = (fingerprint: string): PinnedContact => ({ fingerprint, verifiedAt: 1700000000000 });

describe('contactStatus — change detection', () => {
  it('is unverified when there is no pin', () => {
    expect(contactStatus(undefined, 'aabbcc')).toBe('unverified');
  });

  it('is unverified when the live key is not known yet', () => {
    expect(contactStatus(pin('aabbcc'), null)).toBe('unverified');
    expect(contactStatus(pin('aabbcc'), undefined)).toBe('unverified');
  });

  it('is verified when the pinned fingerprint matches the live one', () => {
    expect(contactStatus(pin('aabbcc'), 'aabbcc')).toBe('verified');
  });

  it('is changed when a pinned peer presents a different fingerprint', () => {
    expect(contactStatus(pin('aabbcc'), 'deadbeef')).toBe('changed');
    expect(hasKeyChanged(pin('aabbcc'), 'deadbeef')).toBe(true);
    expect(hasKeyChanged(pin('aabbcc'), 'aabbcc')).toBe(false);
  });
});

describe('pin store (localStorage TOFU)', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('round-trips pins through localStorage', () => {
    const key = contactKey('sess-1', 'peer-b');
    const next = pinContact(loadPins(), key, 'aabbcc');
    savePins(next);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(VERIFIED_CONTACTS_KEY, expect.any(String));
    expect(loadPins()[key]).toMatchObject({ fingerprint: 'aabbcc' });
  });

  it('re-pinning overwrites the previous fingerprint (re-verification path)', () => {
    const key = contactKey('sess-1', 'peer-b');
    let pins = pinContact(loadPins(), key, 'aabbcc');
    expect(contactStatus(pins[key], 'aabbcc')).toBe('verified');

    // Simulate a key change: live key now differs from the pin.
    expect(contactStatus(pins[key], 'deadbeef')).toBe('changed');

    // User re-verifies against the new key out of band.
    pins = pinContact(pins, key, 'deadbeef');
    expect(contactStatus(pins[key], 'deadbeef')).toBe('verified');
  });

  it('unpin removes the entry and clears the changed state', () => {
    const key = contactKey('sess-1', 'peer-b');
    const pins = unpinContact(pinContact(loadPins(), key, 'aabbcc'), key);
    expect(pins[key]).toBeUndefined();
    expect(contactStatus(pins[key], 'deadbeef')).toBe('unverified');
  });

  it('scopes pins per session+peer so an identical peerId in another vault is independent', () => {
    const pins = pinContact(pinContact(loadPins(), contactKey('sess-1', 'peer-b'), 'aaaa'), contactKey('sess-2', 'peer-b'), 'bbbb');
    expect(contactStatus(pins[contactKey('sess-1', 'peer-b')], 'aaaa')).toBe('verified');
    expect(contactStatus(pins[contactKey('sess-2', 'peer-b')], 'aaaa')).toBe('changed');
  });

  it('tolerates corrupt localStorage by returning an empty map', () => {
    localStorageMock.getItem.mockReturnValueOnce('{not json');
    expect(loadPins()).toEqual({});
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({ bad: { nofp: true } }));
    expect(loadPins()).toEqual({});
  });
});
