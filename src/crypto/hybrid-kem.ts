// Post-quantum KEM for the initial key agreement.
//
// Library choice: @noble/post-quantum (paulmillr/noble-post-quantum). Chosen
// because it is an audited, dependency-light, pure-TS implementation of the
// FIPS 203 ML-KEM standard from the same author as the @noble/* primitives this
// project already trusts. We use ML-KEM-768 (the NIST "Kyber" level-3 set), the
// recommended default balancing security margin and message size.
//
// HYBRID, not replacement: the session root is derived from BOTH the classical
// X25519 secret (the Noise XX chaining key) AND the ML-KEM shared secret,
// combined with HKDF-SHA256. A break of either primitive alone — a future
// quantum attack on X25519, or an undiscovered flaw in the (younger) ML-KEM
// implementation — leaves the combined secret secure. This is why we never ship
// PQ-only: it guards against PQ-library bugs.
//
// KNOWN LIMITATION: only the INITIAL key agreement is PQ-hardened. The ongoing
// double-ratchet DH steps remain classical X25519 (see double-ratchet.ts) —
// ratcheting a PQ KEM is out of scope. A quantum adversary who compromises a
// live ratchet's DH could read forward from that point, but the initial
// agreement (and thus harvest-now-decrypt-later resistance) is protected.

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { HKDF } from '@stablelib/hkdf';
import { SHA256 } from '@stablelib/sha256';
import { HASHLEN, concatBytes, utf8 } from './noise-primitives';

export const KEM_PUBLIC_KEY_BYTES = 1184;
export const KEM_CIPHERTEXT_BYTES = 1088;
export const KEM_SHARED_SECRET_BYTES = 32;

const HYBRID_INFO = utf8('Quantum Bunker Hybrid KEM v1 (X25519 + ML-KEM-768)');

export interface KemKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface KemEncapsulation {
  ciphertext: Uint8Array;
  sharedSecret: Uint8Array;
}

export function generateKemKeyPair(): KemKeyPair {
  const { publicKey, secretKey } = ml_kem768.keygen();
  return { publicKey, secretKey };
}

export function kemEncapsulate(remotePublicKey: Uint8Array): KemEncapsulation {
  if (remotePublicKey.length !== KEM_PUBLIC_KEY_BYTES) {
    throw new Error('KEM_BAD_PUBLIC_KEY');
  }
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(remotePublicKey);
  return { ciphertext: cipherText, sharedSecret };
}

export function kemDecapsulate(secretKey: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  if (ciphertext.length !== KEM_CIPHERTEXT_BYTES) {
    throw new Error('KEM_BAD_CIPHERTEXT');
  }
  return ml_kem768.decapsulate(ciphertext, secretKey);
}

// Combine the classical and post-quantum secrets into the 32-byte session root.
// Both secrets are fed as HKDF input keying material (concatenated), so the
// extracted output depends on the full entropy of each independently: zeroing
// one contribution still yields a secure root from the other. The fixed label
// is HKDF `info` for domain separation, never a source of entropy.
export function combineHybridSecret(classicalSecret: Uint8Array, pqSecret: Uint8Array): Uint8Array {
  const ikm = concatBytes(classicalSecret, pqSecret);
  return new HKDF(SHA256, ikm, undefined, HYBRID_INFO).expand(HASHLEN);
}
