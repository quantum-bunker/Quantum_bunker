import { generateKeyPair } from '@stablelib/x25519';
import { HandshakeState, KeyPair } from './noise-xx';
import { DoubleRatchet, DRKeyPair, RatchetSlot } from './double-ratchet';
import {
  generateKemKeyPair,
  kemEncapsulate,
  kemDecapsulate,
  combineHybridSecret,
  KemKeyPair,
} from './hybrid-kem';
import {
  utf8,
  fromUtf8,
  toBase64,
  fromBase64,
  sha256,
  concatBytes,
} from './noise-primitives';

const DR_KEY_BYTES = 32;

export interface NoiseFrame {
  kind: 'noise';
  to: string;
  step: 1 | 2 | 3;
  data: string;
}

export interface EncryptedPayload {
  c: Record<string, RatchetSlot>;
}

type Phase = 'handshaking' | 'ready' | 'failed';

interface Channel {
  initiator: boolean;
  phase: Phase;
  hs: HandshakeState;
  ratchet: DoubleRatchet | null;
  safetyNumber: string | null;
  remoteStaticKey: Uint8Array | null;
  drKeyPair: DRKeyPair;
  remoteDRKey: Uint8Array | null;
  // Post-quantum KEM state. The responder holds a decapsulation keypair until
  // the initiator's message 3 ciphertext arrives; both sides end up with the
  // same pqSecret, which is mixed into the session root in finalize().
  kemKeyPair: KemKeyPair | null;
  pqSecret: Uint8Array | null;
}

interface PeerChannelsOptions {
  sessionId: string;
  selfId: string;
  sendNoise: (toPeerId: string, frame: NoiseFrame) => void;
}

export class PeerChannels {
  private readonly selfId: string;
  private readonly sendNoise: PeerChannelsOptions['sendNoise'];
  private readonly staticKey: KeyPair;
  private readonly channels = new Map<string, Channel>();

  constructor(opts: PeerChannelsOptions) {
    this.selfId = opts.selfId;
    this.sendNoise = opts.sendNoise;
    this.staticKey = loadOrCreateIdentity(opts.sessionId);
  }

  private isInitiator(peerId: string): boolean {
    return this.selfId < peerId;
  }

  private newChannel(peerId: string): Channel {
    const initiator = this.isInitiator(peerId);
    return {
      initiator,
      phase: 'handshaking',
      hs: new HandshakeState(initiator, this.staticKey),
      ratchet: null,
      safetyNumber: null,
      remoteStaticKey: null,
      drKeyPair: generateKeyPair(),
      remoteDRKey: null,
      kemKeyPair: null,
      pqSecret: null,
    };
  }

  ensureChannel(peerId: string): void {
    if (peerId === this.selfId || this.channels.has(peerId)) return;
    const channel = this.newChannel(peerId);
    this.channels.set(peerId, channel);
    if (channel.initiator) {
      this.sendNoise(peerId, { kind: 'noise', to: peerId, step: 1, data: toBase64(channel.hs.writeMessage()) });
    }
  }

  onSignal(fromPeerId: string, frame: NoiseFrame): void {
    if (frame.to !== this.selfId) return;

    let channel = this.channels.get(fromPeerId);
    if (!channel || (frame.step === 1 && channel.phase !== 'handshaking')) {
      channel = this.newChannel(fromPeerId);
      this.channels.set(fromPeerId, channel);
    }

    try {
      const data = fromBase64(frame.data);

      if (channel.initiator && frame.step === 2) {
        // Responder's message 2 payload carries their DR public key plus the
        // ML-KEM encapsulation key. We encapsulate against it and ship the
        // resulting ciphertext back inside message 3.
        const { drKey, kemBlob } = splitHandshakePayload(channel.hs.readMessage(data));
        channel.remoteDRKey = drKey;
        const { ciphertext, sharedSecret } = kemEncapsulate(kemBlob);
        channel.pqSecret = sharedSecret;
        this.sendNoise(fromPeerId, {
          kind: 'noise', to: fromPeerId, step: 3,
          data: toBase64(channel.hs.writeMessage(joinHandshakePayload(channel.drKeyPair.publicKey, ciphertext))),
        });
        this.finalize(channel);

      } else if (!channel.initiator && frame.step === 1) {
        channel.hs.readMessage(data);
        // Responder advertises its DR public key plus a fresh ML-KEM public key
        // for the initiator to encapsulate against.
        channel.kemKeyPair = generateKemKeyPair();
        this.sendNoise(fromPeerId, {
          kind: 'noise', to: fromPeerId, step: 2,
          data: toBase64(channel.hs.writeMessage(joinHandshakePayload(channel.drKeyPair.publicKey, channel.kemKeyPair.publicKey))),
        });

      } else if (!channel.initiator && frame.step === 3) {
        // Initiator's message 3 payload carries their DR public key plus the
        // ML-KEM ciphertext we decapsulate to recover the shared PQ secret.
        const { drKey, kemBlob } = splitHandshakePayload(channel.hs.readMessage(data));
        channel.remoteDRKey = drKey;
        if (channel.kemKeyPair) {
          channel.pqSecret = kemDecapsulate(channel.kemKeyPair.secretKey, kemBlob);
        }
        this.finalize(channel);
      }
    } catch {
      channel.phase = 'failed';
    }
  }

  private finalize(channel: Channel): void {
    if (!channel.hs.complete) return;
    channel.safetyNumber = safetyNumber(channel.hs.handshakeHash);
    channel.remoteStaticKey = channel.hs.remoteStaticKey;

    if (channel.remoteDRKey && channel.pqSecret) {
      // Hybrid root: the classical Noise chaining key combined with the ML-KEM
      // shared secret. Both must be present — we never fall back to a PQ-only
      // or classical-only root.
      const root = combineHybridSecret(channel.hs.chainKey, channel.pqSecret);
      channel.ratchet = channel.initiator
        ? DoubleRatchet.initAlice(root, channel.drKeyPair, channel.remoteDRKey)
        : DoubleRatchet.initBob(root, channel.drKeyPair, channel.remoteDRKey);
    }

    channel.phase = 'ready';
  }

  encryptForAll(plaintext: string): EncryptedPayload {
    const c: Record<string, RatchetSlot> = {};
    const bytes = utf8(plaintext);
    for (const [peerId, channel] of this.channels) {
      if (channel.phase === 'ready' && channel.ratchet) {
        c[peerId] = channel.ratchet.encrypt(bytes);
      }
    }
    return { c };
  }

  decryptFrom(fromPeerId: string, payload: EncryptedPayload): string | null {
    const channel = this.channels.get(fromPeerId);
    if (!channel || channel.phase !== 'ready' || !channel.ratchet) return null;
    const slot = payload?.c?.[this.selfId];
    if (!slot || typeof slot !== 'object' || !slot.ct || !slot.h) return null;
    try {
      return fromUtf8(channel.ratchet.decrypt(slot));
    } catch {
      return null;
    }
  }

  removePeer(peerId: string): void {
    this.channels.delete(peerId);
  }

  isReady(peerId: string): boolean {
    return this.channels.get(peerId)?.phase === 'ready';
  }

  allReady(peerIds: string[]): boolean {
    const others = peerIds.filter(id => id !== this.selfId);
    return others.length > 0 && others.every(id => this.isReady(id));
  }

  safetyNumbers(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [peerId, channel] of this.channels) {
      if (channel.safetyNumber) out[peerId] = channel.safetyNumber;
    }
    return out;
  }

  // SHA-256 of each peer's authenticated static public key, hex-encoded.
  // Both peers independently compute the same fingerprint for a given key;
  // comparing out-of-band detects a relay-mounted MITM even if safety numbers
  // are not checked.
  fingerprints(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [peerId, channel] of this.channels) {
      if (channel.remoteStaticKey) {
        out[peerId] = toHex(sha256(channel.remoteStaticKey));
      }
    }
    return out;
  }

  ownFingerprint(): string {
    return toHex(sha256(this.staticKey.publicKey));
  }
}

// Six groups of five digits derived from the handshake hash. Both peers share
// the same handshake hash, so they independently compute the same number and
// can compare it out of band to detect a relay-mounted MITM.
function safetyNumber(handshakeHash: Uint8Array): string {
  const digest = sha256(handshakeHash);
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) {
    const view = new DataView(digest.buffer, digest.byteOffset + i * 4, 4);
    groups.push((view.getUint32(0) % 100000).toString().padStart(5, '0'));
  }
  return groups.join(' ');
}

// Handshake payloads carry the 32-byte DR public key followed by a variable
// PQ blob (ML-KEM public key in message 2, ciphertext in message 3). The DR key
// is fixed-width so the split is unambiguous.
function joinHandshakePayload(drKey: Uint8Array, kemBlob: Uint8Array): Uint8Array {
  return concatBytes(drKey, kemBlob);
}

function splitHandshakePayload(payload: Uint8Array): { drKey: Uint8Array; kemBlob: Uint8Array } {
  if (payload.length <= DR_KEY_BYTES) throw new Error('NOISE_PAYLOAD_TOO_SHORT');
  return { drKey: payload.slice(0, DR_KEY_BYTES), kemBlob: payload.slice(DR_KEY_BYTES) };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function loadOrCreateIdentity(sessionId: string): KeyPair {
  const key = `qb-noise-id-${sessionId}`;
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      const { pub, sec } = JSON.parse(stored);
      return { publicKey: fromBase64(pub), secretKey: fromBase64(sec) };
    }
  } catch {
    // Fall through to generating a fresh identity.
  }
  const pair = generateKeyPair();
  try {
    sessionStorage.setItem(key, JSON.stringify({ pub: toBase64(pair.publicKey), sec: toBase64(pair.secretKey) }));
  } catch {
    // sessionStorage unavailable (e.g. SSR/tests) — identity stays in memory.
  }
  return pair;
}

