import { z } from 'zod';
import { EnvelopeType } from './envelope';

export const RelayEnvelopeSchema = z.object({
  sessionId: z.string().uuid(),
  from: z.string().min(1).max(64),
  type: z.nativeEnum(EnvelopeType),
  timestamp: z.number().int().positive(),
  nonce: z.string().min(1).max(128),
  payload: z.string().max(16 * 1024 * 1024), // mirrors RELAY_LIMITS.MAX_PAYLOAD_BYTES
});

export const CreateSessionRequestSchema = z.object({
  name: z.string().max(64).optional(),
  expiresInSeconds: z.number().int().min(60).max(3600 * 24).optional(),
  hostPublicKey: z.string().min(1).max(128).optional(),
});

// Peer ids become object keys and Map keys on the relay, so they carry the same
// bounds as an envelope's `from` and may never name a prototype slot — an
// unbounded or `__proto__` id would otherwise escape the peer-count checks.
export const PeerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine((id) => !['__proto__', 'constructor', 'prototype'].includes(id), 'Reserved peer id');

export const JoinFrameSchema = z.object({
  type: z.literal('join'),
  sessionId: z.string().uuid(),
  peerId: PeerIdSchema,
  message: z.string().max(256).optional(),
  hostRecoveryToken: z.string().max(128).optional(),
  peerToken: z.string().max(128).optional(),
  membershipToken: z.string().max(8192).optional(),
  joinProof: z.unknown().optional(),
});

export const PeerTargetFrameSchema = z.object({
  type: z.enum(['accept_join', 'reject_join', 'kick_peer']),
  peerId: PeerIdSchema,
});
