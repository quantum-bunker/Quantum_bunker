# ADR-004 — Hexagonal-Lite Module Boundary Rules

**Status:** Accepted
**Date:** 2026-04-25

---

## Context

In a flat `services/` + `routes/` structure, HTTP logic, WebSocket logic, storage logic, and domain logic gradually bleed into each other. The route handler starts making direct `Map` calls; the WS adapter starts applying session policies; the logger gets passed into domain objects. This makes every component hard to test in isolation and hard to replace.

---

## Decision

The backend uses a **4-layer hex-lite architecture** with a strict one-directional dependency rule:

```
core → application → adapters → entrypoints
```

| Layer | May import | Must NOT import |
|---|---|---|
| `core/` | `shared/contracts/v1/` types only | application, adapters, entrypoints, Node built-ins |
| `application/` | `core/`, port interfaces | adapter implementations, Express, ws, Winston |
| `adapters/` | `application/`, `core/`, npm infra libs | entrypoints |
| `entrypoints/` | Everything (composition root) | — |

Violations are enforced at review time. A future ESLint rule can automate this.

---

## Consequences

**Positive:**
- Use cases are testable without any infrastructure — pass mock ports.
- New transports (gRPC, QUIC) are new adapters; core is unchanged.
- New storage backends are new adapters; relay logic is unchanged.
- Every piece of code has a single clear home.

**Negative:**
- More files than a flat structure.
- Contributors must understand the model before adding code.
- Some straightforward operations require three files (port interface + use case + adapter).
