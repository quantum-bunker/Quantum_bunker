# ADR-003 — Freeze Envelope Contract; Defer Crypto Implementation

**Status:** Accepted
**Date:** 2026-04-25

---

## Context

End-to-end encryption using the Noise Protocol Framework (XX pattern) is planned. Deferring the crypto implementation is valid scope management. Deferring the **message envelope schema** alongside it is not.

If the wire format is undefined during early development, the relay handler, WS adapter, Zod validation schemas, and frontend message dispatcher will all be written for an undefined shape — causing a full rewrite when crypto ships.

---

## Decision

### 1. `RelayEnvelope` is frozen

`shared/contracts/v1/envelope.ts` is the permanent wire format. All phases use the same envelope structure:

| Phase | `payload` content |
|---|---|
| Phase 1 | Base64url-encoded plaintext (dev/test) |
| Phase 2+ | Base64url-encoded Noise ciphertext |

The relay server, WS adapter, and Zod schemas do not change between phases.

### 2. Crypto library is locked

When Phase 2 begins, use `@stablelib/noise` (maintained, TypeScript-native, audited). `noise-js` is **banned** from this codebase.

### 3. `nonce` and `timestamp` are validated in Phase 1

Server validates presence and timestamp drift today. In Phase 2 these fields carry cryptographic meaning managed by the client.

**Binding rule:** `shared/contracts/v1/envelope.ts` is frozen. Breaking changes (removing or renaming fields) require a new `shared/contracts/v2/` directory and a new ADR. Additive changes (new optional fields) require a comment and PR approval only.

---

## Consequences

**Positive:**
- Frontend and backend are built against a stable contract from day one.
- Phase 2 crypto requires zero relay-layer changes.
- Zod schemas written once, valid for both phases.

**Negative:**
- `publicKey` in `CreateSessionResponse` is an empty string in Phase 1 — a minor placeholder to avoid a future breaking API change.
