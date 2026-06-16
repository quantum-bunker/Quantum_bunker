import { describe, it, expect } from 'vitest';
import { RelayPolicy } from '../../src/backend/core/policies/relay.policy';
import { RELAY_LIMITS } from '../../src/backend/core/constants';
import { EnvelopeType, RelayEnvelope } from '../../src/shared/contracts/v1/envelope';

function envelope(over: Partial<RelayEnvelope> = {}): RelayEnvelope {
  return {
    sessionId: 'sess-1',
    from: 'peer-a',
    type: EnvelopeType.NOISE_MESSAGE,
    timestamp: Date.now(),
    nonce: 'nonce-1',
    payload: 'opaque-ciphertext',
    ...over,
  };
}

describe('RelayPolicy.validate', () => {
  it('accepts a well-formed encrypted envelope', () => {
    expect(RelayPolicy.validate(envelope())).toEqual({ valid: true });
  });

  it('accepts the timestamp at the exact drift boundary', () => {
    const at = envelope({ timestamp: Date.now() - RELAY_LIMITS.TIMESTAMP_TOLERANCE_MS });
    expect(RelayPolicy.validate(at).valid).toBe(true);
  });

  it('rejects a timestamp drifted into the past beyond tolerance', () => {
    const stale = envelope({ timestamp: Date.now() - RELAY_LIMITS.TIMESTAMP_TOLERANCE_MS - 1 });
    const result = RelayPolicy.validate(stale);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Timestamp drift too large');
  });

  it('rejects a timestamp drifted into the future beyond tolerance', () => {
    const future = envelope({ timestamp: Date.now() + RELAY_LIMITS.TIMESTAMP_TOLERANCE_MS + 5_000 });
    const result = RelayPolicy.validate(future);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Timestamp drift too large');
  });

  it('rejects an empty payload', () => {
    const result = RelayPolicy.validate(envelope({ payload: '' }));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Payload empty');
  });

  it('rejects a PLAINTEXT envelope to preserve the zero-knowledge invariant', () => {
    const result = RelayPolicy.validate(envelope({ type: EnvelopeType.PLAINTEXT }));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Plaintext relay disabled');
  });

  it('accepts non-message control types that still carry an opaque payload', () => {
    for (const type of [EnvelopeType.SIGNALING, EnvelopeType.ACK, EnvelopeType.READ, EnvelopeType.FILE]) {
      expect(RelayPolicy.validate(envelope({ type })).valid).toBe(true);
    }
  });

  it('checks drift before payload — a stale empty envelope reports drift first', () => {
    const both = envelope({
      payload: '',
      timestamp: Date.now() - RELAY_LIMITS.TIMESTAMP_TOLERANCE_MS - 1,
    });
    expect(RelayPolicy.validate(both).reason).toBe('Timestamp drift too large');
  });
});
