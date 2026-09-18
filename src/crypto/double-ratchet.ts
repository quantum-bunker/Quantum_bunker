import { generateKeyPair, sharedKey } from '@stablelib/x25519';
import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305';
import { bytesEqual, hkdf, toBase64, fromBase64 } from './noise-primitives';

export type DRKeyPair = { publicKey: Uint8Array; secretKey: Uint8Array };

export type RatchetHeader = { dh: string; n: number; pn: number };

export type RatchetSlot = { h: RatchetHeader; ct: string };

const MAX_SKIP = 100;

// Ceiling on skipped keys retained across all receive chains. MAX_SKIP alone
// bounds a single gap; without a global cap a peer that repeatedly ratchets
// while skipping messages grows MKSKIPPED without limit.
export const MAX_SKIPPED_KEYS = 1000;

// KDF_RK: HKDF with root key as salt, DH output as IKM → [newRK, chainKey]
function kdfRK(rk: Uint8Array, dhOut: Uint8Array): [Uint8Array, Uint8Array] {
  const [newRK, ck] = hkdf(rk, dhOut, 2);
  return [newRK, ck];
}

// KDF_CK: HKDF with chain key as salt → [messageKey, nextChainKey]
function kdfCK(ck: Uint8Array): [Uint8Array, Uint8Array] {
  const [mk, newCK] = hkdf(ck, new Uint8Array([1]), 2);
  return [mk, newCK];
}

function encryptMsg(mk: Uint8Array, plaintext: Uint8Array, ad: Uint8Array): Uint8Array {
  return new ChaCha20Poly1305(mk).seal(new Uint8Array(12), plaintext, ad);
}

function decryptMsg(mk: Uint8Array, ciphertext: Uint8Array, ad: Uint8Array): Uint8Array {
  const result = new ChaCha20Poly1305(mk).open(new Uint8Array(12), ciphertext, ad);
  if (result === null) throw new Error('DR_DECRYPT_FAILED');
  return result;
}

interface DRState {
  RK: Uint8Array;
  CKs: Uint8Array | null;
  CKr: Uint8Array | null;
  DHs: DRKeyPair;
  DHr: Uint8Array | null;
  Ns: number;
  Nr: number;
  PN: number;
  MKSKIPPED: Map<string, Uint8Array>;
}

function cloneState(s: DRState): DRState {
  return {
    RK: new Uint8Array(s.RK),
    CKs: s.CKs ? new Uint8Array(s.CKs) : null,
    CKr: s.CKr ? new Uint8Array(s.CKr) : null,
    DHs: { publicKey: new Uint8Array(s.DHs.publicKey), secretKey: new Uint8Array(s.DHs.secretKey) },
    DHr: s.DHr ? new Uint8Array(s.DHr) : null,
    Ns: s.Ns,
    Nr: s.Nr,
    PN: s.PN,
    MKSKIPPED: new Map(s.MKSKIPPED),
  };
}

function dhRatchet(s: DRState, newDHr: Uint8Array): void {
  s.PN = s.Ns;
  s.Ns = 0;
  s.Nr = 0;
  s.DHr = newDHr;
  // Step 1: receive chain from old DHs + new DHr
  const [RK1, CKr] = kdfRK(s.RK, sharedKey(s.DHs.secretKey, newDHr));
  // Step 2: fresh DHs for new send chain, using the updated root key
  const newDHs = generateKeyPair();
  const [RK2, CKs] = kdfRK(RK1, sharedKey(newDHs.secretKey, newDHr));
  s.RK = RK2;
  s.CKr = CKr;
  s.CKs = CKs;
  s.DHs = newDHs;
}

function skipMessageKeys(s: DRState, until: number, dhPub: string): void {
  if (!s.CKr || s.Nr >= until) return;
  if (until - s.Nr > MAX_SKIP) throw new Error('DR_SKIP_LIMIT_EXCEEDED');
  let ck = s.CKr;
  while (s.Nr < until) {
    const [mk, newCK] = kdfCK(ck);
    s.MKSKIPPED.set(`${dhPub}:${s.Nr}`, mk);
    // Insertion order means the oldest stranded key is evicted first.
    while (s.MKSKIPPED.size > MAX_SKIPPED_KEYS) {
      const oldest = s.MKSKIPPED.keys().next().value;
      if (oldest === undefined) break;
      s.MKSKIPPED.delete(oldest);
    }
    ck = newCK;
    s.Nr += 1;
  }
  s.CKr = ck;
}

export class DoubleRatchet {
  private s: DRState;

  // Initiator (Alice): computes sending chain immediately from the shared DH.
  // Both sides perform the same DH(DHs_A, DHs_B); Alice treats the result as
  // CKs, Bob as CKr — this asymmetry is what gives each side its own chain.
  static initAlice(chainKey: Uint8Array, ownKP: DRKeyPair, remotePub: Uint8Array): DoubleRatchet {
    const [RK, CKs] = kdfRK(chainKey, sharedKey(ownKP.secretKey, remotePub));
    return new DoubleRatchet({ RK, CKs, CKr: null, DHs: ownKP, DHr: remotePub, Ns: 0, Nr: 0, PN: 0, MKSKIPPED: new Map() });
  }

  // Responder (Bob): pre-computes receiving chain from the same DH.
  // Bob's sending chain (CKs) is null until he either receives from Alice
  // (triggering a DH ratchet step) or proactively ratchets to send first.
  static initBob(chainKey: Uint8Array, ownKP: DRKeyPair, remotePub: Uint8Array): DoubleRatchet {
    const [RK, CKr] = kdfRK(chainKey, sharedKey(ownKP.secretKey, remotePub));
    return new DoubleRatchet({ RK, CKs: null, CKr, DHs: ownKP, DHr: remotePub, Ns: 0, Nr: 0, PN: 0, MKSKIPPED: new Map() });
  }

  private constructor(s: DRState) {
    this.s = s;
  }

  skippedKeyCount(): number {
    return this.s.MKSKIPPED.size;
  }

  encrypt(plaintext: Uint8Array): RatchetSlot {
    if (this.s.CKs === null) {
      // Proactive DH ratchet: Bob wants to send before receiving Alice's first message.
      // Uses Alice's known initial key (already in DHr) to bootstrap the send chain.
      const newDHs = generateKeyPair();
      const [newRK, newCKs] = kdfRK(this.s.RK, sharedKey(newDHs.secretKey, this.s.DHr!));
      this.s.PN = this.s.Ns;
      this.s.Ns = 0;
      this.s.DHs = newDHs;
      this.s.RK = newRK;
      this.s.CKs = newCKs;
    }

    const [mk, newCKs] = kdfCK(this.s.CKs);
    this.s.CKs = newCKs;
    const h: RatchetHeader = { dh: toBase64(this.s.DHs.publicKey), n: this.s.Ns, pn: this.s.PN };
    this.s.Ns += 1;
    const ad = new TextEncoder().encode(JSON.stringify(h));
    return { h, ct: toBase64(encryptMsg(mk, plaintext, ad)) };
  }

  // The ratchet is advanced on a copy and committed only once the frame
  // authenticates. `h` is unauthenticated wire data: applied eagerly, a forged
  // header would rewrite RK/CKr/CKs — or consume a stored skipped key — and
  // permanently break the channel for the genuine peer.
  decrypt(slot: RatchetSlot): Uint8Array {
    const { h, ct } = slot;
    const ciphertext = fromBase64(ct);
    const ad = new TextEncoder().encode(JSON.stringify(h));
    const next = cloneState(this.s);

    const skippedKey = `${h.dh}:${h.n}`;
    const skippedMK = next.MKSKIPPED.get(skippedKey);
    if (skippedMK) {
      const plaintext = decryptMsg(skippedMK, ciphertext, ad);
      next.MKSKIPPED.delete(skippedKey);
      this.s = next;
      return plaintext;
    }

    const dhBytes = fromBase64(h.dh);
    if (!next.DHr || !bytesEqual(dhBytes, next.DHr)) {
      skipMessageKeys(next, h.pn, next.DHr ? toBase64(next.DHr) : '');
      dhRatchet(next, dhBytes);
    }

    skipMessageKeys(next, h.n, h.dh);
    if (!next.CKr) throw new Error('DR_NO_RECV_CHAIN');
    const [mk, newCKr] = kdfCK(next.CKr);
    next.CKr = newCKr;
    next.Nr += 1;
    const plaintext = decryptMsg(mk, ciphertext, ad);
    this.s = next;
    return plaintext;
  }
}
