import { ISessionStore } from '../../application/ports/session-store.port';
import { Session } from '../../../shared/contracts/v1/session';
import { SESSION_LIMITS } from '../../core/constants';

export class InMemorySessionStore implements ISessionStore {
  private sessions = new Map<string, Session>();

  async save(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async get(id: string): Promise<Session | null> {
    return this.sessions.get(id) || null;
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async count(): Promise<number> {
    return this.sessions.size;
  }

  async touch(id: string): Promise<void> {
    const sess = this.sessions.get(id);
    if (sess) {
      sess.lastActivityAt = Date.now();
    }
  }

  async cleanup(): Promise<Session[]> {
    const now = Date.now();
    const deleted: Session[] = [];

    for (const [id, sess] of this.sessions.entries()) {
      const isExpired = sess.expiresAt < now;
      const isInactive = (now - sess.lastActivityAt) > SESSION_LIMITS.INACTIVITY_TTL_MS;
      const isEmptyTooLong = sess.participantCount === 0 && sess.emptySince !== null && (now - sess.emptySince) > SESSION_LIMITS.EMPTY_SESSION_TTL_MS;

      if (isExpired || isInactive || isEmptyTooLong) {
        this.sessions.delete(id);
        deleted.push(sess);
      }
    }
    return deleted;
  }
}
