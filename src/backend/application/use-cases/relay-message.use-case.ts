import { RelayEnvelope } from '../../../shared/contracts/v1/envelope';
import { RelayPolicy } from '../../core/policies/relay.policy';
import { RELAY_LIMITS } from '../../core/constants';
import { ISessionStore } from '../ports/session-store.port';
import { IEventBus } from '../ports/event-bus.port';
import { IRelayTransport } from '../ports/relay-transport.port';

export class RelayMessage {
  private seenNonces = new Map<string, number>();

  constructor(
    private readonly store: ISessionStore,
    private readonly transport: IRelayTransport,
    private readonly eventBus: IEventBus
  ) {}

  async execute(envelope: RelayEnvelope): Promise<void> {
    const session = await this.store.get(envelope.sessionId);
    if (!session) {
      this.reject('Session not found', envelope);
      return;
    }

    const validation = RelayPolicy.validate(envelope);
    if (!validation.valid) {
      this.reject(validation.reason || 'Invalid envelope', envelope);
      return;
    }

    if (this.isReplay(envelope)) {
      this.reject('Duplicate nonce', envelope);
      return;
    }

    const destinationPeers = Object.keys(session.peers).filter(id => id !== envelope.from);
    if (destinationPeers.length === 0) {
      this.reject('Recipient not joined', envelope);
      return;
    }

    const delivered = await this.transport.sendToMany(session.id, destinationPeers, envelope);
    if (delivered.length === 0) {
      this.reject('Recipient offline', envelope);
      return;
    }

    await this.store.touch(session.id);

    this.eventBus.emit({
      type: 'MessageRelayed',
      sessionId: session.id,
      occurredAt: Date.now(),
      payload: {
        envelopeType: envelope.type,
        // payload length, not a full re-serialization: this runs on every
        // relayed message and the envelope can be MAX_PAYLOAD_BYTES large,
        // while the listener is only subscribed when QB_METADATA_LOGS=1.
        byteSize: envelope.payload.length,
        from: envelope.from,
      },
    });
  }

  private isReplay(envelope: RelayEnvelope): boolean {
    const key = `${envelope.sessionId}:${envelope.from}:${envelope.nonce}`;
    const now = Date.now();
    if (this.seenNonces.has(key)) return true;
    if (this.seenNonces.size >= RELAY_LIMITS.NONCE_CACHE_MAX) this.pruneNonces(now);
    this.seenNonces.set(key, now);
    return false;
  }

  private pruneNonces(now: number): void {
    const cutoff = now - RELAY_LIMITS.TIMESTAMP_TOLERANCE_MS * 2;
    for (const [key, at] of this.seenNonces) {
      if (at < cutoff) this.seenNonces.delete(key);
    }
    // Insertion order means the oldest entries come first; under sustained
    // pressure drop them so the cache can never grow without bound.
    while (this.seenNonces.size >= RELAY_LIMITS.NONCE_CACHE_MAX) {
      const oldest = this.seenNonces.keys().next().value;
      if (oldest === undefined) break;
      this.seenNonces.delete(oldest);
    }
  }

  private reject(reason: string, envelope: RelayEnvelope) {
    this.eventBus.emit({
      type: 'EnvelopeRejected',
      sessionId: envelope.sessionId,
      occurredAt: Date.now(),
      // Zero-knowledge invariant: never let payload contents reach the event
      // bus, which logs automatically.
      payload: {
        reason,
        rawEnvelope: { ...envelope, payload: `[redacted ${envelope.payload?.length ?? 0} chars]` },
      },
    });
  }
}
