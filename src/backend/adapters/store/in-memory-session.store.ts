import { ISessionStore } from '../../application/ports/session-store.port';
import { Session } from '../../../shared/contracts/v1/session';
import { SESSION_LIMITS } from '../../core/constants';

export class InMemorySessionStore implements ISessionStore {
  private sessions = new Map<string, Session>();
  // Tracks the deleted session *objects*, not their ids. get() hands out the
  // stored reference, so a join that was mid-flight when the session was
  // destroyed or reaped still holds that exact object; re-saving it would revive
  // a copy the transport has already torn down — unreachable, yet counting
  // against MAX_ACTIVE_SESSIONS and kept alive by its own activity. Blocking by
  // id instead would also refuse a deliberate new session under the same id,
  // which direct mode does: both peers re-derive the vault id from their shared
  // secret, so re-opening right after a destroy must work.
  private deleted = new WeakSet<Session>();

  async save(session: Session): Promise<void> {
    if (this.deleted.has(session)) return;
    this.sessions.set(session.id, session);
  }

  async get(id: string): Promise<Session | null> {
    return this.sessions.get(id) || null;
  }

  async delete(id: string): Promise<void> {
    const sess = this.sessions.get(id);
    if (sess) this.deleted.add(sess);
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
        this.deleted.add(sess);
        deleted.push(sess);
      }
    }
    return deleted;
  }
}
