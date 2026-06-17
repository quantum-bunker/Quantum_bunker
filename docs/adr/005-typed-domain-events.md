# ADR-005 — Typed Domain Events for Metrics, Logging, and Extension Hooks

**Status:** Accepted
**Date:** 2026-04-25

---

## Context

Logging, metrics, and future hooks (presence, audit trails, alerts) are all triggered by the same moments: session created, peer joined, message relayed, session expired. Without a formal mechanism, these become direct calls inside use cases — coupling application logic to infrastructure and violating ADR-004.

The zero-knowledge invariant (ADR-001) also requires that logging never include payload content. This is easier to audit and enforce when logging is a separate, subscribing concern rather than scattered `logger.info()` calls inside use cases.

---

## Decision

Use cases emit typed `DomainEvent` objects via the `IEventBus` port. Infrastructure adapters subscribe to events and handle their own side effects.

**Defined events (all in `shared/contracts/v1/events.ts`):**
- `SessionCreated`, `PeerJoined`, `PeerDisconnected`
- `MessageRelayed` — payload includes `byteSize` and `envelopeType`, never content
- `SessionExpired`, `SessionClosed`
- `EnvelopeRejected` — `rawEnvelope.payload` is redacted before emission

**Binding rule:** Use cases call `eventBus.emit()`. They never call a logger directly. The Winston logger adapter subscribes to events and formats log entries.

---

## Consequences

**Positive:**
- Use cases have zero infrastructure imports — fully unit-testable.
- New observers attach via `eventBus.on()` without touching use-case code.
- Metrics and logging are opt-out; disabling them does not change behavior.
- Zero-knowledge invariant is centrally enforced in the event emission layer, not scattered across multiple loggers.
- Maps cleanly to future external event streams (Redis pub/sub, etc.).

**Negative:**
- Slightly more indirection — a log line is 2 hops instead of 1.
- Event type list must stay in sync with use-case emissions.
