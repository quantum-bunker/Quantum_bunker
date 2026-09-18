import { ISessionStore } from '../../application/ports/session-store.port';
import { Session } from '../../../shared/contracts/v1/session';
import { SESSION_LIMITS } from '../../core/constants';

export class InMemorySessionStore implements ISessionStore {
  private sessions = new Map<string, Session>();
  private tombstones = new Map<string, number>();

  async save(session: Session): Promise<void> {
    // A join that was mid-flight when the session was destroyed or reaped must
    // not resurrect it: the transport has already torn down its sockets, so the
    // revived copy would be unreachable yet still count against
    // MAX_ACTIVE_SESSIONS, and its own activity would keep it from expiring.
    if (this.tombstones.has(session.id)) return;
    this.sessions.set(session.id, session);
  }

  async get(id: string): Promise<Session | null> {
    return this.sessions.get(id) || null;
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
    this.tombstones.set(id, Date.now());
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

    for (const [id, at] of this.tombstones) {
      if (now - at > SESSION_LIMITS.TOMBSTONE_TTL_MS) this.tombstones.delete(id);
    }

    for (const [id, sess] of this.sessions.entries()) {
      const isExpired = sess.expiresAt < now;
      const isInactive = (now - sess.lastActivityAt) > SESSION_LIMITS.INACTIVITY_TTL_MS;
      const isEmptyTooLong = sess.participantCount === 0 && sess.emptySince !== null && (now - sess.emptySince) > SESSION_LIMITS.EMPTY_SESSION_TTL_MS;

      if (isExpired || isInactive || isEmptyTooLong) {
        this.sessions.delete(id);
        this.tombstones.set(id, now);
        deleted.push(sess);
      }
    }
    return deleted;
  }
}
