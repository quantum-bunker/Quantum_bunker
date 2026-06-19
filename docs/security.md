# Security & Privacy

## Threat Model

Quantum Bunker is designed to protect message content against:
- A **compromised relay server** (operator, attacker, legal compulsion)
- **Network interception** between client and server
- **Passive surveillance** via traffic analysis

It does NOT protect against:
- A compromised client device (malware on the user's machine)
- The user sharing their screen or being physically observed
- Server-side content moderation (impossible by design)

---

## Zero-Knowledge Relay

The server is a **dumb forwarder**. It sees only the routing envelope:

```
RelayEnvelope {
  sessionId, from, type, timestamp, nonce   ← server reads these
  payload                                   ← opaque base64url blob, NEVER inspected
}
```

**Binding rules enforced throughout the codebase:**
- No function in `core/` or `application/` receives `payload` as anything other than `string`
- No log statement includes `payload` (asserted in security test suite)
- `EnvelopeRejected` events redact `rawEnvelope.payload` before emission
- Zod schema validates `payload` as a non-empty string only — no structural parsing

If the server is subpoenaed, the most it can provide is: who connected to which session, when, and the size and type of each message — never the content.

See ADR-001.

---

## Encryption Stack (Client-Side)

Messages travel through two encryption layers:

```
Plaintext
  │  (padded to bucket: 8 KB / 64 KB / 512 KB / 4 MB)
  ▼
Double-Ratchet ciphertext     ← per-message forward secrecy, break-in recovery
  │
  ▼
Noise Protocol XX handshake   ← mutual authentication, session key establishment
  │
  ▼
TLS (HTTPS / WSS)             ← transport layer (server sees ciphertext only)
```

The Noise handshake establishes a shared secret and authenticates both parties' static keys. After handshake, the double ratchet provides per-message keys — compromise of one key does not expose past or future messages.

Crypto library: `@stablelib/noise` (TypeScript-native, audited). `noise-js` is banned (see ADR-003).

---

## Identity

**Long-term identity:** Ed25519 key pair, passphrase-protected. The private key is encrypted with PBKDF2-SHA256 (high iteration count) + AES-GCM and stored in `localStorage`. The passphrase never leaves the device.

**Burner key:** If no long-term identity exists, a fresh Ed25519 key pair is generated per session. It is not persisted. Different sessions use different keys.

**Key fingerprint:** 32-byte hex of the public key. Displayed in the "Verify Contacts" panel for out-of-band comparison.

---

## Contact Verification

After the Noise handshake, each peer's remote static key is known. The UI derives a **safety number** from the key material and displays it in "Verify Contacts". Peers compare this number out-of-band (phone call, in-person) to confirm they are talking to the right person and that no relay-operator MITM occurred.

If a previously pinned peer's static key changes:
- A **full-screen red overlay** blocks all messaging
- The user must re-verify or clear the pin before messaging resumes
- The overlay cannot be dismissed without an explicit action

---

## Access Control

| Mechanism | What it protects |
|---|---|
| `hostRecoveryToken` | Host authority after reconnect; required for `DELETE /api/sessions/:id` |
| `peerToken` | Peer identity re-claim; prevents identity takeover after reconnect |
| Host `accept_join` / `reject_join` | Approves or denies pending peers |
| `kick_peer` | Host-only; immediate eviction |
| Stateless whitelist | Auto-admit pre-authorized members via Ed25519 signature |
| Mutual in-chat whitelist | Peers whitelist each other; both must accept |

**Host authority is server-enforced**, not just a UI guard. The WS transport checks `isHost` from session state before processing `accept_join`, `reject_join`, and `kick_peer`.

---

## Stateless Whitelist

For sessions where the host wants to pre-authorize specific members without runtime approval:

1. Host creates session with `hostPublicKey` (Ed25519, base64url)
2. Host issues a `MembershipToken`: `sign({ memberPublicKey, sessionId })` with host private key
3. Member receives token and stores it in `useMembership`
4. On `join`, member sends `membershipToken` + `joinProof` (member-signed `sessionId|peerId|timestamp|nonce`)
5. Server verifies both signatures against `session.hostPublicKey`, dedupes the proof nonce, auto-admits

Nothing is persisted on the server — membership state is zero.

---

## Replay Prevention

**Nonce deduplication:** A bounded cache (`NONCE_CACHE_MAX` = 50,000 entries, FIFO eviction) tracks seen nonces, keyed by `sessionId:from:nonce`. Duplicate nonces are rejected. This is the sole, server-relative replay defense — it does not depend on the client clock.

The client also deduplicates by nonce to handle relay fan-out edge cases.

> The relay does **not** reject envelopes based on the difference between the client's `timestamp` and server time. Clients are not time-synchronized; a device whose wall clock was even a minute off would otherwise have every envelope — including the Noise handshake signaling — silently rejected, while plaintext control frames like `join` still passed, making a vault appear joinable but unable to relay a single message. `TIMESTAMP_TOLERANCE_MS` now only bounds the nonce cache's prune window. The `timestamp` field remains in the envelope for client-side ordering/display.

---

## Traffic Analysis Hardening

Even with encrypted payloads, an observer can infer communication patterns from timing and message size. Quantum Bunker mitigates this in two ways:

**Size normalization:** Plaintext is padded to fixed buckets before encryption:
- 8 KB (covers most short text messages)
- 64 KB
- 512 KB
- 4 MB (capped here; larger content is length-prefixed but not padded further)

A 5-character message and a 4 KB message produce the same ciphertext size. An observer cannot distinguish message length.

**Timing jitter:** Non-interactive frames (ACK, READ, EDIT, DELETE) are delayed by a random 0–120 ms before sending. This blunts timing correlation attacks that would otherwise reveal when a user reads or edits a specific message.

---

## Capture Deterrents

These are UI-layer features, not cryptographic guarantees. They make casual observation harder but do not prevent screenshots or screen recording.

**Window blur blackout:** A full-screen opaque overlay is applied whenever the browser window loses focus (tab switch, alt-tab, PrintScreen key event). Always active in the chat room; not configurable.

**Message blur-to-reveal:** Message bubbles are blurred by default when enabled. Hovering or touching a bubble reveals it temporarily. Persisted via `localStorage` key `qb-blur`. Applies to message text only.

**Removed:** The anti-capture strobe (a `@keyframes` CSS animation that flickered message text) was a deterrent that implied false protection. It did not prevent screenshots. It was removed. See `usage/anti-capture.md`.

---

## P2P Security

Files transferred over WebRTC data channels are encrypted at two layers:

1. **Double ratchet** — applied before the data enters the channel; same ciphertext used on the relay path
2. **DTLS** — WebRTC's mandatory transport encryption; provides a second independent layer

The server never sees the data channel traffic. Signaling (SDP/ICE) travels through the relay as opaque `SIGNALING` envelopes.

When ICE permanently fails (`directFailed: true`), the UI surfaces the failure. Media is never silently rerouted through the relay.

---

## Rate Limits (Anti-Abuse)

| Limit | Value | Scope |
|---|---|---|
| Session creation | 10/min | Per IP |
| General REST | 120/min | Per IP |
| WS connections | 50/min | Per IP |
| Message relay | 10/s | Per peer socket |
| All WS frames | 20/s | Per socket |
| Max peers | 10 | Per session |
| Max pending | 10 | Per session |
| Max sessions | 10,000 | Global |

IP-based limits are disabled when `TOR_MODE=true` (all traffic arrives from `127.0.0.1`). Per-session limits remain active.

---

## Session Ephemerality

No message, session, or peer state is persisted beyond the server process. There is no database. If the server restarts, all sessions are gone.

Three independent expiry conditions ensure sessions do not linger:
- Hard TTL (default 15 min, configurable up to 24 hr)
- 30-minute inactivity (no messages relayed)
- 5-minute empty session (no peers connected)
