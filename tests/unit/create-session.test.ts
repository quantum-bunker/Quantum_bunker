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
    const session = await createSession.execute(120, 'Test Vault');
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
    const session = await createSession.execute(massiveTTL);
    expect(session.expiresAt).toBe(session.createdAt + SESSION_LIMITS.MAX_TTL_MS);
  });

  it('should use default TTL if none provided', async () => {
    const session = await createSession.execute();
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
    await expect(capped.execute(120, 'Overflow')).rejects.toMatchObject({
      code: 'SESSION_CAPACITY_REACHED',
    });
    expect(fullStore.save).not.toHaveBeenCalled();
  });

  it('should emit SessionCreated event', async () => {
    const spy = vi.spyOn(eventBus, 'emit');
    const session = await createSession.execute(300);
    expect(spy).toHaveBeenCalledWith({
      type: 'SessionCreated',
      sessionId: session.id,
      occurredAt: session.createdAt,
      payload: { expiresAt: session.expiresAt },
    });
  });
});
