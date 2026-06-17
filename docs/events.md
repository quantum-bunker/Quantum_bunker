# Events & Protocol

## Domain Events

Use cases emit typed `DomainEvent<T>` objects via `IEventBus`. Infrastructure adapters subscribe to log, metric, or act on them. No use case imports a logger or metrics client directly.

All events have the base shape:
```typescript
interface DomainEvent<T> {
  type: DomainEventType;
  sessionId: string;
  occurredAt: number;      // Unix timestamp ms
  payload: T;
}
```

### Event Catalog

| Event | Payload type | Emitted when |
|---|---|---|
| `SessionCreated` | `{ expiresAt: number }` | A new session is successfully created |
| `PeerJoined` | `{ peerId: string }` | A peer completes the join handshake |
| `PeerDisconnected` | `{ peerId: string }` | A peer's WebSocket closes |
| `MessageRelayed` | `{ envelopeType, byteSize, from }` | An envelope is successfully fanned out |
| `SessionExpired` | `{ reason, lastActivityAt }` | Cleanup evicts an expired session |
| `SessionClosed` | `{}` | Host explicitly destroys the session |
| `EnvelopeRejected` | `{ reason, rawEnvelope }` | Any validation failure on an incoming envelope |

**Zero-knowledge rule:** `EnvelopeRejected.rawEnvelope.payload` is always redacted (replaced with `[REDACTED]`) before emission. No subscriber ever sees payload content.

---

## WebSocket Messages

### Client → Server

#### `join`
```typescript
{
  sessionId: string;
  peerId: string;
  message?: string;           // Display name / greeting shown to host
  hostRecoveryToken?: string; // Re-claim host authority after reconnect
  peerToken?: string;         // Re-claim peer identity after reconnect
  membershipToken?: string;   // Stateless whitelist: host-signed admission token
  joinProof?: string;         // Stateless whitelist: member-signed possession proof
}
```
Sent immediately after the WebSocket opens. The server authenticates the socket and binds it to the peer identity.

Authentication precedence:
1. `hostRecoveryToken` present and valid → socket is bound as host
2. `peerToken` present and valid → socket reclaims existing peer identity
3. `membershipToken` + `joinProof` present and valid → auto-admitted as member (`viaMembership: true`)
4. No token → peer enters `pendingPeers`, awaiting host approval

#### `accept_join` / `reject_join`
```typescript
{ sessionId: string; targetPeerId: string; }
```
Host-only. Moves a peer from `pendingPeers` to `peers` (accept) or drops them (reject).

#### `kick_peer`
```typescript
{ sessionId: string; targetPeerId: string; }
```
Host-only. Immediately closes the target peer's socket and removes them from the session.

#### `RelayEnvelope` (any relay message type)
```typescript
{
  sessionId: string;
  from: string;         // Must match the socket's authenticated peerId
  type: EnvelopeType;
  timestamp: number;
  nonce: string;
  payload: string;      // Opaque base64url ciphertext
}
```
`PLAINTEXT` type is refused by the relay. All others are forwarded to peers in the session.

---

### Server → Client

#### `joined`
```typescript
{
  sessionId: string;
  peerId: string;
  isHost?: boolean;
  peerToken: string;        // Save this to reclaim identity on reconnect
  viaMembership?: boolean;  // True if admitted via stateless whitelist
}
```

#### `pending`
```typescript
{ sessionId: string; }
```
Sent to a joining peer who is awaiting host approval.

#### `peer_update`
```typescript
{ peers: SessionPeer[] }
```
Broadcast to all peers whenever the peer list changes (join, disconnect, kick).

#### `join_request`
```typescript
{ peerId: string; message: string; }
```
Sent only to the host when a peer enters the pending queue.

#### `error`
```typescript
{ code: string; message: string; }
```

**Error codes:**
| Code | Meaning |
|---|---|
| `SESSION_NOT_FOUND` | No session with that ID exists |
| `SESSION_EXPIRED` | Session has already expired |
| `PEER_LIMIT_REACHED` | Session is at `MAX_PEERS` |
| `SENDER_MISMATCH` | Envelope `from` does not match authenticated socket identity |
| `DUPLICATE_NONCE` | Replay attempt detected |
| `INVALID_MEMBERSHIP` | Stateless whitelist proof failed verification |
| `RATE_LIMIT_EXCEEDED` | Too many messages or connections |
| `PAYLOAD_TOO_LARGE` | Envelope exceeds `MAX_PAYLOAD_BYTES` |
| `JOIN_TIMEOUT` | Socket did not send `join` within `JOIN_TIMEOUT_MS` |

---

## SIGNALING Envelope Sub-Kinds

`SIGNALING` envelopes carry client-to-client signaling. The server forwards them opaquely. The `payload` is a base64url-encoded JSON object with a `kind` discriminator:

### WebRTC (P2P data channels)
```
kind: 'rtc-offer'        SDP offer from initiating peer
kind: 'rtc-answer'       SDP answer from responding peer
kind: 'ice-candidate'    ICE candidate from either peer
kind: 'rtc-hangup'       Peer is closing the data channel connection
```

### Voice/Video Calls
```
kind: 'call'             Outbound call invite (contains SDP offer)
kind: 'call-accept'      Callee accepts (contains SDP answer)
kind: 'call-decline'     Callee declines
kind: 'call-end'         Either party ends an active call
```

### In-Chat Mutual Whitelist
```
kind: 'wl-id'            Peer broadcasts their public key identity
kind: 'wl-state'         Peer shares current whitelist state snapshot
kind: 'whitelist'        Peer sends a whitelist request/acceptance to a specific peer
```

The server has zero knowledge of these sub-kinds. It routes the `SIGNALING` envelope by `sessionId` without inspecting the payload.

---

## Join Authentication Detail

```
Socket connects to /ws
  │
  ▼
Server awaits 'join' within JOIN_TIMEOUT_MS (10s)
  │            │
  │  no join   └── Socket is closed with JOIN_TIMEOUT error
  │
  ▼
Server checks tokens in this order:
  1. hostRecoveryToken valid → bound as host, responds 'joined' with isHost: true
  2. peerToken valid        → bound as existing peer, responds 'joined'
  3. membershipToken + joinProof valid → auto-admitted, responds 'joined' with viaMembership: true
  4. None                   → enters pendingPeers, host receives 'join_request', peer receives 'pending'
```

After admission, the socket is permanently bound to its `peerId`. Any relay envelope with a `from` field that does not match the bound ID is rejected with `SENDER_MISMATCH`.

---

## Stateless Whitelist Protocol

```
Host:
  1. POST /api/sessions with hostPublicKey (Ed25519, base64url)
  2. Issue MembershipToken: sign({ memberPublicKey, sessionId }) with host private key

Member:
  1. Receive MembershipToken out-of-band
  2. Store in useMembership token wallet
  3. On join, send:
       membershipToken: base64url-encoded signed token
       joinProof: member-signs(sessionId|peerId|timestamp|nonce) → base64url

Server:
  1. Verify membershipToken against session.hostPublicKey
  2. Verify joinProof against memberPublicKey extracted from token
  3. Deduplicate proof nonce (replay prevention)
  4. If all pass → respond 'joined' with viaMembership: true
  5. If any fail → respond 'error' with INVALID_MEMBERSHIP
```

The server holds only `hostPublicKey` per session. No membership list is persisted.
