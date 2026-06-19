# CLAUDE.md — Quantum Bunker

## What This Project Is

**Quantum Bunker** is a zero-knowledge, ephemeral, real-time messaging vault. The server is a blind relay — it never decrypts, logs, or stores message payloads. Sessions are in-memory only and auto-expire. Clients handle all cryptographic meaning; the server only routes opaque envelopes.

Full-stack TypeScript monorepo: React 19 frontend + Express/ws backend, single port, shared domain contracts.

---

## Architecture in One Page

```
src/
├── shared/contracts/v1/        ← Single source of truth for all types/schemas
│   ├── envelope.ts             ← RelayEnvelope, EnvelopeType
│   ├── events.ts               ← DomainEvent<T> union types
│   ├── session.ts              ← Session, SessionPeer, SessionStatus
│   └── schemas.ts              ← Zod schemas (validate at boundaries only)
│
├── backend/                    ← Hexagonal / Ports-and-Adapters
│   ├── entrypoints/
│   │   └── container.ts        ← DI wiring — the only place adapters are constructed
│   ├── application/
│   │   ├── ports/              ← Interfaces only (no implementations)
│   │   │   ├── session-store.port.ts
│   │   │   ├── relay-transport.port.ts
│   │   │   └── event-bus.port.ts
│   │   └── use-cases/          ← Pure business logic, depend only on ports
│   │       ├── create-session.use-case.ts
│   │       ├── relay-message.use-case.ts
│   │       └── cleanup-sessions.use-case.ts
│   ├── adapters/               ← Concrete implementations of ports
│   │   ├── store/in-memory-session.store.ts
│   │   ├── transport/ws.transport.ts
│   │   ├── events/event-emitter.bus.ts
│   │   └── logging/winston.logger.ts
│   └── core/
│       ├── constants.ts        ← All numeric limits live here
│       └── policies/relay.policy.ts  ← Validation rules for envelopes
│
├── transport/                  ← Client-side WebRTC and call transport
│   ├── webrtc-mesh.ts          ← RTCPeerConnection mesh for P2P data channels
│   ├── call-connection.ts      ← 1-on-1 call lifecycle (audio/video)
│   ├── ice-config.ts           ← STUN/TURN config
│   └── p2p-policy.ts           ← P2P state machine and reducer
│
├── crypto/                     ← Client-side cryptographic primitives
│   └── message-padding.ts      ← Plaintext padding to fixed buckets (mirrors PADDING in constants.ts)
│
├── App.tsx                     ← Root UI: home view + chat view
├── useSession.ts               ← Session lifecycle hook (create/join/refresh/destroy)
├── useRelay.ts                 ← WebSocket hook (connect/send/receive/receipts)
├── useP2P.ts                   ← WebRTC mesh hook (P2P data channels, signaling)
├── useCall.ts                  ← 1-on-1 voice/video call hook
├── useIdentity.ts              ← Long-term key pair management
├── useContacts.ts              ← Trusted contacts management
├── useContactVerification.ts   ← Safety number / fingerprint verification
├── useMembership.ts            ← Whitelist token wallet
└── index.css                   ← Tailwind base

server.ts                       ← Express + Vite middleware + WS + cleanup scheduler
```

**Dependency rule:** `core → application → adapters → entrypoints`. Nothing flows upstream.

---

## Coding Standards

### TypeScript
- Strict mode always (`"strict": true` in tsconfig)
- No `any` — use `unknown` with a type guard if the shape is truly unknown
- Prefer `type` over `interface` for object shapes; use `interface` only when extension is intentional
- Exhaustive `switch` on discriminated unions — add a `default: assertNever(x)` guard
- No implicit returns in functions with meaningful return types

### Files & Modules
- One concept per file — use cases, ports, adapters are never bundled together
- File names: `kebab-case.ts`, never PascalCase for files
- Barrel files (`index.ts`) only where there are ≥3 exports from the same logical group
- Max ~200 lines per file; if longer, split by responsibility

### Functions
- Pure functions for all use-case logic (no side effects in use cases — emit events instead)
- Async functions return `Promise<T>`, never `Promise<any>`
- Guard clauses first, happy path last
- No functions longer than ~40 lines; extract named helpers

### Comments
- Write zero comments by default
- Only comment when the **why** is non-obvious: a hidden constraint, a policy choice, a protocol quirk
- Never comment what the code does — name it well instead

### Error Handling
- Use cases throw typed errors with a `code` field (e.g., `SESSION_NOT_FOUND`, `PEER_LIMIT_REACHED`)
- Transport adapters catch and translate to WS error frames or HTTP status codes
- Never swallow errors silently — at minimum, emit an `EnvelopeRejected` event

### React / Frontend
- Functional components only, no class components
- Custom hooks own all side effects; components stay declarative
- State that persists across hard refreshes → `sessionStorage` (session) or `localStorage` (preferences)
- No global state library — hooks pass data via props or context where needed
- Tailwind only — no inline `style={}` unless strictly dynamic (e.g., animation values)

---

## Domain Rules — Never Break These

1. **Zero-knowledge invariant**: The server MUST NOT log, inspect, or store `envelope.payload` contents. It is an opaque base64url blob. Log only metadata (type, byteSize, from, sessionId).

2. **Envelope contract is frozen**: Fields in `RelayEnvelope` are add-only. Removing or renaming a field is a breaking change requiring a new contract version (`v2/`). See ADR-003.

3. **Use cases own policy**: Rate limits, TTL logic, peer limits — all live in use cases or `relay.policy.ts`, never in adapters.

4. **Host authority**: Only the peer with `isHost: true` may accept/reject joins, kick peers, or destroy sessions. The server enforces this — it is not a UI-only guard.

5. **Nonce deduplication**: The frontend deduplicates messages by nonce. Never strip or regenerate nonces server-side.

6. **Session state is ephemeral**: No database. If the server restarts, all sessions are gone. This is a feature, not a bug.

7. **P2P media has no relay fallback**: When a WebRTC direct channel fails (`directFailed: true`), the UI must surface the failure. Never silently reroute media through the relay.

8. **Calls are 1-on-1 only**: `useCall` only operates when exactly one other peer is in the session. Group video conferencing is intentionally not offered.

9. **Padding is client-only**: The server MUST NOT pad payloads. Clients pad plaintext to fixed buckets before encryption. `PADDING.BUCKETS` in `constants.ts` is the source of truth; `src/crypto/message-padding.ts` mirrors it.

---

## All Features — Current State

### Session Lifecycle
- Create vault: POST `/api/sessions` → returns `{id, hostId, hostRecoveryToken, expiresAt}`
- Join vault: WebSocket `join` message → status `joined` (if host) or `pending` (awaiting approval)
- Host approves/rejects: `accept_join` / `reject_join` WS messages
- Refresh TTL: POST `/api/sessions/:id/refresh` (auto-called when TTL < 2 min)
- Destroy vault: DELETE `/api/sessions/:id` (requires `hostRecoveryToken`)
- Auto-cleanup: every 60s — expired TTL, 30min inactivity, 5min empty

### Messaging
- Send: `RelayEnvelope` over WebSocket → server fans out to all other peers
- Types: `PLAINTEXT` (refused by relay), `NOISE_MESSAGE`, `SIGNALING`, `PING`/`PONG`, `ACK`, `READ`, `EDIT`, `DELETE`, `FILE`
- ACK receipts: server sends `ACK` back to sender on relay
- Read receipts: peer sends `READ` envelope with original nonce
- Edit/delete: `EDIT` carries encrypted `{target, text}`; `DELETE` carries target nonce. Both author-bound; applied client-side
- Auto-disappear: messages vanish client-side after 5 minutes
- Rate limit: 10 messages/second per peer; 50 connections/minute per IP

### File Transfer (Relay — up to 5 MB)
- `FILE` envelope carries an encrypted `FileAttachment` (base64 blob + metadata) over the double-ratchet path
- Client-enforced size cap: `MAX_FILE_BYTES` (5 MB) before encryption
- Voice messages: `audio/webm` with `echoCancellation`/`noiseSuppression`/`autoGainControl`
- Video files render in a `<video>` player
- `sendFile` refuses to relay unless the E2E channel manager exists — no plaintext fallback
- Optional password layer: PBKDF2-SHA256 (210k iters) + AES-GCM or ChaCha20-Poly1305 before the ratchet
- See `src/file-crypto.ts`, `src/file-transfer.ts`, `src/voice-record.ts`

### File Transfer (P2P — up to 256 MB)
- Large files stream over WebRTC data channels, bypassing the relay entirely
- Chunked at `FILE_CHUNK_BYTES` (64 KB); each chunk is AEAD-sealed independently
- Double-ratchet encryption applied before the data channel (DTLS is defense-in-depth, not the only layer)
- Backpressure-aware: sender reads `bufferedAmount` from `useP2P` and throttles
- See `src/file-transfer.ts`, `src/useP2P.ts`, `src/transport/webrtc-mesh.ts`

### Voice/Video Calls (1-on-1 only)
- Available only when the session has exactly one other peer (not offered in groups)
- Signaling via `SIGNALING` envelopes with `kind: 'call'` — relay is blind to the content
- Media: 1280×720 @ 30fps, `echoCancellation`/`noiseSuppression`/`autoGainControl`
- States: `idle → calling → ringing → connecting → active`
- See `src/useCall.ts`, `src/transport/call-connection.ts`

### Traffic Analysis Hardening
- Clients pad plaintext to fixed size buckets **before** encryption: 8 KB / 64 KB / 512 KB / 4 MB
- Non-interactive frames (receipts, edits, deletes) add 0–120 ms random jitter before relay
- The server never pads or delays — it is a blind forwarder
- Frontend: `src/crypto/message-padding.ts`; buckets are sourced from `PADDING.BUCKETS` in `constants.ts`

### Message Search
- Client-side real-time keyword filter + highlight (`src/message-search.ts`)
- Case-insensitive; highlights matched text in amber; no submit button

### Access Control
- Peer limit: 10 per session
- Host recovery: UUID token to re-claim host on reconnect
- Host kick: `kick_peer` WS message removes a peer
- Group mode: automatically enabled when >2 peers join
- Peer token: per-session secret issued at admission; required to re-claim a `peerId`
- Stateless whitelist: host issues Ed25519-signed membership token; member presents token + joinProof on `join` and is auto-admitted. See `src/shared/membership.ts`
- In-chat mutual whitelist: peers exchange keys via `SIGNALING` frames (`kind: 'wl-id' | 'wl-state' | 'whitelist'`); both must accept. Mutual iff each has pinned the other

### Identity
- Long-term key pair: Ed25519, passphrase-protected (PBKDF2-SHA256), persisted in `localStorage`
- Burner key: generated per-session if no long-term identity exists
- Key fingerprint: 32-byte hex displayed in the UI
- See `src/useIdentity.ts`

### Contact Verification
- Safety numbers derived from Noise Protocol key exchange
- Out-of-band comparison to detect MITM
- Key-change alert: full-screen red overlay blocks messaging until re-verified or pin cleared
- See `src/useContactVerification.ts`, `src/contact-verification.ts`

### Session Persistence (Client)
- Active session: `sessionStorage` (survives page refresh, not tab close)
- Saved vaults: `localStorage` (reconnect history, recovery tokens)
- Theme preference: `localStorage` (`qb-theme`)
- Message blur preference: `localStorage` (`qb-blur`)
- Long-term identity: `localStorage` (encrypted)

### Security / Privacy UI
- Window blur blackout: chat obscured when app loses focus — always on in chat, no toggle
- Message blur-to-reveal: hover/touch to read, persisted via `qb-blur` in `localStorage`
- Session decay countdown timer
- Copy vault hash button
- Anti-capture strobe was removed — see `usage/anti-capture.md`

### Themes
- **Cyberpunk** (default): neon cyan/orange on dark, `font-mono`, high-contrast
- **Halo**: military/tactical aesthetic
- **Classic**: clean, minimal
- Persisted in `localStorage` under `qb-theme`

### Logging & Observability
- Winston structured logger (backend)
- Domain events emitted on every state change — `payload` field is never logged (zero-knowledge)
- Frontend: real-time event log panel, IO load indicator, latency display

---

## Limits Reference (`src/backend/core/constants.ts`)

| Constant | Value | Notes |
|---|---|---|
| `SESSION_LIMITS.MAX_PEERS` | 10 | Per session |
| `SESSION_LIMITS.DEFAULT_TTL_MS` | 15 min | Session expiry |
| `SESSION_LIMITS.MAX_TTL_MS` | 24 hr | Maximum TTL |
| `SESSION_LIMITS.RECONNECT_GRACE_MS` | 30 s | Grace window for reconnects |
| `SESSION_LIMITS.INACTIVITY_TTL_MS` | 30 min | Expiry on no activity |
| `SESSION_LIMITS.EMPTY_SESSION_TTL_MS` | 5 min | Expiry when no peers present |
| `SESSION_LIMITS.MAX_PENDING_PEERS` | 10 | Pending join queue cap |
| `SESSION_LIMITS.MAX_ACTIVE_SESSIONS` | 10,000 | Global cap (env `MAX_ACTIVE_SESSIONS`) |
| `RELAY_LIMITS.MAX_PAYLOAD_BYTES` | 16 MB | Relay envelope payload cap |
| `RELAY_LIMITS.MAX_FILE_BYTES` | 5 MB | Per-file via relay (pre-encryption) |
| `RELAY_LIMITS.MAX_P2P_FILE_BYTES` | 256 MB | Per-file via P2P data channel |
| `RELAY_LIMITS.FILE_CHUNK_BYTES` | 64 KB | P2P streaming chunk size |
| `RELAY_LIMITS.WS_MAX_FRAME_BYTES` | 16 MB + 64 KB | WS frame size limit |
| `RELAY_LIMITS.TIMESTAMP_TOLERANCE_MS` | 60 s | Nonce-cache prune cutoff only — relay does NOT reject on client clock drift |
| `RELAY_LIMITS.MSG_PER_SECOND_LIMIT` | 10 | Per peer message rate |
| `RELAY_LIMITS.SOCKET_MSG_PER_SECOND_LIMIT` | 20 | All WS frame types per socket |
| `RELAY_LIMITS.CONN_PER_IP_LIMIT` | 50 | Connections per IP per window (env `RELAY_CONN_PER_IP_LIMIT`) |
| `RELAY_LIMITS.CONN_WINDOW_MS` | 60 s | Rate limiting window |
| `RELAY_LIMITS.JOIN_TIMEOUT_MS` | 10 s | Socket must join within this or be dropped |
| `RELAY_LIMITS.MAX_BUFFERED_BYTES` | 24 MB | Per-socket backpressure cutoff |
| `RELAY_LIMITS.NONCE_CACHE_MAX` | 50,000 | Server-side replay dedup cache |
| `PADDING.BUCKETS` | 8 KB / 64 KB / 512 KB / 4 MB | Client plaintext padding tiers |
| `PADDING.TIMING_JITTER_MAX_MS` | 120 ms | Max random delay on non-interactive frames |
| `REST_LIMITS.SESSION_CREATE_PER_WINDOW` | 10/min | Per IP (env `REST_SESSION_CREATE_LIMIT`) |
| `REST_LIMITS.GENERAL_PER_WINDOW` | 120/min | Per IP (env `REST_GENERAL_LIMIT`) |
| `CLEANUP_INTERVAL_MS` | 60 s | Cleanup sweep interval |

---

## HTTP API

```
POST   /api/sessions               Create session (optional hostPublicKey enables whitelist)
GET    /api/sessions/:id           Get public metadata only (never tokens, hostId, or peers)
POST   /api/sessions/:id/refresh   Extend TTL (requires active participants)
DELETE /api/sessions/:id           Destroy (X-Host-Token header)
GET    /api/health                 Health check
```

---

## WebSocket Protocol (`/ws`)

**Client → Server:**
```
join             { sessionId, peerId, message?, hostRecoveryToken?, peerToken?,
                   membershipToken?, joinProof? }
accept_join      { sessionId, targetPeerId }                  [host only]
reject_join      { sessionId, targetPeerId }                  [host only]
kick_peer        { sessionId, targetPeerId }                  [host only]
<RelayEnvelope>  Any envelope type for relay (PLAINTEXT refused)
```

**Server → Client:**
```
joined           { sessionId, peerId, isHost?, peerToken, viaMembership? }
pending          { sessionId }
peer_update      { peers: SessionPeer[] }
join_request     { peerId, message }                          [host only]
error            { code, message }
<RelayEnvelope>  Relayed message from another peer
```

**SIGNALING sub-kinds (client-to-client, server is blind):**
```
rtc-offer / rtc-answer / ice-candidate    WebRTC mesh signaling
call / call-accept / call-decline / call-end   Voice/video call signaling
wl-id / wl-state / whitelist              In-chat mutual whitelist
```

---

## Domain Events

All events are `DomainEvent<T>` with `{ type, sessionId, occurredAt, payload }`:

| Event | Payload |
|---|---|
| `SessionCreated` | `{ expiresAt }` |
| `PeerJoined` | `{ peerId }` |
| `PeerDisconnected` | `{ peerId }` |
| `MessageRelayed` | `{ envelopeType, byteSize, from }` |
| `SessionExpired` | `{ reason, lastActivityAt }` |
| `SessionClosed` | `{}` |
| `EnvelopeRejected` | `{ reason, rawEnvelope }` — `rawEnvelope.payload` always redacted |

---

## Quick Decision Tree — Common Operations

### Adding a feature
1. Changes wire protocol? → `shared/contracts/v1/` first (or `v2/` if breaking), commit before any code
2. Adds a numeric limit? → `constants.ts` only, never inline
3. Adds business logic? → New use case in `application/use-cases/`; never modify an existing one
4. Needs new I/O? → New adapter in `adapters/`, wire only in `container.ts`
5. Crosses architectural boundaries in a new way? → Write an ADR first
6. Adds a new WS message type? → Update `ws.transport.ts` AND `useRelay.ts` AND `events.md`
7. Adds UI? → New hook or component; zero business logic in components

### Debugging a relay issue
- Message not arriving → check `relay.policy.ts` validation and `RelayMessage.isReplay()`
- Peer not receiving → check `session.peers` membership and socket registration in WS transport
- Session expired prematurely → check all three cleanup conditions: TTL, inactivity (30 min), empty (5 min)
- Envelope rejected → look for `EnvelopeRejected` event; `rawEnvelope.payload` is always redacted

### Adding a storage key
- Session-scoped (survives refresh, clears on tab close) → `sessionStorage`
- User preference / cross-session state → `localStorage`
- Never use a database, Redis, or file

### Working with P2P / calls
- All signaling flows through the relay as opaque `SIGNALING` envelopes
- `sendDirect` returns `false` if no open channel — handle it; no silent relay fallback for media
- Calls are 1-on-1 only; do not offer call UI when `peers.length > 1`

---

## Testing

**Run all:** `npm test`
**Watch:** `npm run test:watch`
**UI:** `npm run test:ui`

### Test Layout
```
tests/
├── unit/           ← Use-case logic, schema validation (no I/O)
├── integration/    ← REST API (Supertest) + WS transport (real ws client)
├── e2e/            ← Full relay flow, two peers messaging
├── smoke/          ← Server boots, health endpoint responds
├── load/           ← Concurrent sessions/messages under expected load
└── stress/         ← Beyond limits, verify graceful degradation
```

### Rules
- Unit tests: mock ports, never real adapters
- Integration tests: real in-memory store, real Express, real WebSocket
- No mocking the database — there is no database; use the real in-memory store
- Each test file covers exactly one use case or adapter
- Test file names mirror source: `relay-message.use-case.ts` → `relay-message.test.ts`

---

## Git Workflow

```
main      ← production, protected, no direct commits
staging   ← pre-prod, merged from develop before release
develop   ← active development, branch from here
feature/* ← one feature per branch, PR into develop
```

- PR title: `feat:`, `fix:`, `refactor:`, `test:`, `docs:` prefix
- Squash merge into develop; merge commit into staging/main
- Never force-push main or staging

---

## Adding a Feature — Checklist

1. Does it change the envelope contract? → Update `shared/contracts/v1/` or create `v2/` and write an ADR
2. Does it add business logic? → New use case in `application/use-cases/`, with a port if it needs I/O
3. Does it add a new I/O mechanism? → New adapter in `adapters/`, register in `container.ts`
4. Does it add a new limit? → Add constant to `constants.ts` only
5. Does it change the WS protocol? → Update `events.md` and `ws.transport.ts`
6. Does it add UI? → New hook or component; no business logic in components
7. Write unit tests for use case, integration test for adapter
8. Update relevant doc file in `docs/` if behavior changes

---

## How Claude Should Behave in This Project

- Follow the hexagonal boundary strictly — never let adapters leak into use cases
- Always look up the type in `shared/contracts/v1/` before creating a new one
- All numeric limits come from `constants.ts` — never write a magic number
- When adding a WS message type, handle it in both `ws.transport.ts` (server) and `useRelay.ts` (client)
- When touching session logic, verify against all three cleanup conditions — TTL, inactivity, empty
- Prefer emitting a domain event over adding a log statement; the event bus logs automatically
- Do not add persistence (Redis, DB, file) unless explicitly requested — ephemerality is the design
- Do not add authentication (JWT, OAuth) — the host recovery token IS the auth mechanism
- Run `npm run lint` (tsc --noEmit) before declaring any backend change complete
- The frontend has no build step in dev — Vite serves it via Express middleware on port 3000
- P2P data channels are double-ratchet encrypted before DTLS — never remove either layer
- Keep `PADDING.BUCKETS` in `constants.ts` and `src/crypto/message-padding.ts` in sync

---

## Key Files Quick Reference

| What you need | Where to look |
|---|---|
| All type definitions | `src/shared/contracts/v1/` |
| All numeric limits | `src/backend/core/constants.ts` |
| Session business logic | `src/backend/application/use-cases/` |
| WS message handling (server) | `src/backend/adapters/transport/ws.transport.ts` |
| WS message handling (client) | `src/useRelay.ts` |
| Session REST + UI state | `src/useSession.ts` |
| DI wiring | `src/backend/entrypoints/container.ts` |
| Envelope validation rules | `src/backend/core/policies/relay.policy.ts` |
| Server entry point | `server.ts` |
| UI root | `src/App.tsx` |
| WebRTC mesh + P2P data channels | `src/transport/webrtc-mesh.ts`, `src/useP2P.ts` |
| Voice/video calls | `src/useCall.ts`, `src/transport/call-connection.ts` |
| Identity / key management | `src/useIdentity.ts` |
| Contact verification | `src/useContactVerification.ts`, `src/contact-verification.ts` |
| Whitelist / membership | `src/useMembership.ts`, `src/membership-store.ts`, `src/shared/membership.ts` |
| File transfer (relay path) | `src/file-transfer.ts` |
| File crypto (password layer) | `src/file-crypto.ts` |
| Voice recording | `src/voice-record.ts` |
| Message search | `src/message-search.ts` |
| Traffic analysis hardening | `src/crypto/message-padding.ts`, `PADDING` in `constants.ts` |
| Contacts store | `src/contacts-store.ts` |
