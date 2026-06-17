# Test Strategy

## Objectives

1. **Zero-knowledge guarantee**: Server must never log or store decrypted payloads. Asserted in every envelope-related test.
2. **Ephemeral sessions**: Destroyed or expired sessions must instantly drop all sockets and clear memory.
3. **Deterministic delivery**: Message receipts and WebSocket reconnects must work without timing-dependent sleeps.
4. **Anti-abuse coverage**: Rate limits, origin validation, and authorization bypasses are exercised.

---

## Test Matrix

| Feature / Risk | Unit | Integration | E2E | Security |
|---|---|---|---|---|
| Domain types & Zod schemas | ✓ | | | |
| EventBus subscriptions | ✓ | | | |
| Session lifecycle (create/join/expire/destroy) | ✓ | ✓ | ✓ | |
| WS handshake & join auth | | ✓ | | ✓ |
| Relay message fan-out | | ✓ | ✓ | |
| ACK / READ receipts | | ✓ | ✓ | |
| Host accept / reject / kick | ✓ | ✓ | | ✓ |
| Stateless whitelist admission | ✓ | ✓ | | ✓ |
| IDOR / sender mismatch | | | | ✓ |
| Payload zero-knowledge | ✓ | ✓ | | ✓ |
| Cleanup (TTL / inactivity / empty) | ✓ | ✓ | | |
| Rate limiting (messages / connections) | | | | ✓ |
| Cross-session envelope leakage | | ✓ | ✓ | ✓ |
| Nonce replay prevention | ✓ | ✓ | | ✓ |
| Peer token re-claim | | ✓ | | |
| Reconnect within grace period | | ✓ | | |

---

## Test Types

### Unit (`tests/unit/`)
Tool: Vitest

Scope: isolated business logic. Use cases receive mock ports (fake `ISessionStore`, fake `IEventBus`, fake `IRelayTransport`). No I/O, no sockets, no timers (use `vi.useFakeTimers()`).

Covers: `CreateSession`, `RelayMessage`, `CleanupSessions`, Zod schema validation, `RelayPolicy`, error code assertions.

### Integration (`tests/integration/`)
Tool: Vitest + Supertest + real `ws` clients

Scope: REST route wiring, WS transport adapter, in-memory store. Uses the real DI container. No mock adapters — real `InMemorySessionStore`, real WebSocket server.

Covers: HTTP status codes, WS frame parsing, session state transitions, rate limit enforcement, cleanup scheduler behavior.

### E2E / Relay (`tests/e2e/`)
Tool: Vitest + real `ws` clients

Scope: multi-peer flows. Host + member(s) exchange messages locally over WebSockets without a browser. Verifies the complete relay path end-to-end.

Covers: two-peer messaging, ACK/READ receipts, session expiry mid-conversation, rejected join, expired session join attempt.

### Smoke (`tests/smoke/`)
Tool: Vitest

Scope: server boots, core path works. Fast; runs on every PR.

Covers: health endpoint responds `200`, session creation succeeds, host can join, basic message relay works.

### Load (`tests/load/`)
Tool: Vitest + worker threads

Scope: server stability under volume. 200+ concurrent connections, multiple sessions, sustained message throughput.

Covers: no memory leaks, no handle leaks, response times within bounds, graceful rejection at capacity.

### Stress (`tests/stress/`)
Tool: Vitest

Scope: beyond limits. 30+ peers in a single session, messages at rate-limit threshold, large payloads.

Covers: graceful degradation, correct error codes (not crashes), cleanup still runs under load.

---

## Rules

- **Fake timers**: Always use `vi.useFakeTimers()` for any test involving TTL, inactivity, or cleanup. Never use real `setTimeout` in tests.
- **Cleanup**: Use `afterEach` to clear the in-memory store, remove EventBus listeners, and close all sockets. Leaked handles fail the test suite.
- **No sleeps**: Await specific events or use fake timer advancement. Never `await sleep(N)`.
- **Fakes over mocks**: Use fakes (objects implementing the port interface) for `ISessionStore` and `IRelayTransport`. Use `vi.fn()` only for assertion purposes (e.g., checking that a logger was never called with a payload).
- **Zero-knowledge assertion**: In any test that handles an envelope, assert that no log call received the `payload` value. Use a Winston transport spy.
- **File names mirror source**: `relay-message.use-case.ts` → `relay-message.test.ts`. One test file per source file.
- **No test databases**: There is no database. Always use the real `InMemorySessionStore`.
