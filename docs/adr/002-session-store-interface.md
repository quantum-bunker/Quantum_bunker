# ADR-002 — Session Store Interface and In-Memory Implementation

**Status:** Accepted
**Date:** 2026-04-25

---

## Context

Session state must be tracked server-side to route WebSocket messages to the correct peer. The original approach used a raw `JavaScript Map` directly inside business logic. This creates three problems:

1. Routing logic is coupled to a specific data structure.
2. Unit testing requires real `Map` state rather than injectable fakes.
3. Horizontal scaling or Redis adoption requires rewriting the relay service.

---

## Decision

All session access goes through the `ISessionStore` port interface. No code outside `adapters/store/` may directly instantiate or reference `InMemorySessionStore` or any `Map`.

**Phase 1 implementation:** `InMemorySessionStore` — `Map<string, Session>` with a graceful `shutdown()` method.

**Phase 3 swap:** `RedisSessionStore` — same `ISessionStore` interface, zero use-case changes required.

**Binding rule:** `new Map`, `new InMemorySessionStore`, or any direct store construction may only appear in `entrypoints/container.ts`. Use cases receive the store as a constructor parameter typed as `ISessionStore`.

---

## Consequences

**Positive:**
- Use cases are fully unit-testable with a mock `ISessionStore`.
- Redis adoption is a one-file adapter change.
- Horizontal scaling becomes possible when `RedisSessionStore` ships.
- Explicit `shutdown()` method enables graceful drain on `SIGTERM`.

**Negative:**
- The async interface (`Promise<void>`) is heavier than synchronous `Map` for in-memory use. In practice this is negligible (< 1 µs overhead per call).
