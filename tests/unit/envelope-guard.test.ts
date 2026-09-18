import { describe, it, expect } from 'vitest';
import { parseAttributedEnvelope } from '../../src/transport/envelope-guard';
import { EnvelopeType } from '../../src/shared/contracts/v1/envelope';

const frame = (from: string) => JSON.stringify({
  sessionId: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
  from,
  type: EnvelopeType.NOISE_MESSAGE,
  timestamp: Date.now(),
  nonce: 'n1',
  payload: 'x',
});

describe('parseAttributedEnvelope', () => {
  it('accepts an envelope whose from matches the attested channel owner', () => {
    const env = parseAttributedEnvelope('peer-a', frame('peer-a'));
    expect(env?.from).toBe('peer-a');
  });

  it('rejects an envelope that speaks for another peer', () => {
    expect(parseAttributedEnvelope('peer-a', frame('peer-b'))).toBeNull();
  });

  it('rejects a missing or non-string from', () => {
    expect(parseAttributedEnvelope('peer-a', JSON.stringify({ payload: 'x' }))).toBeNull();
    expect(parseAttributedEnvelope('peer-a', JSON.stringify({ from: 42 }))).toBeNull();
  });

  it('rejects malformed json and non-object frames', () => {
    expect(parseAttributedEnvelope('peer-a', '{not json')).toBeNull();
    expect(parseAttributedEnvelope('peer-a', '"just a string"')).toBeNull();
    expect(parseAttributedEnvelope('peer-a', 'null')).toBeNull();
  });
});
