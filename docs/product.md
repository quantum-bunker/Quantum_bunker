# Product: Quantum Bunker

## What It Is

Quantum Bunker is a **zero-knowledge ephemeral messaging vault**. It is designed for situations where users need to communicate securely without trusting the infrastructure — no accounts, no logs, no stored messages.

Sessions exist only in server memory. When a session expires or is destroyed, all message history is gone. This is intentional.

---

## Core Concepts

**Vault (Session)**
A temporary chat room identified by a UUID hash. Created by a host, joined by peers. Has a configurable TTL (default 15 minutes). All message history lives in the clients' browsers — the server never stores content.

**Vault Hash ID**
The session UUID. This is the only credential needed to attempt to join a session. Hosts share it with intended peers.

**Host**
The peer who created the vault. Has exclusive authority to: approve/reject join requests, kick peers, and destroy the session. Host identity is backed by a cryptographic recovery token stored in the browser.

**Peer**
Any participant in a vault. Identified by a `peerId` string. Peers hold a `peerToken` that lets them reclaim their identity after a page refresh.

**Relay Envelope**
The wire format for all messages. An opaque `payload` field carries the double-ratchet ciphertext. The server routes envelopes by `sessionId` and `from` fields without reading the payload.

---

## User Roles

| Role | Can do |
|---|---|
| Host | All peer actions + accept/reject joins, kick, destroy session, issue whitelist tokens |
| Member | Send/receive messages, files, calls; share vault link; search messages |

Group mode (>2 peers) is enabled automatically. The host can remove any peer from the session.

---

## Session Lifecycle

```
Host creates vault
      │
      ▼
Host shares vault hash (QR code or link)
      │
      ▼
Peer sends join request
      │
      ▼
Host approves (or member auto-admitted via whitelist)
      │
      ▼
Active session — encrypted messaging
      │
      ├── Peer disconnects → RECONNECT_GRACE_MS (30s) before eviction
      ├── Host destroys vault → immediate close for all peers
      ├── TTL expires → session closed
      ├── 30 min no messages → inactivity expiry
      └── 5 min no peers connected → empty-session expiry
```

Sessions auto-refresh their TTL when the client detects < 2 minutes remaining (POST `/api/sessions/:id/refresh`).

---

## Feature Matrix

| Feature | Status |
|---|---|
| Ephemeral encrypted messaging | Active |
| File sharing via relay (≤ 5 MB) | Active |
| File sharing via P2P (≤ 256 MB) | Active |
| Voice messages | Active |
| Video messages | Active (inline player) |
| Password-protected files | Active |
| 1-on-1 voice/video calls | Active (1-on-1 sessions only) |
| Message edit / delete | Active (author-bound, client-side) |
| Read receipts | Active |
| Message search | Active (client-side, real-time) |
| Message auto-disappear | Active (5 min client-side) |
| Long-term identity | Active |
| Contact verification (safety numbers) | Active |
| Stateless whitelist | Active |
| In-chat mutual whitelist | Active |
| Trust handshake (QR / link) | Active |
| QR code vault sharing | Active |
| Vault history (reconnect) | Active |
| Window blur blackout | Active |
| Message blur-to-reveal | Active |
| Traffic analysis hardening | Active (padding + timing jitter) |
| Multi-theme UI | Active (Cyberpunk / Halo / Classic) |
| Tor hidden service support | Supported via `TOR_MODE` |
| Anti-capture strobe | Removed — see `usage/anti-capture.md` |
| Group video conferencing | Out of scope by design |
| Server-side message search | Impossible by design (zero-knowledge) |
| Message history after session expiry | Impossible by design (ephemeral) |

---

## Privacy Guarantees

What the server **can** observe:
- Who connected to which session (IP address, `peerId`, timing)
- Message envelope metadata: `type`, `byteSize`, `from`, `sessionId`, `timestamp`
- How many peers are in a session

What the server **cannot** observe (by design):
- Message content (payload is opaque ciphertext)
- File content
- Who is talking to whom (peer IDs are client-generated, not tied to accounts)

What the server **does not retain**:
- Anything — sessions are in-memory only; no logs of content or peer identity

---

## What Quantum Bunker Is Not

- **Not a persistent messenger.** There is no message history after a session expires.
- **Not a file storage service.** Files live in browser memory for the session duration.
- **Not an anonymity network.** The server sees your IP. Use Tor mode for IP anonymity.
- **Not a group video conferencing tool.** Calls are 1-on-1 by design.
- **Not an account-based service.** There are no accounts, passwords, or user profiles.
