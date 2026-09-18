import winston from 'winston';
import { IEventBus } from '../../application/ports/event-bus.port';

// Per-envelope metadata is NOT logged by default.
//
// The payload was always opaque, but logging sessionId + from + envelopeType +
// byteSize on every relayed message produced a complete social and timing graph
// per session: who spoke to whom, when, and how much. That is precisely the
// metadata PADDING and the timing jitter exist to defend against, and it made
// the README's "No Logs. No Traces." claim untrue.
//
// QB_METADATA_LOGS=1 re-enables it for local debugging only. It must never be
// set on a deployment.
function metadataLogsEnabled(): boolean {
  return process.env.QB_METADATA_LOGS === '1';
}

export function setupLogging(eventBus: IEventBus) {
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
      new winston.transports.Console({
        format: winston.format.simple(),
      }),
    ],
  });

  const verbose = metadataLogsEnabled();

  // Lifecycle events carry no per-message metadata and stay on: they are what
  // makes a relay operable (capacity, expiry) without describing who talked.
  eventBus.on('SessionCreated', (e) => logger.info(`SessionCreated: ${e.sessionId}`));
  eventBus.on('SessionExpired', (e) => logger.info(`SessionExpired: ${e.sessionId} - Reason: ${e.payload.reason}`));
  // Rejections are a safety signal and already redact rawEnvelope.payload
  // upstream (see relay-message.use-case.ts).
  eventBus.on('EnvelopeRejected', (e) => logger.warn(`EnvelopeRejected: ${e.sessionId}`, e.payload));

  // A peer joining is worth a line; WHICH peer is a participant identifier and
  // is dropped.
  eventBus.on('PeerJoined', (e) => {
    if (verbose) logger.info(`PeerJoined: ${e.sessionId} ${e.payload.peerId}`);
    else logger.info(`PeerJoined: ${e.sessionId}`);
  });

  if (verbose) {
    eventBus.on('MessageRelayed', (e) => logger.info(`MessageRelayed: ${e.sessionId}`, e.payload));
  }
}
