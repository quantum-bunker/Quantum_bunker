import { v4 as uuidv4 } from 'uuid';
import { Session, SessionStatus } from '../../../shared/contracts/v1/session';
import { SESSION_LIMITS } from '../../core/constants';
import { DomainError } from '../../core/errors';
import { newToken } from '../../core/security';
import { ISessionStore } from '../ports/session-store.port';
import { IEventBus } from '../ports/event-bus.port';

export interface CreateSessionOptions {
  expiresInSeconds?: number;
  name?: string;
  hostPublicKey?: string;
  // Direct mode supplies a vault id both peers derived from a shared secret.
  // Whichever side arrives first creates it; the other gets `existing: true`.
  id?: string;
  maxPeers?: number;
}

export interface CreateSessionResult {
  session: Session;
  // True when `id` named a session that was already open. The caller must not
  // hand the requester host credentials in that case — see ADR-007.
  existing: boolean;
}

export class CreateSession {
  constructor(
    private readonly store: ISessionStore,
    private readonly eventBus: IEventBus
  ) {}

  async execute(options: CreateSessionOptions = {}): Promise<CreateSessionResult> {
    const { expiresInSeconds, name, hostPublicKey, id, maxPeers } = options;

    if (id) {
      const existing = await this.store.get(id);
      if (existing) return { session: existing, existing: true };
    }

    if (await this.store.count() >= SESSION_LIMITS.MAX_ACTIVE_SESSIONS) {
      throw new DomainError('SESSION_CAPACITY_REACHED', 'Relay is at session capacity');
    }

    const ttl = expiresInSeconds
      ? expiresInSeconds * 1000
      : SESSION_LIMITS.DEFAULT_TTL_MS;

    const actualTtl = Math.min(ttl, SESSION_LIMITS.MAX_TTL_MS);

    const now = Date.now();
    const hostId = `host-${uuidv4().slice(0, 8)}`;
    const hostRecoveryToken = uuidv4();
    const sess: Session = {
      id: id || uuidv4(),
      name,
      createdAt: now,
      expiresAt: now + actualTtl,
      lastActivityAt: now,
      hostId,
      hostRecoveryToken,
      hostPublicKey,
      peers: {
        // The host holds a peer token like everyone else so no credential check
        // can ever compare against undefined and fall through.
        [hostId]: { id: hostId, joinedAt: now, lastSeenAt: now, token: newToken() }
      },
      pendingPeers: {},
      status: SessionStatus.PENDING,
      maxPeers: clampPeers(maxPeers),
      participantCount: 1, // host is in peers from the start
      emptySince: null,
    };

    await this.store.save(sess);

    this.eventBus.emit({
      type: 'SessionCreated',
      sessionId: sess.id,
      occurredAt: sess.createdAt,
      payload: { expiresAt: sess.expiresAt },
    });

    return { session: sess, existing: false };
  }
}

function clampPeers(requested?: number): number {
  if (!requested) return SESSION_LIMITS.MAX_PEERS;
  return Math.min(Math.max(2, requested), SESSION_LIMITS.MAX_PEERS);
}
