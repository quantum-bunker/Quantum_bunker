// Use cases throw DomainError with a stable `code` so transport adapters can map
// to the right WS error frame or HTTP status without string-matching messages.
export type DomainErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'PEER_LIMIT_REACHED'
  | 'SESSION_CAPACITY_REACHED';

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
