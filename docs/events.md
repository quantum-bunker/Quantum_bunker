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
{ peerId: string; }   // peerId = the peer being accepted/rejected
```
Host-only. Moves a peer from `pendingPeers` to `peers` (accept) or drops them (reject).
No `sessionId` is sent — the server uses the session already bound to the socket.

#### `kick_peer`
```typescript
{ peerId: string; }   // peerId = the peer being kicked
```
Host-only. Immediately closes the target peer's socket and removes them from the session.
No `sessionId` is sent — the server uses the session already bound to the socket. Only applies in group sessions.

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

One `kind: 'rtc'` frame, discriminated by `rtc`, addressed with `to`:

```
{ kind: 'rtc', to, rtc: 'offer',      data }   SDP offer   (JSON string)
{ kind: 'rtc', to, rtc: 'answer',     data }   SDP answer  (JSON string)
{ kind: 'rtc', to, rtc: 'candidates', data }   ICE candidate BATCH (JSON array)
{ kind: 'rtc', to, rtc: 'candidate',  data }   ICE candidate, single — receive only
```

Receivers MUST ignore any frame whose `to` is not their own peer id: the relay
fans `SIGNALING` out to every peer in the session.

### Voice/Video Calls

One `kind: 'call'` frame, discriminated by `call`, addressed with `to`:

```
{ kind: 'call', to, call: 'invite'  }                 Ring the callee
{ kind: 'call', to, call: 'accept'  }                 Callee accepts
{ kind: 'call', to, call: 'decline' }                 Callee declines
{ kind: 'call', to, call: 'busy'    }                 Callee is already in a call
{ kind: 'call', to, call: 'cancel'  }                 Caller aborts before answer
{ kind: 'call', to, call: 'end'     }                 Either party ends an active call
{ kind: 'call', to, call: 'sdp', sdp }                Media negotiation
{ kind: 'call', to, call: 'ice', candidates }         ICE candidate BATCH
{ kind: 'call', to, call: 'ice', candidate  }         ICE candidate, single — receive only
```

The `to` check applies here too. Without it an invite rings every peer in the
vault, and the fullscreen call UI covers chat for uninvolved peers.

### ICE candidate batching

Outbound ICE candidates are buffered for ~60 ms and emitted as one frame
(`candidates`, an array). Previously each candidate was its own envelope, and a
call's trickle burst exceeded `MSG_PER_SECOND_LIMIT` (10 per peer). The relay
drops the excess, and the dropped frames included Noise handshakes — which left
chat silently undecryptable. Batching is what collapses that burst.

All `SIGNALING` output is additionally paced through a client-side priority
queue (Noise handshake > chat > RTC mesh > call ICE) below the relay rate limit.
See `src/transport/send-queue.ts`.

**Compatibility:** senders emit `candidates`; receivers accept both `candidates`
and the single-candidate `candidate` shape. Keep accepting `candidate` for at
least one version so peers on the previous build can still negotiate.

### Noise Handshake

One `kind: 'noise'` frame, addressed with `to`:
```
{ kind: 'noise', to, step: 0, data: '' }   Restart request — no handshake material
{ kind: 'noise', to, step: 1, data }       Noise XX message 1  [initiator only]
{ kind: 'noise', to, step: 2, data }       Noise XX message 2  [responder only]
{ kind: 'noise', to, step: 3, data }       Noise XX message 3  [initiator only]
```

The initiator is the peer with the lexicographically smaller `peerId`, so only
one side ever sends message 1. That makes a lost channel asymmetric to recover:
an initiator rebuilds by sending message 1 again, but a responder that lost its
channel (a reload, a new tab) has nothing to send and would wait forever. Step 0
is how it asks. The initiator honours a step 0 only once its own handshake has
settled — while it is still `handshaking`, the message 1 it already sent is in
flight and restarting would invalidate the reply before it lands.

A message 1 always starts a fresh handshake on the receiving side, including
when that side is mid-handshake. Feeding it to a half-finished `HandshakeState`
throws, which latches the channel to `failed`; nothing recovers from that, and
`allReady()` then stays false for the rest of the session, silently diverting
every message to the offline outbox with nothing shown to the user.

Channels outlive the socket. A reconnect does not rebuild them — the double
ratchet has no relationship to the connection it was negotiated over — and
queued handshake frames survive a disconnect for the same reason. See
`src/crypto/peer-channels.ts`.

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
