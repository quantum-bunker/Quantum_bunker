# ADR-007 — Direct Mode: Client-Derived Pair Vaults

**Status:** Accepted
**Date:** 2026-09-17

---

## Context

Quantum Bunker only supports encounters. A vault is created, a link is shared, and when it expires the session, the trust, and the messages are all gone. There is no way to reach a specific person again later.

This is not an accident of the UI — it is baked into every credential in the system. `MembershipToken.claims.sid`, the `qb-membership-tokens` wallet, and the `contactKey(sessionId, peerId)` verification pins are each bound to a single vault id, so a relationship cannot outlive the vault it was formed in. `qb-saved-sessions` remembers vaults, not people.

Direct mode adds persistent 1-on-1 links between people who have added each other by a permanent personal code. The constraint is that this must not give the relay any new knowledge, any persistence, or any notion of a user account.

---

## Decision

### 1. A pair meets in a vault whose id both sides derive

On accepting a contact request, the two peers agree a random 32-byte `pairSecret`. The vault they meet in is:

```
pairVaultId = uuidFromBytes(sha256("qb-pair-v1" | pairSecret))
```

Whichever peer opens the app first creates that vault; the other joins it. The relay stores nothing about the pair — it sees an ordinary ephemeral vault with an ordinary opaque id, reaped by the ordinary cleanup rules.

The id is derived from a shared secret rather than from the two public keys, so knowing both people's codes is not enough to locate or occupy their vault.

### 2. The id must be shaped as a UUID

`RelayEnvelopeSchema.sessionId` is `z.string().uuid()`. A derived id is 16 hash bytes with the RFC 4122 version and variant bits set, so it validates as a v4 UUID. Without this every envelope in a direct chat would be rejected at the boundary.

This costs 6 bits of the 128-bit digest. 122 bits is far beyond any brute-force reach, and the id is not the security boundary in any case — admission is.

### 3. `POST /api/sessions` becomes idempotent on a supplied id, and withholds host credentials

`CreateSessionRequest` gains optional `id` and `maxPeers`. When `id` names a session that already exists, the route returns `200` with `{ sessionId, expiresAt, existing: true }` and **omits `hostId` and `hostRecoveryToken`**.

This is the security-critical rule of the whole feature. Returning the existing session's recovery token would hand host authority over any vault to anyone who guesses — or observes — its id, defeating the host-authority rule for every vault in the system, not just direct ones.

The idempotency decision lives in `create-session.use-case.ts`, not in the route or the store, per the rule that use cases own policy.

### 4. Admission uses the existing membership mechanism

At accept time each side issues the other a `MembershipToken` bound to the derived `sid` and signed with its own host key. Whichever peer creates the vault sets `hostPublicKey` to its own key; the other presents the token that creator issued. The arrangement is symmetric, so it works whichever side arrives first.

No new server crypto, and no new authentication mechanism — this is the whitelist flow that already exists, pointed at a vault id both parties knew in advance.

### 5. Everything else is client-side

Contacts, presence, queued messages, retention and unread state live in the browser (`localStorage` for the relationship, `sessionStorage` for the queue). The server gains no new state, no new persistence, and no knowledge of who is talking to whom.

---

## Consequences

**Positive:**
- A relationship outlives the vault it was formed in, without a database or an account system.
- Verification can survive across vaults: a known peer's Noise static key is pinned to the person, not to `(sessionId, peerId)`.
- The blind-relay invariant is untouched. The server still only ever sees opaque vault ids and opaque envelopes.
- Fixing the derived vault's peer identity to a stable `directPeerId` avoids the ghost-peer capacity problem that a fresh random id per connection would cause.

**Negative — a genuine new metadata exposure:**

A pair vault id is stable for the life of the relationship. Today's vaults are one-shot, so the relay sees an identifier once and never again. A direct pair produces a **recurring opaque identifier** that lets the relay observe that the same two endpoints meet repeatedly over weeks, and correlate their online patterns — even though it still cannot tell who they are or read anything they say.

This is a real reduction in metadata resistance relative to the ephemeral flow, and it is the price of persistence. It is stated here, in `docs/security.md`, and in the product docs rather than glossed over.

The mitigation is to epoch-rotate the pair vault the way the inbox vault already rotates (`DIRECT_LIMITS.INBOX_EPOCH_MS`). That is deferred, not dismissed, because rotation introduces a boundary-miss problem: each side camps on one id at a time, so a rollover that the two peers cross at different moments silently splits them into two vaults. Solving that needs overlapping camp windows on both ids, which is worth doing on its own rather than smuggling into this change.

**Negative — other:**
- The inbox vault id is derived from a public key alone, so anyone holding someone's code can open a vault addressed to them. That is the point of a knock address, but it means an unsolicited knock costs the recipient a vault. Daily epoch rotation bounds the correlation window; the peer cap and per-IP create limits bound the volume.
- Presence costs one idle socket per known person. `DIRECT_LIMITS.MAX_KNOWN_PEERS = 15` is what keeps that inside `CONN_PER_IP_LIMIT`.

**Binding rule:** the additions to `CreateSessionRequest`, `CreateSessionResponse` and `SessionPeer` are additive optional fields, permitted under ADR-003 without a `v2/` contract directory. The `existing: true` response MUST NOT carry `hostId` or `hostRecoveryToken`; the integration test asserting this is a required regression guard.
