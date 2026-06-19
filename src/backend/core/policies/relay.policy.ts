import { RelayEnvelope, EnvelopeType } from '../../../shared/contracts/v1/envelope';
import { RELAY_LIMITS } from '../constants';

export class RelayPolicy {
  static validate(envelope: RelayEnvelope): { valid: boolean; reason?: string } {
    const now = Date.now();
    const drift = Math.abs(now - envelope.timestamp);

    if (drift > RELAY_LIMITS.TIMESTAMP_TOLERANCE_MS) {
      return { valid: false, reason: 'Timestamp drift too large' };
    }

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
