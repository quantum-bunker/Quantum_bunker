# Core Flows

> 📊 For rendered, image-based versions of every flow below (plus reconnect, rejection, whitelist,
> verification, and call state machines), see [`diagrams/workflows.md`](diagrams/workflows.md).
> The full design rationale is in [`design-document.md`](design-document.md).

## Session Creation

```
User A (browser)                         Server
      │                                     │
      │  POST /api/sessions                 │
      │  { name?, expiresInSeconds?,        │
      │    hostPublicKey? }                 │
      │──────────────────────────────────►  │
      │                                     │  CreateSession.execute()
      │                                     │  → generates sessionId, hostId, hostRecoveryToken
      │                                     │  → stores Session in InMemorySessionStore
      │                                     │  → emits SessionCreated event
      │  201 { sessionId, hostId,           │
      │        hostRecoveryToken,           │
      │        expiresAt }                  │
      │◄──────────────────────────────────  │
      │                                     │
      │  WS connect /ws                     │
      │──────────────────────────────────►  │
      │  join { sessionId, peerId,          │
      │         hostRecoveryToken }         │
      │──────────────────────────────────►  │
      │                                     │  WsTransport: bind socket to hostId
      │  joined { peerId, isHost: true,     │
      │           peerToken }               │
      │◄──────────────────────────────────  │
```

The host stores `hostRecoveryToken` in `localStorage` and `peerToken` in `sessionStorage`. Both are needed to reclaim identity after a page refresh.

---

## Join Flow (Standard — Awaiting Approval)

```
User B (browser)                         Server                    User A (host)
      │                                     │                           │
      │  WS connect /ws                     │                           │
      │  join { sessionId, peerId,          │                           │
      │         message: "Hello" }          │                           │
      │──────────────────────────────────►  │                           │
      │                                     │  → pendingPeers[peerId]   │
      │  pending { sessionId }              │                           │
      │◄──────────────────────────────────  │  join_request ──────────► │
      │                                     │  { peerId, message }      │
      │                                     │                           │
      │                        (host clicks accept)                     │
      │                                     │  accept_join ◄─────────── │
      │                                     │  { sessionId, targetId }  │
      │                                     │                           │
      │  joined { peerId, peerToken }       │  peer_update ──────────── │
      │◄──────────────────────────────────  │  { peers: [...] }     ◄── │
```

---

## Join Flow (Stateless Whitelist — Auto-Admitted)

```
User B (browser)                         Server
      │                                     │
      │  WS connect /ws                     │
      │  join { sessionId, peerId,          │
      │         membershipToken,            │
      │         joinProof }                 │
      │──────────────────────────────────►  │
      │                                     │  Verify membershipToken against hostPublicKey
      │                                     │  Verify joinProof against memberPublicKey
      │                                     │  Deduplicate proof nonce
      │  joined { peerId, peerToken,        │
      │           viaMembership: true }     │
      │◄──────────────────────────────────  │
```

No host interaction required. The host is notified via `peer_update` only.

---

## Messaging Flow

```
Peer A                         Server                         Peer B
  │                               │                               │
  │  RelayEnvelope                │                               │
  │  { type: NOISE_MESSAGE,       │                               │
  │    from: 'peer-a',            │                               │
  │    payload: <ciphertext> }    │                               │
  │──────────────────────────────►│                               │
  │                               │  RelayMessage.execute():      │
  │                               │  1. Get session               │
  │                               │  2. RelayPolicy.validate()    │
  │                               │  3. Check nonce (dedup)       │
  │                               │  4. sendToMany([peer-b])      │
  │                               │  5. touch(sessionId)          │
  │                               │  6. emit MessageRelayed       │
  │  ACK { nonce }                │                               │
  │◄──────────────────────────────│  ──────────────────────────►  │
  │                               │  RelayEnvelope (forwarded)    │
  │                               │                               │
  │                               │  (Peer B reads, sends READ)   │
  │                               │  ◄─────────────────────────── │
  │  READ { nonce }               │                               │
  │◄──────────────────────────────│                               │
```

---

## P2P Connection Setup

```
Peer A                         Server (relay)                 Peer B
  │                               │                               │
  │  SIGNALING { kind: 'rtc-offer', to: 'peer-b', sdp }          │
  │──────────────────────────────►│──────────────────────────────►│
  │                               │  (server forwards blindly)    │
  │                               │  ◄─────────────────────────── │
  │  SIGNALING { kind: 'rtc-answer', sdp }                        │
  │◄──────────────────────────────│                               │
  │                               │                               │
  │  (ICE candidates exchange via SIGNALING)                      │
  │                               │                               │
  │◄═══════════════════════════════════════════════════════════►  │
  │           WebRTC data channel (direct, DTLS-encrypted)        │
  │           + double-ratchet ciphertext layer                   │
```

Once the data channel is open, large files stream directly between peers. The relay is not involved.

---

## File Transfer (Relay Path, ≤ 5 MB)

```
Sender                          Server                         Receiver
  │                               │                               │
  │  (client-side):               │                               │
  │  1. Compress / resize         │                               │
  │  2. [Optional] password-encrypt (PBKDF2 + AES-GCM)           │
  │  3. Double-ratchet encrypt    │                               │
  │  4. Base64url encode          │                               │
  │                               │                               │
  │  FILE envelope { payload }    │                               │
  │──────────────────────────────►│──────────────────────────────►│
  │                               │  (relay forwards blindly)     │
  │                               │                               │
  │                               │  (receiver-side):             │
  │                               │  1. Decrypt ratchet           │
  │                               │  2. [If locked] prompt password
  │                               │  3. Render inline             │
```

---

## File Transfer (P2P Path, ≤ 256 MB)

```
Sender                                                         Receiver
  │                                                               │
  │  (requires open WebRTC data channel)                         │
  │  1. Chunk file at FILE_CHUNK_BYTES (64 KB)                   │
  │  2. AEAD-seal each chunk independently                       │
  │  3. Send via sendBinaryDirect() → ArrayBuffer                │
  │  4. Poll bufferedAmount; pause if > threshold (backpressure) │
  │─────────────────── binary chunks ─────────────────────────►  │
  │                                                               │
  │                                          5. Receive chunks   │
  │                                          6. Decrypt each     │
  │                                          7. Reassemble Blob  │
  │                                          8. Render / download│
```

The relay handles only the initial signaling for the WebRTC connection. File bytes never touch the relay.

---

## Voice/Video Call

```
Caller                         Server (relay)                 Callee
  │                               │                               │
  │  getUserMedia()               │                               │
  │                               │                               │
  │  SIGNALING { kind: 'call',    │                               │
  │    sdp: <offer> }             │                               │
  │──────────────────────────────►│──────────────────────────────►│
  │                               │                               │  Ringing UI
  │                               │                               │  getUserMedia()
  │                               │  ◄─────────────────────────── │
  │  SIGNALING { kind: 'call-accept', sdp: <answer> }             │
  │◄──────────────────────────────│                               │
  │                               │                               │
  │  (ICE exchange via SIGNALING) │                               │
  │                               │                               │
  │◄══════════════ DTLS-SRTP media stream (WebRTC) ═══════════════►│
```

Media never touches the relay. Call state is `idle → calling → ringing → connecting → active`.

---

## Session Destruction

### Host-initiated
```
Host                            Server
  │                               │
  │  DELETE /api/sessions/:id     │
  │  X-Host-Token: <recovery>     │
  │──────────────────────────────►│
  │                               │  1. Validate token
  │                               │  2. Close all peer sockets
  │                               │  3. Delete session from store
  │                               │  4. Emit SessionClosed
  │  204                          │
  │◄──────────────────────────────│
```

### Auto-cleanup
The `CleanupSessions` use case runs every 60 seconds. It destroys sessions that meet any of these conditions:
- `expiresAt < now` (TTL expired)
- `now - lastActivityAt > 30 min` (inactivity)
- `emptySince !== null && now - emptySince > 5 min` (no peers)

---

## Reconnect Flow

```
Peer (after page refresh)               Server
  │                                        │
  │  sessionStorage: sessionId, peerId     │
  │  localStorage: peerToken               │
  │                                        │
  │  WS connect /ws                        │
  │  join { sessionId, peerId, peerToken } │
  │──────────────────────────────────────► │
  │                                        │  If within RECONNECT_GRACE_MS (30s):
  │                                        │  → peer still in session.peers
  │                                        │  → reclaim identity
  │                                        │
  │                                        │  If peerToken valid:
  │  joined { peerId, peerToken, isHost? } │
  │◄────────────────────────────────────── │
```

If more than 30 seconds pass between disconnect and reconnect, the peer is evicted and must rejoin as a new peer (going through the host approval flow again).
