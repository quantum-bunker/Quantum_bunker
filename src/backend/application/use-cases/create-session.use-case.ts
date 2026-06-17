import { v4 as uuidv4 } from 'uuid';
import { Session, SessionStatus } from '../../../shared/contracts/v1/session';
import { SESSION_LIMITS } from '../../core/constants';
import { DomainError } from '../../core/errors';
import { ISessionStore } from '../ports/session-store.port';
import { IEventBus } from '../ports/event-bus.port';

export class CreateSession {
  constructor(
    private readonly store: ISessionStore,
    private readonly eventBus: IEventBus
  ) {}

  async execute(expiresInSeconds?: number, name?: string, hostPublicKey?: string): Promise<Session> {
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
      id: uuidv4(),
      name,
      createdAt: now,
      expiresAt: now + actualTtl,
      lastActivityAt: now,
      hostId,
      hostRecoveryToken,
      hostPublicKey,
      peers: {
        [hostId]: { id: hostId, joinedAt: now, lastSeenAt: now }
      },
      pendingPeers: {},
      status: SessionStatus.PENDING,
      maxPeers: SESSION_LIMITS.MAX_PEERS,
      participantCount: 0,
      emptySince: now,
    };

    await this.store.save(sess);

    this.eventBus.emit({
      type: 'SessionCreated',
      sessionId: sess.id,
      occurredAt: sess.createdAt,
      payload: { expiresAt: sess.expiresAt },
    });

    return sess;
  }
}
