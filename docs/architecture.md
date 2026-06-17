# Architecture

> 📊 For rendered, image-based diagrams (system context, hexagonal layers, dependency rule, hook
> tree, transport stack, event bus, persistence, module map), see
> [`diagrams/architecture.md`](diagrams/architecture.md). The full design rationale is in
> [`design-document.md`](design-document.md).

Quantum Bunker uses a **Hexagonal (Ports and Adapters)** architecture on the backend and a **hook-driven** architecture on the frontend. The two sides share a single domain contract layer.

---

## Layer Model

```
┌─────────────────────────────────────────────────────┐
│  entrypoints/          Composition root              │
│    container.ts        Constructs and wires all      │
│                        adapters and use cases        │
├─────────────────────────────────────────────────────┤
│  adapters/             Infrastructure implementations│
│    store/              InMemorySessionStore          │
│    transport/          WebSocket (ws)                │
│    events/             EventEmitter bus              │
│    logging/            Winston logger                │
├─────────────────────────────────────────────────────┤
│  application/          Business logic                │
│    ports/              ISessionStore, IRelayTransport│
│                        IEventBus (interfaces only)   │
│    use-cases/          CreateSession, RelayMessage   │
│                        CleanupSessions               │
├─────────────────────────────────────────────────────┤
│  core/                 Domain primitives             │
│    constants.ts        All numeric limits            │
│    policies/           RelayPolicy (validation)      │
│    errors.ts           Typed error codes             │
├─────────────────────────────────────────────────────┤
│  shared/contracts/v1/  Wire contract (frozen)        │
│    envelope.ts         RelayEnvelope, EnvelopeType   │
│    events.ts           DomainEvent<T> types          │
│    session.ts          Session, SessionPeer          │
│    schemas.ts          Zod validation schemas        │
└─────────────────────────────────────────────────────┘
```

### Import Rules (strictly enforced)

| Layer | May import | Must NOT import |
|---|---|---|
| `core/` | `shared/contracts/v1/` types only | application, adapters, entrypoints, Node built-ins |
| `application/` | `core/`, port interfaces | adapter implementations, Express, ws, Winston |
| `adapters/` | `application/`, `core/`, npm infra libs | entrypoints |
| `entrypoints/` | Everything (composition root) | — |

---

## Backend Data Flow

```
HTTP/WS request
      │
      ▼
ws.transport.ts          Parse raw WS frame, authenticate socket
      │
      ▼
RelayMessage.execute()   Validate envelope, dedup nonce, fan-out
      │
      ├── ISessionStore.get()       Read session state
      ├── RelayPolicy.validate()    Check envelope rules
      ├── IRelayTransport.sendToMany()  Deliver to destination peers
      ├── ISessionStore.touch()     Update inactivity timer
      └── IEventBus.emit()          Emit MessageRelayed domain event
```

Every state mutation goes through a use case. The WS adapter never reads or writes session state directly.

---

## Frontend Architecture

The frontend is hook-driven. Components are declarative; hooks own all side effects and state.

```
App.tsx
├── useSession        Session lifecycle: create, join, refresh, destroy
├── useRelay          WebSocket: connect, send, receive, dispatch SIGNALING
│   ├── useP2P        WebRTC mesh: ICE, data channels, binary transfer
│   └── useCall       1-on-1 call: ring, accept, media streams
├── useIdentity       Ed25519 key pair, passphrase protection
├── useContacts       Pinned trusted contacts, mutual whitelist state
├── useContactVerification  Safety numbers, key-change alerts
└── useMembership     Stateless whitelist: issue / redeem tokens
```

State ownership rules:
- **`sessionStorage`** — active session (`sessionId`, `peerId`, `peerToken`); survives page refresh, cleared on tab close
- **`localStorage`** — saved vaults, theme (`qb-theme`), blur preference (`qb-blur`), long-term identity (encrypted), contacts, memberships
- **React state** — ephemeral UI state; never persisted

---

## Shared Contract Layer

`src/shared/contracts/v1/` is the single source of truth for all types shared between client and server.

- `RelayEnvelope` — the wire format for all routed messages. **Frozen** (see ADR-003). Changes require a new `v2/` directory.
- `Session`, `SessionPeer` — session state shape. Only `ISessionStore` adapters hold this; use cases receive it via ports.
- `DomainEvent<T>` — event bus contract. Use cases emit; infrastructure adapters subscribe.
- Zod schemas — validate only at system boundaries (HTTP request bodies, incoming WS frames).

---

## Dependency Injection

`src/backend/entrypoints/container.ts` is the **only** place that:
- Instantiates concrete adapters (`InMemorySessionStore`, `WsTransport`, `EventEmitterBus`)
- Constructs use cases by injecting port implementations
- Registers event bus subscribers (logger, metrics)

No adapter or use case creates its own dependencies. This makes every use case independently testable with mock ports.

---

## P2P Transport Layer

WebRTC is layered on top of the relay, not replacing it. The relay handles session coordination and small messages; the P2P layer handles large file transfer and real-time media.

```
Relay (WebSocket)
  └── SIGNALING envelopes carry WebRTC signaling (SDP/ICE)
        └── WebRTC data channels (direct peer-to-peer)
              └── Encrypted chunks (double-ratchet before DTLS)
```

Key files: `src/transport/webrtc-mesh.ts`, `src/transport/p2p-policy.ts`, `src/useP2P.ts`

The relay remains the fallback for session coordination but is **never** used as a fallback for media when a direct channel fails. Failure is surfaced to the user.

---

## ADR Index

| ADR | Title | Impact |
|---|---|---|
| ADR-001 | Zero-Knowledge Relay | Server never touches payload content |
| ADR-002 | Session Store Interface | `ISessionStore` port; in-memory Phase 1 |
| ADR-003 | Freeze Envelope Contract | `v1/` is frozen; additive-only |
| ADR-004 | Hexagonal-Lite Boundaries | Strict layer import rules |
| ADR-005 | Typed Domain Events | Use cases emit events; infra subscribes |
| ADR-006 | Feature Extension Policy | New behavior → new use case, never modify existing |

Full ADR texts: `docs/adr/`
