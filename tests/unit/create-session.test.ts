import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateSession } from '../../src/backend/application/use-cases/create-session.use-case';
import { InMemorySessionStore } from '../../src/backend/adapters/store/in-memory-session.store';
import { EventEmitterBus } from '../../src/backend/adapters/events/event-emitter.bus';
import { SESSION_LIMITS } from '../../src/backend/core/constants';
import { SessionStatus } from '../../src/shared/contracts/v1/session';

describe('CreateSession Use Case', () => {
  let store: InMemorySessionStore;
  let eventBus: EventEmitterBus;
  let createSession: CreateSession;

  beforeEach(() => {
    store = new InMemorySessionStore();
    eventBus = new EventEmitterBus();
    createSession = new CreateSession(store, eventBus);
  });

  it('should create a valid session and store it', async () => {
    const { session } = await createSession.execute({ expiresInSeconds: 120, name: 'Test Vault' });
    expect(session.id).toBeDefined();
    expect(session.name).toBe('Test Vault');
    expect(session.status).toBe(SessionStatus.PENDING);
    expect(session.hostId).toBeDefined();
    expect(session.hostRecoveryToken).toBeDefined();
    expect(session.expiresAt).toBe(session.createdAt + 120 * 1000);
    expect(session.peers[session.hostId]).toBeDefined();

    const stored = await store.get(session.id);
    expect(stored).toEqual(session);
  });

  it('should cap TTL to max allowed limits', async () => {
    const massiveTTL = SESSION_LIMITS.MAX_TTL_MS / 1000 + 10000;
    const { session } = await createSession.execute({ expiresInSeconds: massiveTTL });
    expect(session.expiresAt).toBe(session.createdAt + SESSION_LIMITS.MAX_TTL_MS);
  });

  it('should use default TTL if none provided', async () => {
    const { session } = await createSession.execute();
    expect(session.expiresAt).toBe(session.createdAt + SESSION_LIMITS.DEFAULT_TTL_MS);
  });

  it('refuses to create when the relay is at session capacity', async () => {
    const fullStore = {
      count: vi.fn().mockResolvedValue(SESSION_LIMITS.MAX_ACTIVE_SESSIONS),
      save: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      touch: vi.fn(),
      cleanup: vi.fn(),
    };
    const capped = new CreateSession(fullStore, eventBus);
    await expect(capped.execute({ expiresInSeconds: 120, name: 'Overflow' })).rejects.toMatchObject({
      code: 'SESSION_CAPACITY_REACHED',
    });
    expect(fullStore.save).not.toHaveBeenCalled();
  });

  describe('idempotent create on a client-supplied id', () => {
    it('creates the vault when the supplied id is free', async () => {
      const id = '11111111-2222-4333-8444-555555555555';
      const { session, existing } = await createSession.execute({ id, maxPeers: 2 });
      expect(existing).toBe(false);
      expect(session.id).toBe(id);
      expect(session.maxPeers).toBe(2);
    });

    it('returns the open vault untouched when the id is taken', async () => {
      const id = '11111111-2222-4333-8444-555555555556';
      const first = await createSession.execute({ id, name: 'Pair' });
      const second = await createSession.execute({ id, name: 'Impostor' });

      expect(second.existing).toBe(true);
      expect(second.session.id).toBe(id);
      // Same vault, not a replacement: the second caller cannot rename it,
      // reset its TTL, or displace the host.
      expect(second.session.hostId).toBe(first.session.hostId);
      expect(second.session.name).toBe('Pair');
      expect(second.session.expiresAt).toBe(first.session.expiresAt);
    });

    it('does not emit a second SessionCreated for an existing id', async () => {
      const id = '11111111-2222-4333-8444-555555555557';
      await createSession.execute({ id });
      const spy = vi.spyOn(eventBus, 'emit');
      await createSession.execute({ id });
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not consume capacity for an existing id', async () => {
      const id = '11111111-2222-4333-8444-555555555558';
      await createSession.execute({ id });
      const countSpy = vi.spyOn(store, 'count');
      const { existing } = await createSession.execute({ id });
      expect(existing).toBe(true);
      expect(countSpy).not.toHaveBeenCalled();
    });

    it('clamps maxPeers to the global ceiling and floor', async () => {
      const high = await createSession.execute({ maxPeers: 999 });
      expect(high.session.maxPeers).toBe(SESSION_LIMITS.MAX_PEERS);
      const low = await createSession.execute({ maxPeers: 1 });
      expect(low.session.maxPeers).toBe(2);
    });
  });

  it('should emit SessionCreated event', async () => {
    const spy = vi.spyOn(eventBus, 'emit');
    const { session } = await createSession.execute({ expiresInSeconds: 300 });
    expect(spy).toHaveBeenCalledWith({
      type: 'SessionCreated',
      sessionId: session.id,
      occurredAt: session.createdAt,
      payload: { expiresAt: session.expiresAt },
    });
  });
});
