import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RelayMessage } from '../../src/backend/application/use-cases/relay-message.use-case';
import { InMemorySessionStore } from '../../src/backend/adapters/store/in-memory-session.store';
import { EventEmitterBus } from '../../src/backend/adapters/events/event-emitter.bus';
import { IRelayTransport } from '../../src/backend/application/ports/relay-transport.port';
import { RelayEnvelope, EnvelopeType } from '../../src/shared/contracts/v1/envelope';
import { SessionStatus } from '../../src/shared/contracts/v1/session';
import { RELAY_LIMITS } from '../../src/backend/core/constants';

class FakeTransport implements IRelayTransport {
  connectedPeers: Record<string, string[]> = {};
  sentMessages: any[] = [];

  isPeerConnected(sessionId: string, peerId: string): boolean {
    return this.connectedPeers[sessionId]?.includes(peerId) ?? false;
  }

  async send(sessionId: string, peerId: string, payload: any): Promise<void> {
    this.sentMessages.push({ sessionId, peerId, payload });
  }

  async sendToMany(sessionId: string, peerIds: string[], payload: any): Promise<string[]> {
    const delivered: string[] = [];
    for (const peerId of peerIds) {
      if (this.isPeerConnected(sessionId, peerId)) {
        this.sentMessages.push({ sessionId, peerId, payload });
        delivered.push(peerId);
      }
    }
    return delivered;
  }

  disconnectSession(sessionId: string): void {}
}

describe('RelayMessage Use Case', () => {
  let store: InMemorySessionStore;
  let transport: FakeTransport;
  let eventBus: EventEmitterBus;
  let relayMessage: RelayMessage;

  beforeEach(() => {
    store = new InMemorySessionStore();
    transport = new FakeTransport();
    eventBus = new EventEmitterBus();
    relayMessage = new RelayMessage(store, transport, eventBus);
  });

  it('should reject if session does not exist', async () => {
    const spy = vi.spyOn(eventBus, 'emit');
    const envelope: RelayEnvelope = {
      sessionId: 'fake-id',
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: 'n1',
      payload: 'abc'
    };

    await relayMessage.execute(envelope);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'EnvelopeRejected',
      payload: expect.objectContaining({ reason: 'Session not found' })
    }));
  });

  it('should reject if timestamp drift is too large', async () => {
    const session = {
      id: 'sess-1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      lastActivityAt: Date.now(),
      status: SessionStatus.ACTIVE,
      peers: { 'peer-a': { id: 'peer-a', joinedAt: Date.now(), lastSeenAt: Date.now() } },
      pendingPeers: {},
      hostId: 'peer-a',
      hostRecoveryToken: 'token',
      maxPeers: 10,
      participantCount: 1,
      emptySince: Date.now()
    };
    await store.save(session);

    const spy = vi.spyOn(eventBus, 'emit');
    const envelope: RelayEnvelope = {
      sessionId: 'sess-1',
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now() - RELAY_LIMITS.TIMESTAMP_TOLERANCE_MS - 1000,
      nonce: 'n1',
      payload: 'abc'
    };

    await relayMessage.execute(envelope);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'EnvelopeRejected',
      payload: expect.objectContaining({ reason: 'Timestamp drift too large' })
    }));
  });

  it('should relay message to connected peers', async () => {
    const session = {
      id: 'sess-1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      lastActivityAt: Date.now(),
      status: SessionStatus.ACTIVE,
      peers: { 
        'peer-a': { id: 'peer-a', joinedAt: Date.now(), lastSeenAt: Date.now() },
        'peer-b': { id: 'peer-b', joinedAt: Date.now(), lastSeenAt: Date.now() }
      },
      pendingPeers: {},
      hostId: 'peer-a',
      hostRecoveryToken: 'token',
      maxPeers: 10,
      participantCount: 2,
      emptySince: Date.now()
    };
    await store.save(session);
    transport.connectedPeers['sess-1'] = ['peer-b'];

    const spy = vi.spyOn(eventBus, 'emit');
    const envelope: RelayEnvelope = {
      sessionId: 'sess-1',
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: 'n1',
      payload: 'abc'
    };

    await relayMessage.execute(envelope);

    expect(transport.sentMessages.length).toBe(1);
    expect(transport.sentMessages[0].peerId).toBe('peer-b');
    
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'MessageRelayed',
      payload: expect.objectContaining({ from: 'peer-a' })
    }));
  });

  it('should reject replayed nonces from the same sender', async () => {
    const session = {
      id: 'sess-1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      lastActivityAt: Date.now(),
      status: SessionStatus.ACTIVE,
      peers: {
        'peer-a': { id: 'peer-a', joinedAt: Date.now(), lastSeenAt: Date.now() },
        'peer-b': { id: 'peer-b', joinedAt: Date.now(), lastSeenAt: Date.now() }
      },
      pendingPeers: {},
      hostId: 'peer-a',
      hostRecoveryToken: 'token',
      maxPeers: 10,
      participantCount: 2,
      emptySince: Date.now()
    };
    await store.save(session);
    transport.connectedPeers['sess-1'] = ['peer-b'];

    const spy = vi.spyOn(eventBus, 'emit');
    const envelope: RelayEnvelope = {
      sessionId: 'sess-1',
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: 'replay-me',
      payload: 'abc'
    };

    await relayMessage.execute(envelope);
    await relayMessage.execute(envelope);

    expect(transport.sentMessages.length).toBe(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'EnvelopeRejected',
      payload: expect.objectContaining({ reason: 'Duplicate nonce' })
    }));
  });

  it('should never emit payload contents in rejection events', async () => {
    const spy = vi.spyOn(eventBus, 'emit');
    const envelope: RelayEnvelope = {
      sessionId: 'fake-id',
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: 'n1',
      payload: 'super-secret-contents'
    };

    await relayMessage.execute(envelope);

    const rejected = spy.mock.calls.find(([e]) => e.type === 'EnvelopeRejected')![0] as any;
    expect(JSON.stringify(rejected)).not.toContain('super-secret-contents');
  });

  it('should reject when sender is the only peer (no recipients)', async () => {
    const session = {
      id: 'sess-solo',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      lastActivityAt: Date.now(),
      status: SessionStatus.ACTIVE,
      peers: { 'peer-a': { id: 'peer-a', joinedAt: Date.now(), lastSeenAt: Date.now() } },
      pendingPeers: {},
      hostId: 'peer-a',
      hostRecoveryToken: 'token',
      maxPeers: 10,
      participantCount: 1,
      emptySince: Date.now()
    };
    await store.save(session);

    const spy = vi.spyOn(eventBus, 'emit');
    await relayMessage.execute({
      sessionId: 'sess-solo',
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: 'n-solo',
      payload: 'abc'
    });

    expect(transport.sentMessages.length).toBe(0);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'EnvelopeRejected',
      payload: expect.objectContaining({ reason: 'Recipient not joined' })
    }));
  });

  it('should reject when all recipients are offline', async () => {
    const session = {
      id: 'sess-offline',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      lastActivityAt: Date.now(),
      status: SessionStatus.ACTIVE,
      peers: {
        'peer-a': { id: 'peer-a', joinedAt: Date.now(), lastSeenAt: Date.now() },
        'peer-b': { id: 'peer-b', joinedAt: Date.now(), lastSeenAt: Date.now() }
      },
      pendingPeers: {},
      hostId: 'peer-a',
      hostRecoveryToken: 'token',
      maxPeers: 10,
      participantCount: 2,
      emptySince: Date.now()
    };
    await store.save(session);
    // peer-b is not in connectedPeers → offline

    const spy = vi.spyOn(eventBus, 'emit');
    await relayMessage.execute({
      sessionId: 'sess-offline',
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: 'n-offline',
      payload: 'abc'
    });

    expect(transport.sentMessages.length).toBe(0);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'EnvelopeRejected',
      payload: expect.objectContaining({ reason: 'Recipient offline' })
    }));
  });

  it('nonces are scoped per sender (same nonce from different senders is allowed)', async () => {
    const session = {
      id: 'sess-2',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      lastActivityAt: Date.now(),
      status: SessionStatus.ACTIVE,
      peers: {
        'peer-a': { id: 'peer-a', joinedAt: Date.now(), lastSeenAt: Date.now() },
        'peer-b': { id: 'peer-b', joinedAt: Date.now(), lastSeenAt: Date.now() }
      },
      pendingPeers: {},
      hostId: 'peer-a',
      hostRecoveryToken: 'token',
      maxPeers: 10,
      participantCount: 2,
      emptySince: Date.now()
    };
    await store.save(session);
    transport.connectedPeers['sess-2'] = ['peer-a', 'peer-b'];

    const base = { sessionId: 'sess-2', type: EnvelopeType.NOISE_MESSAGE, timestamp: Date.now(), nonce: 'shared-nonce', payload: 'abc' };
    await relayMessage.execute({ ...base, from: 'peer-a' });
    await relayMessage.execute({ ...base, from: 'peer-b' });

    // both should be delivered (2 relayed messages total)
    expect(transport.sentMessages.length).toBe(2);
  });

  it('nonce cache eviction does not crash under sustained load', async () => {
    const session = {
      id: 'sess-load',
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      lastActivityAt: Date.now(),
      status: SessionStatus.ACTIVE,
      peers: {
        'peer-a': { id: 'peer-a', joinedAt: Date.now(), lastSeenAt: Date.now() },
        'peer-b': { id: 'peer-b', joinedAt: Date.now(), lastSeenAt: Date.now() }
      },
      pendingPeers: {},
      hostId: 'peer-a',
      hostRecoveryToken: 'token',
      maxPeers: 10,
      participantCount: 2,
      emptySince: Date.now()
    };
    await store.save(session);
    transport.connectedPeers['sess-load'] = ['peer-b'];

    // send enough unique nonces to exceed NONCE_CACHE_MAX (50_000) and trigger
    // the prune path; this should not throw or leak memory
    for (let i = 0; i < RELAY_LIMITS.NONCE_CACHE_MAX + 5; i++) {
      await relayMessage.execute({
        sessionId: 'sess-load',
        from: 'peer-a',
        type: EnvelopeType.NOISE_MESSAGE,
        timestamp: Date.now(),
        nonce: `nonce-${i}`,
        payload: 'x'
      });
    }

    expect(transport.sentMessages.length).toBe(RELAY_LIMITS.NONCE_CACHE_MAX + 5);
  });

  it('should refuse to relay plaintext envelopes', async () => {
    const session = {
      id: 'sess-1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      lastActivityAt: Date.now(),
      status: SessionStatus.ACTIVE,
      peers: {
        'peer-a': { id: 'peer-a', joinedAt: Date.now(), lastSeenAt: Date.now() },
        'peer-b': { id: 'peer-b', joinedAt: Date.now(), lastSeenAt: Date.now() }
      },
      pendingPeers: {},
      hostId: 'peer-a',
      hostRecoveryToken: 'token',
      maxPeers: 10,
      participantCount: 2,
      emptySince: Date.now()
    };
    await store.save(session);
    transport.connectedPeers['sess-1'] = ['peer-b'];

    await relayMessage.execute({
      sessionId: 'sess-1',
      from: 'peer-a',
      type: EnvelopeType.PLAINTEXT,
      timestamp: Date.now(),
      nonce: 'n-plain',
      payload: 'hello'
    });

    expect(transport.sentMessages.length).toBe(0);
  });
});
