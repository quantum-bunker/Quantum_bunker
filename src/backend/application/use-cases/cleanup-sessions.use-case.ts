import { ISessionStore } from '../ports/session-store.port';
import { IEventBus } from '../ports/event-bus.port';

export class CleanupSessions {
  constructor(
    private readonly store: ISessionStore,
    private readonly eventBus: IEventBus
  ) {}

  async execute(): Promise<string[]> {
    const now = Date.now();
    const deletedSessions = await this.store.cleanup();

    for (const sess of deletedSessions) {
      const reason = sess.expiresAt < now ? 'TTL_EXPIRED' : 'INACTIVITY_TIMEOUT';

      this.eventBus.emit({
        type: 'SessionExpired',
        sessionId: sess.id,
        occurredAt: now,
        payload: { reason, lastActivityAt: sess.lastActivityAt },
      });
    }

    return deletedSessions.map(sess => sess.id);
  }
}
