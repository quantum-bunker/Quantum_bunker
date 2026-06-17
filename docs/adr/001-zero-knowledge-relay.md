# ADR-001 — Zero-Knowledge Relay Architecture

**Status:** Accepted
**Date:** 2026-04-25

---

## Context

Quantum Bunker is a communications platform where users require end-to-end encryption. The backend must coordinate session setup and message routing without becoming a liability for user data.

If the server could decrypt messages, a server compromise or legal compulsion exposes all user communications. The product's trust model depends on the server being provably unable to read content — not just policy-restricted, but architecturally incapable.

---

## Decision

The backend relay operates as a **zero-knowledge dumb forwarder**:

1. The server inspects **only** the routing fields of `RelayEnvelope`: `sessionId`, `from`, `type`, `timestamp`, and `nonce`.
2. The `payload` field is an opaque base64url blob. The server **MUST**:
   - Forward it unchanged to the destination peer.
   - Never log, store, parse, or decode it.
   - Never buffer it beyond the time needed for a single relay hop.
3. The server has no knowledge of encryption keys, plaintext content, or the semantic meaning of any message.
4. `nonce` and `timestamp` are validated for anti-replay only (reject messages outside `TIMESTAMP_TOLERANCE_MS`). Their cryptographic meaning is managed entirely by clients.
5. `EnvelopeRejected` events always redact `rawEnvelope.payload` before emission — no subscriber ever sees payload content.

**Binding rule:** No function in `core/` or `application/` may receive, return, or operate on the `payload` field as anything other than `string`. No decoding, parsing, or inspection — ever.

---

## Consequences

**Positive:**
- Server compromise does not expose message content.
- Legal compulsion cannot produce decrypted communications.
- Crypto implementation can evolve on the client without changing the relay.
- Simpler server: no decryption, no content moderation, no search indexing.

**Negative:**
- Server-side content moderation is impossible by design.
- Server-side search or message archive is impossible by design.
- Abuse relying on the encrypted channel (e.g., CSAM) cannot be detected by the server.
