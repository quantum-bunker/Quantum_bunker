import { RelayEnvelope, EnvelopeType } from '../../../shared/contracts/v1/envelope';

export class RelayPolicy {
  static validate(envelope: RelayEnvelope): { valid: boolean; reason?: string } {
    // We deliberately do NOT reject on the difference between the client's
    // timestamp and the server's clock. Clients are not time-synchronized — a
    // device whose wall clock is even a minute off would otherwise have every
    // envelope (including the Noise handshake signaling) silently rejected,
    // while plaintext control frames like `join` still pass, making the vault
    // appear to work for admission but never deliver a message. Replay is
    // protected independently and server-relatively by nonce deduplication in
    // RelayMessage.isReplay(), which does not depend on the client clock.
    if (!envelope.payload || envelope.payload.length === 0) {
      return { valid: false, reason: 'Payload empty' };
    }

    // Zero-knowledge invariant: the relay only carries opaque encrypted blobs.
    if (envelope.type === EnvelopeType.PLAINTEXT) {
      return { valid: false, reason: 'Plaintext relay disabled' };
    }

    return { valid: true };
  }
}
