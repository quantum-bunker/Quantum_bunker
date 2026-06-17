import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemorySessionStore } from '../../src/backend/adapters/store/in-memory-session.store';
import { Session, SessionStatus } from '../../src/shared/contracts/v1/session';
import { SESSION_LIMITS } from '../../src/backend/core/constants';

function makeSession(overrides: Partial<Session> = {}): Session {
  const now = Date.now();
  return {
    id: 'sess-1',
    createdAt: now - 60000,
    expiresAt: now + 15 * 60 * 1000,
    lastActivityAt: now,
    status: SessionStatus.ACTIVE,
    peers: {},
    pendingPeers: {},
    hostId: 'host-1',
    hostRecoveryToken: 'token',
    maxPeers: 10,
    participantCount: 0,
    emptySince: null,
    ...overrides,
  };
}

describe('InMemorySessionStore.cleanup', () => {
  let store: InMemorySessionStore;

  beforeEach(() => {
    store = new InMemorySessionStore();
  });

  // ── isExpired ──────────────────────────────────────────────────────────

  it('deletes a session whose expiresAt is in the past', async () => {
    const session = makeSession({ expiresAt: Date.now() - 1000 });
    await store.save(session);
    const deleted = await store.cleanup();
    expect(deleted).toHaveLength(1);
    expect(deleted[0].id).toBe(session.id);
    expect(await store.get(session.id)).toBeNull();
  });

  it('keeps a session whose expiresAt is in the future', async () => {
    const session = makeSession({ expiresAt: Date.now() + 60000 });
    await store.save(session);
    const deleted = await store.cleanup();
    expect(deleted).toHaveLength(0);
    expect(await store.get(session.id)).toBeDefined();
  });

  // ── isInactive ─────────────────────────────────────────────────────────

  it('deletes a session inactive longer than INACTIVITY_TTL_MS', async () => {
    const session = makeSession({
      lastActivityAt: Date.now() - SESSION_LIMITS.INACTIVITY_TTL_MS - 1000,
      expiresAt: Date.now() + 3600_000, // far future to isolate inactivity
    });
    await store.save(session);
    const deleted = await store.cleanup();
    expect(deleted).toHaveLength(1);
    expect(deleted[0].id).toBe(session.id);
    expect(await store.get(session.id)).toBeNull();
  });

  it('keeps a session inactive for just under INACTIVITY_TTL_MS', async () => {
    const session = makeSession({
      lastActivityAt: Date.now() - SESSION_LIMITS.INACTIVITY_TTL_MS + 5000,
      expiresAt: Date.now() + 3600_000,
    });
    await store.save(session);
    const deleted = await store.cleanup();
    expect(deleted).toHaveLength(0);
    expect(await store.get(session.id)).toBeDefined();
  });

  // ── isEmptyTooLong ─────────────────────────────────────────────────────

  it('deletes a session empty for longer than EMPTY_SESSION_TTL_MS', async () => {
    const session = makeSession({
      participantCount: 0,
      emptySince: Date.now() - SESSION_LIMITS.EMPTY_SESSION_TTL_MS - 1000,
      expiresAt: Date.now() + 3600_000,
      lastActivityAt: Date.now(), // active enough
    });
    await store.save(session);
    const deleted = await store.cleanup();
    expect(deleted).toHaveLength(1);
    expect(deleted[0].id).toBe(session.id);
    expect(await store.get(session.id)).toBeNull();
  });

  it('keeps a session empty for just under EMPTY_SESSION_TTL_MS', async () => {
    const session = makeSession({
      participantCount: 0,
      emptySince: Date.now() - SESSION_LIMITS.EMPTY_SESSION_TTL_MS + 5000,
      expiresAt: Date.now() + 3600_000,
      lastActivityAt: Date.now(),
    });
    await store.save(session);
    const deleted = await store.cleanup();
    expect(deleted).toHaveLength(0);
    expect(await store.get(session.id)).toBeDefined();
  });

  // ── emptySince === null guard ──────────────────────────────────────────

  it('does NOT delete when participantCount is 0 but emptySince is null', async () => {
    // Regression: if the `!== null` check on line 34 is broken, this deletes.
    const session = makeSession({
      participantCount: 0,
      emptySince: null,
      expiresAt: Date.now() + 3600_000,
      lastActivityAt: Date.now(),
    });
    await store.save(session);
    const deleted = await store.cleanup();
    expect(deleted).toHaveLength(0);
    expect(await store.get(session.id)).toBeDefined();
  });

  // ── touch() ────────────────────────────────────────────────────────────

  it('touch() updates lastActivityAt, preventing inactivity eviction', async () => {
    const oldTime = Date.now() - SESSION_LIMITS.INACTIVITY_TTL_MS - 5000;
    const session = makeSession({
      lastActivityAt: oldTime,
      expiresAt: Date.now() + 3600_000,
    });
    await store.save(session);

    await store.touch(session.id);
    const touched = await store.get(session.id);
    expect(touched!.lastActivityAt).toBeGreaterThanOrEqual(oldTime + 5000);

    const deleted = await store.cleanup();
    expect(deleted).toHaveLength(0);
  });

  // ── Multiple conditions / dedup ────────────────────────────────────────

  it('deletes a session once when multiple conditions are true', async () => {
    const session = makeSession({
      expiresAt: Date.now() - 1000,
      lastActivityAt: Date.now() - SESSION_LIMITS.INACTIVITY_TTL_MS - 1000,
      participantCount: 0,
      emptySince: Date.now() - SESSION_LIMITS.EMPTY_SESSION_TTL_MS - 1000,
    });
    await store.save(session);
    const deleted = await store.cleanup();
    expect(deleted).toHaveLength(1);
    expect(deleted[0].id).toBe(session.id);
  });

  it('cleanup returns all deleted sessions', async () => {
    const s1 = makeSession({ id: 'a', expiresAt: Date.now() - 1000 });
    const s2 = makeSession({ id: 'b', expiresAt: Date.now() - 2000 });
    const s3 = makeSession({ id: 'c', expiresAt: Date.now() + 3600_000 });
    await store.save(s1);
    await store.save(s2);
    await store.save(s3);
    const deleted = await store.cleanup();
    expect(deleted).toHaveLength(2);
    expect(deleted.map(s => s.id).sort()).toEqual(['a', 'b']);
    expect(await store.get('c')).toBeDefined();
  });

  it('cleanup returns empty array when nothing expires', async () => {
    const s1 = makeSession({ expiresAt: Date.now() + 3600_000 });
    await store.save(s1);
    const deleted = await store.cleanup();
    expect(deleted).toEqual([]);
  });
});

describe('InMemorySessionStore.count', () => {
  let store: InMemorySessionStore;

  beforeEach(() => {
    store = new InMemorySessionStore();
  });

  it('reports the number of held sessions', async () => {
    expect(await store.count()).toBe(0);
    await store.save(makeSession({ id: 'a' }));
    await store.save(makeSession({ id: 'b' }));
    expect(await store.count()).toBe(2);
  });

  it('decreases when a session is deleted', async () => {
    await store.save(makeSession({ id: 'a' }));
    await store.delete('a');
    expect(await store.count()).toBe(0);
  });
});