import { generateKeyPairFromSeed } from '@stablelib/ed25519';
import { HKDF } from '@stablelib/hkdf';
import { SHA256 } from '@stablelib/sha256';
import {
  entropyToMnemonic,
  generateMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { KeyPairB64 } from '../shared/membership';

// Derivation for the Bunker ID: a durable Ed25519 identity behind a 12-word
// recovery phrase. Durable, not merely persistent — browser storage does not
// survive clearing site data, and a direct-mode relationship is worthless if the
// identity behind it cannot be restored on another device.
//
// Pure functions only; persistence and migration live in bunker-id-store.ts.

export const ENTROPY_BYTES = 16; // 128 bits -> 12 words
const HKDF_SALT = 'qb-bunker-id-v1';
const HKDF_INFO = 'ed25519';

const utf8 = (s: string) => new TextEncoder().encode(s);

export function encodeEntropy(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeEntropy(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(' ');
}

export function generatePhrase(): string {
  return generateMnemonic(wordlist, ENTROPY_BYTES * 8);
}

export function isValidPhrase(phrase: string): boolean {
  try {
    return validateMnemonic(normalizePhrase(phrase), wordlist);
  } catch {
    return false;
  }
}

// Returns null rather than throwing, because every caller is a form. BIP-39's
// checksum is what turns a mistyped word into a visible error instead of a
// silently different — and therefore empty — identity.
export function entropyFromPhrase(phrase: string): Uint8Array | null {
  const normalized = normalizePhrase(phrase);
  try {
    if (!validateMnemonic(normalized, wordlist)) return null;
    return mnemonicToEntropy(normalized, wordlist);
  } catch {
    return null;
  }
}

export function phraseFromEntropy(entropy: Uint8Array): string | null {
  if (entropy.length !== ENTROPY_BYTES) return null;
  try {
    return entropyToMnemonic(entropy, wordlist);
  } catch {
    return null;
  }
}

// The phrase bytes are not used as a signing seed directly: HKDF
// domain-separates this key from anything else the same phrase might later be
// asked to derive.
export function keyPairFromEntropy(entropy: Uint8Array): KeyPairB64 {
  const seed = new HKDF(SHA256, entropy, utf8(HKDF_SALT), utf8(HKDF_INFO)).expand(32);
  const kp = generateKeyPairFromSeed(seed);
  return { publicKey: encodeEntropy(kp.publicKey), secretKey: encodeEntropy(kp.secretKey) };
}

export function keyPairFromPhrase(phrase: string): KeyPairB64 | null {
  const entropy = entropyFromPhrase(phrase);
  return entropy ? keyPairFromEntropy(entropy) : null;
}
