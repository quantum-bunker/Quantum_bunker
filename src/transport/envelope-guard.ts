import { RelayEnvelope } from '../shared/contracts/v1/envelope';

// A data channel attests which peer sent a frame. The relay enforces the same
// binding server-side (SENDER_MISMATCH in ws.transport.ts); the direct path must
// not be weaker, or any mesh peer could forge `from` to delete another peer's
// messages, pin a contact key under a spoofed identity, or reset a third
// party's Noise channel.
export function parseAttributedEnvelope(attestedFrom: string, data: string): RelayEnvelope | null {
  let env: unknown;
  try {
    env = JSON.parse(data);
  } catch {
    return null;
  }
  if (!env || typeof env !== 'object') return null;
  const candidate = env as RelayEnvelope;
  if (typeof candidate.from !== 'string' || candidate.from !== attestedFrom) return null;
  return candidate;
}
