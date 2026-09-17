export enum SessionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CLOSED = 'closed',
}

export interface SessionPeer {
  id: string;
  joinedAt: number;
  lastSeenAt: number;
  token?: string;
}

export interface PublicSessionInfo {
  id: string;
  name?: string;
  createdAt: number;
  expiresAt: number;
  status: SessionStatus;
  participantCount: number;
  maxPeers: number;
}

export interface Session {
  id: string;
  name?: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  hostId: string;
  hostRecoveryToken: string;
  hostPublicKey?: string; // Ed25519 trust anchor for the membership whitelist
  peers: Record<string, SessionPeer>;
  pendingPeers: Record<string, { id: string; message: string; requestedAt: number }>;
  status: SessionStatus;
  maxPeers: number;
  participantCount: number;
  emptySince: number | null;
  isGroup?: boolean;
}

export interface CreateSessionRequest {
  name?: string;
  expiresInSeconds?: number;
  hostPublicKey?: string;
  // Direct mode: both sides of a pair derive the same vault id from a shared
  // secret, so whichever arrives first creates it and the other joins the same
  // one. Supplying an id that already exists is a join, not a create — the
  // response withholds host credentials in that case.
  id?: string;
  maxPeers?: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  name?: string;
  expiresAt: number;
  publicKey: string; // Placeholder for Phase 2
  // Absent when `existing` is true: a caller who merely guessed a vault id must
  // never be handed authority over it.
  hostId?: string;
  hostRecoveryToken?: string;
  existing?: boolean;
}

export interface JoinSessionResponse {
  sessionId: string;
  peerId: string;
  status: SessionStatus;
}
