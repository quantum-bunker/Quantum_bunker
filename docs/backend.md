# Backend

## Stack

| Component | Choice | Notes |
|---|---|---|
| Runtime | Node.js + TypeScript | Compiled via `tsx` in dev, `tsc` for prod |
| HTTP server | Express | REST API + Vite middleware |
| WebSocket | `ws` | Single `/ws` endpoint, all real-time traffic |
| Validation | Zod | Boundary-only; use cases receive typed objects |
| Logging | Winston | Structured JSON; never logs payload contents |
| DI | Manual constructor injection | Wired in `entrypoints/container.ts` |

---

## Startup Sequence

1. `server.ts` creates the Express app and HTTP server
2. `container.ts` constructs `InMemorySessionStore`, `EventEmitterBus`, `WsTransport`, use cases
3. Winston logger subscribes to `MessageRelayed`, `EnvelopeRejected`, `SessionExpired` events
4. Express mounts REST routes (`/api/sessions`, `/api/health`) and Vite dev middleware
5. `ws.Server` is attached to the HTTP server; `WsTransport` handles all socket events
6. `CleanupSessions` scheduler starts running every `CLEANUP_INTERVAL_MS` (60s)

---

## REST API

All routes are defined in `src/backend/adapters/http/`. Zod validates request bodies at the route handler; validated data is passed to use cases.

### `POST /api/sessions`

Creates a new session.

**Body:**
```json
{
  "name": "string (optional)",
  "expiresInSeconds": "number (optional)",
  "hostPublicKey": "string (optional, base64url Ed25519 — enables stateless whitelist)"
}
```

**Response `201`:**
```json
{
  "sessionId": "uuid",
  "name": "string | undefined",
  "expiresAt": "unix timestamp ms",
  "publicKey": "",
  "hostId": "uuid",
  "hostRecoveryToken": "uuid"
}
```

Rate limit: `SESSION_CREATE_PER_WINDOW` (10/min per IP).

### `GET /api/sessions/:id`

Returns public session metadata. Never exposes `hostId`, `hostRecoveryToken`, peer tokens, or peer list.

**Response `200`:**
```json
{
  "id": "uuid",
  "name": "string | undefined",
  "createdAt": "ms",
  "expiresAt": "ms",
  "status": "active | pending | expired | closed",
  "participantCount": "number",
  "maxPeers": 10
}
```

### `POST /api/sessions/:id/refresh`

Extends the session TTL. Only succeeds if at least one peer is present.

**Response `200`:** `{ expiresAt: ms }`

### `DELETE /api/sessions/:id`

Destroys the session. Requires `X-Host-Token` header matching `hostRecoveryToken`.

Closes all connected WebSockets and removes the session from memory immediately.

### `GET /api/health`

Returns `{ status: "ok" }`. Used by CI smoke tests and load balancer health checks.

---

## WebSocket Protocol (`/ws`)

All real-time communication goes through a single WebSocket endpoint. The transport layer:

1. Parses incoming frames as JSON
2. On `join`: authenticates the socket (peer token, host recovery token, or membership proof), assigns the socket to the session's peer map
3. On `RelayEnvelope`: delegates to `RelayMessage.execute()`
4. On `accept_join`/`reject_join`/`kick_peer`: delegates to `CreateSession` or session management use cases
5. Emits `PeerDisconnected` on socket close; starts `RECONNECT_GRACE_MS` timer before evicting the peer

### Socket Identity

After a successful `join`, the socket is **bound to its `peerId`**. Any subsequent `RelayEnvelope` with a `from` field that does not match the bound peer ID is rejected with `SENDER_MISMATCH`.

### Backpressure

If a destination socket's `bufferedAmount` exceeds `MAX_BUFFERED_BYTES` (24 MB), the relay drops the frame for that peer rather than queuing. An `EnvelopeRejected` event is emitted.

---

## Session State

Session state is held entirely in `InMemorySessionStore` (`Map<string, Session>`). No database. The shape is defined in `src/shared/contracts/v1/session.ts`.

Key fields on `Session`:
- `peers` — admitted peers (`Record<string, SessionPeer>`)
- `pendingPeers` — peers awaiting host approval
- `hostId`, `hostRecoveryToken` — host identity
- `hostPublicKey` — optional Ed25519 key enabling stateless whitelist
- `lastActivityAt` — updated on every relayed message
- `emptySince` — set when `participantCount` drops to 0

---

## Cleanup Logic

`CleanupSessions` runs every `CLEANUP_INTERVAL_MS` and evaluates three independent expiry conditions for each session:

| Condition | Threshold | Description |
|---|---|---|
| TTL expired | `session.expiresAt < now` | Session hit its hard expiry time |
| Inactivity | `now - lastActivityAt > INACTIVITY_TTL_MS` | No messages for 30 minutes |
| Empty | `emptySince !== null && now - emptySince > EMPTY_SESSION_TTL_MS` | No peers for 5 minutes |

When any condition is met, the session is destroyed: all sockets are closed and the session is deleted from the store.

---

## Rate Limiting

Two layers of rate limiting:

**IP-based (REST + WS connections):**
- Session creation: `SESSION_CREATE_PER_WINDOW` (10/min)
- General REST: `GENERAL_PER_WINDOW` (120/min)
- WS connections per IP: `CONN_PER_IP_LIMIT` (50/min)
- Disabled when `TOR_MODE=true` (all traffic arrives from `127.0.0.1`)

**Per-socket (WS frames):**
- Relay messages: `MSG_PER_SECOND_LIMIT` (10/s)
- All frame types: `SOCKET_MSG_PER_SECOND_LIMIT` (20/s)

---

## Replay Prevention

`RelayMessage` maintains a bounded nonce cache keyed by `sessionId:from:nonce`, each entry timestamped with the **server's** clock when first seen. Any envelope whose key is already present is rejected with `Duplicate nonce`. The cache is capped at `NONCE_CACHE_MAX` (50,000 entries) using a FIFO eviction strategy; `TIMESTAMP_TOLERANCE_MS` only sets the prune cutoff. The relay does **not** reject on the client's `timestamp` drift, since clients are not time-synchronized.

---

## Zero-Knowledge Guarantee

The `payload` field of `RelayEnvelope` is an opaque base64url string. Throughout the entire backend:
- No code reads, parses, or decodes `payload`
- No log statement includes `payload`
- `EnvelopeRejected` events redact `rawEnvelope.payload` before emission
- Zod schemas validate `payload` is a non-empty string only — no structure check

This is enforced by ADR-001 and tested in the security test suite.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `MAX_ACTIVE_SESSIONS` | `10000` | Global session cap |
| `REST_SESSION_CREATE_LIMIT` | `10` | Session creates per IP per minute |
| `REST_GENERAL_LIMIT` | `120` | General REST requests per IP per minute |
| `RELAY_CONN_PER_IP_LIMIT` | `50` | WS connections per IP per minute |
| `TOR_MODE` | `false` | Disables IP-based rate limiting for Tor deployments |
| `ONION_ADDRESS` | — | Adds `.onion` origin to CORS and CSP |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For` (needed behind nginx) |
| `NODE_ENV` | `development` | Controls Vite middleware vs. static serving |
