import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { setupLogging } from '../../src/backend/adapters/logging/winston.logger';
import { IEventBus } from '../../src/backend/application/ports/event-bus.port';
import { DomainEvent } from '../../src/shared/contracts/v1/events';

// A stand-in bus: setupLogging only ever subscribes, so an EventEmitter with
// the port's shape lets the test drive real domain events through it.
function makeBus(): IEventBus & { fire: (type: string, event: DomainEvent) => void } {
  const emitter = new EventEmitter();
  return {
    emit: (event: DomainEvent) => { emitter.emit(event.type, event); },
    on: (type: string, handler: (event: DomainEvent) => void) => { emitter.on(type, handler); },
    fire: (type: string, event: DomainEvent) => { emitter.emit(type, event); },
  };
}

const relayed = {
  type: 'MessageRelayed' as const,
  sessionId: 'vault-abc',
  occurredAt: Date.now(),
  payload: { envelopeType: 'NOISE_MESSAGE', byteSize: 8192, from: 'peer-xyz' },
};

describe('metadata logging', () => {
  let written: string[];
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.QB_METADATA_LOGS;
    written = [];
    // Winston's Console transport writes to console._stdout when it exists,
    // falling back to console.log — not to process.stdout directly. Both are
    // captured so the assertion holds regardless of which path is taken.
    const sink = console as unknown as { _stdout?: { write: (s: string) => boolean } };
    if (sink._stdout) {
      vi.spyOn(sink._stdout, 'write').mockImplementation((chunk: string) => {
        written.push(String(chunk));
        return true;
      });
    }
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      written.push(args.join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (prev === undefined) delete process.env.QB_METADATA_LOGS;
    else process.env.QB_METADATA_LOGS = prev;
  });

  it('does not even subscribe to MessageRelayed when the flag is unset', () => {
    delete process.env.QB_METADATA_LOGS;
    const subscribed: string[] = [];
    const bus = makeBus();
    const spy = vi.spyOn(bus, 'on').mockImplementation((type: string) => { subscribed.push(type); });
    setupLogging(bus);
    spy.mockRestore();
    expect(subscribed).not.toContain('MessageRelayed');
  });

  it('writes nothing on relay when QB_METADATA_LOGS is unset', async () => {
    delete process.env.QB_METADATA_LOGS;
    const bus = makeBus();
    setupLogging(bus);

    for (let i = 0; i < 5; i++) bus.fire('MessageRelayed', relayed);
    await new Promise(r => setTimeout(r, 20));

    // Per-message metadata is a full social and timing graph; none of it,
    // including the sessionId alone, may reach stdout by default.
    expect(written.join('')).toBe('');
  });

  it('never leaks the sender or byte size of a relayed message', async () => {
    delete process.env.QB_METADATA_LOGS;
    const bus = makeBus();
    setupLogging(bus);
    bus.fire('MessageRelayed', relayed);
    await new Promise(r => setTimeout(r, 20));

    const out = written.join('');
    expect(out).not.toContain('peer-xyz');
    expect(out).not.toContain('8192');
    expect(out).not.toContain('vault-abc');
  });

  it('omits the peerId from PeerJoined by default', async () => {
    delete process.env.QB_METADATA_LOGS;
    const bus = makeBus();
    setupLogging(bus);
    bus.fire('PeerJoined', { type: 'PeerJoined', sessionId: 'vault-abc', occurredAt: Date.now(), payload: { peerId: 'peer-xyz' } });
    await new Promise(r => setTimeout(r, 20));

    const out = written.join('');
    expect(out).toContain('PeerJoined');
    expect(out).not.toContain('peer-xyz');
  });

  it('restores full metadata under the opt-in debug flag', async () => {
    process.env.QB_METADATA_LOGS = '1';
    const bus = makeBus();
    setupLogging(bus);
    bus.fire('MessageRelayed', relayed);
    await new Promise(r => setTimeout(r, 20));

    expect(written.join('')).toContain('MessageRelayed');
  });

  it('keeps operational lifecycle events, which carry no per-message metadata', async () => {
    delete process.env.QB_METADATA_LOGS;
    const bus = makeBus();
    setupLogging(bus);
    bus.fire('SessionExpired', { type: 'SessionExpired', sessionId: 'v1', occurredAt: Date.now(), payload: { reason: 'ttl', lastActivityAt: 0 } });
    await new Promise(r => setTimeout(r, 20));

    expect(written.join('')).toContain('SessionExpired');
  });

  // EnvelopeRejected was the one per-message event that logged its full
  // rawEnvelope unconditionally — `from`, `nonce`, `timestamp` — which is the
  // same participant graph the flag exists to withhold. Every duplicate-nonce
  // or offline-recipient rejection wrote one.
  it('does not leak envelope metadata on rejection when the flag is unset', async () => {
    delete process.env.QB_METADATA_LOGS;
    const bus = makeBus();
    setupLogging(bus);

    bus.fire('EnvelopeRejected', {
      type: 'EnvelopeRejected',
      sessionId: 'vault-abc',
      occurredAt: Date.now(),
      payload: {
        reason: 'Duplicate nonce',
        rawEnvelope: {
          sessionId: 'vault-abc',
          from: 'peer-xyz',
          nonce: 'nonce-secret',
          type: 'NOISE_MESSAGE',
          timestamp: 1234567890,
          payload: '[redacted 42 chars]',
        },
      },
    } as never);
    await new Promise(r => setTimeout(r, 20));

    const out = written.join('');
    expect(out).toContain('Duplicate nonce');
    expect(out).not.toContain('peer-xyz');
    expect(out).not.toContain('nonce-secret');
    expect(out).not.toContain('1234567890');
  });
});
