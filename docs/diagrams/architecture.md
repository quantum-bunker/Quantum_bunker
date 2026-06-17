# Quantum Bunker — Architecture Diagrams

> Structural views of the system: deployment, hexagonal backend, frontend hook tree, the shared
> contract layer, and the data paths. Diagrams are [Mermaid](https://mermaid.js.org/) and render as
> images on GitHub and most Markdown viewers.

## Index

1. [System context](#1-system-context)
2. [Deployment topology](#2-deployment-topology)
3. [Hexagonal backend (ports & adapters)](#3-hexagonal-backend-ports--adapters)
4. [Dependency rule](#4-dependency-rule)
5. [Backend request data flow](#5-backend-request-data-flow)
6. [Frontend hook tree](#6-frontend-hook-tree)
7. [Shared contract layer](#7-shared-contract-layer)
8. [Transport stack (relay + P2P)](#8-transport-stack-relay--p2p)
9. [Event bus fan-out](#9-event-bus-fan-out)
10. [Client persistence model](#10-client-persistence-model)
11. [Module map](#11-module-map)

---

## 1. System context

Two or more browsers, one blind relay. All cryptographic meaning lives in the clients.

```mermaid
graph TB
    subgraph Clients
        A["Browser A — Host<br/>React 19 + hooks"]
        B["Browser B — Peer"]
        C["Browser C — Peer"]
    end

    R{{"Quantum Bunker Server<br/>Express + ws<br/><b>BLIND RELAY</b><br/>in-memory only"}}

    A -- "HTTPS REST + WSS" --> R
    B -- "WSS" --> R
    C -- "WSS" --> R

    A == "WebRTC data / media (direct, double-ratchet over DTLS)" === B
    A -. "STUN/TURN" .-> ICE[(STUN / TURN)]
    B -. .-> ICE

    style R fill:#0d2235,stroke:#00e5ff,color:#cdefff
    style A fill:#10261a,stroke:#2ecc71,color:#d6ffe0
```

> The server **never** decrypts, stores, or logs `envelope.payload`. P2P media bypasses it entirely.

---

## 2. Deployment topology

Single Node process, single port. Vite serves the frontend in dev; static assets in prod.

```mermaid
graph LR
    subgraph "Node process (port 3000)"
        EX["server.ts<br/>Express app"]
        VI["Vite middleware<br/>(dev) / static (prod)"]
        WS["ws server /ws"]
        CL["cleanup scheduler<br/>every 60s"]
        DI["container.ts<br/>(DI composition root)"]
        ST[("InMemorySessionStore<br/>Map&lt;id, Session&gt;")]
    end

    EX --> VI
    EX --> WS
    EX --> CL
    DI --> WS
    DI --> CL
    WS --> ST
    CL --> ST

    style ST fill:#2a1a0d,stroke:#ffae42,color:#ffe9c7
```

---

## 3. Hexagonal backend (ports & adapters)

Use cases depend only on port interfaces; adapters implement them; the container wires them.

```mermaid
graph TB
    subgraph entrypoints
        CT["container.ts — composition root"]
    end

    subgraph adapters
        WST["ws.transport.ts"]
        STO["in-memory-session.store.ts"]
        EVB["event-emitter.bus.ts"]
        LOG["winston.logger.ts"]
    end

    subgraph application
        direction TB
        subgraph ports
            P1["ISessionStore"]
            P2["IRelayTransport"]
            P3["IEventBus"]
        end
        subgraph "use-cases"
            U1["CreateSession"]
            U2["RelayMessage"]
            U3["CleanupSessions"]
        end
    end

    subgraph core
        CN["constants.ts"]
        PO["relay.policy.ts"]
        ER["errors.ts"]
    end

    CT --> WST & STO & EVB & LOG
    CT --> U1 & U2 & U3
    WST -. implements .-> P2
    STO -. implements .-> P1
    EVB -. implements .-> P3
    U1 & U2 & U3 --> P1 & P2 & P3
    U2 --> PO
    PO --> CN
    U1 & U2 & U3 --> ER

    style ports fill:#0d2235,stroke:#00e5ff,color:#cdefff
    style core fill:#1a1326,stroke:#b388ff,color:#e7dbff
```

---

## 4. Dependency rule

Imports flow inward only: `core → application → adapters → entrypoints`. Nothing flows upstream.

```mermaid
graph LR
    SH["shared/contracts/v1<br/>(frozen wire types)"] --> CO[core]
    CO --> AP[application]
    AP --> AD[adapters]
    AD --> EN[entrypoints]

    classDef inner fill:#1a1326,stroke:#b388ff,color:#e7dbff;
    classDef outer fill:#0d2235,stroke:#00e5ff,color:#cdefff;
    class SH,CO,AP inner;
    class AD,EN outer;
```

| Layer | May import | Must NOT import |
|---|---|---|
| `core/` | `shared/contracts/v1/` types only | application, adapters, entrypoints, Node built-ins |
| `application/` | `core/`, port interfaces | adapter implementations, Express, ws, Winston |
| `adapters/` | `application/`, `core/`, npm infra libs | entrypoints |
| `entrypoints/` | everything (composition root) | — |

---

## 5. Backend request data flow

Every state mutation passes through a use case — the WS adapter never touches store state directly.

```mermaid
flowchart TD
    REQ([HTTP / WS frame]) --> WST["ws.transport.ts<br/>parse frame, authenticate socket"]
    WST --> UC["RelayMessage.execute()"]
    UC --> G["ISessionStore.get() — read state"]
    UC --> V["RelayPolicy.validate() — envelope rules"]
    UC --> SM["IRelayTransport.sendToMany() — deliver"]
    UC --> TO["ISessionStore.touch() — reset inactivity"]
    UC --> EM["IEventBus.emit(MessageRelayed)"]
    EM --> SUB["subscribers: winston logger, metrics"]

    style UC fill:#0d2235,stroke:#00e5ff,color:#cdefff
```

---

## 6. Frontend hook tree

Components stay declarative; hooks own all side effects and state.

```mermaid
graph TD
    APP["App.tsx — home + chat views"]
    APP --> US[useSession<br/>create / join / refresh / destroy]
    APP --> UR[useRelay<br/>WebSocket: send / receive / SIGNALING dispatch]
    UR --> UP[useP2P<br/>WebRTC mesh: ICE, data channels, binary]
    UR --> UC[useCall<br/>1-on-1 ring / accept / media]
    APP --> UI[useIdentity<br/>Ed25519 key pair, passphrase]
    APP --> UCT[useContacts<br/>pinned contacts, mutual whitelist]
    APP --> UCV[useContactVerification<br/>safety numbers, key-change alert]
    APP --> UM[useMembership<br/>issue / redeem whitelist tokens]

    style APP fill:#10261a,stroke:#2ecc71,color:#d6ffe0
    style UR fill:#0d2235,stroke:#00e5ff,color:#cdefff
```

---

## 7. Shared contract layer

`src/shared/contracts/v1/` is the single source of truth shared by client and server.

```mermaid
graph LR
    subgraph "shared/contracts/v1 (FROZEN — ADR-003)"
        EN["envelope.ts<br/>RelayEnvelope, EnvelopeType"]
        EV["events.ts<br/>DomainEvent&lt;T&gt;"]
        SE["session.ts<br/>Session, SessionPeer, SessionStatus"]
        SC["schemas.ts<br/>Zod — validate at boundaries only"]
    end

    BE["backend/*"] --> EN & EV & SE & SC
    FE["frontend hooks/*"] --> EN & EV & SE & SC

    style EN fill:#1a1326,stroke:#b388ff,color:#e7dbff
```

> Fields are **add-only**. Removing/renaming a field is breaking and requires a `v2/` directory.

---

## 8. Transport stack (relay + P2P)

WebRTC is layered *on top of* the relay, never replacing it.

```mermaid
graph TB
    REL["Relay (WebSocket /ws)<br/>session coordination + small messages"]
    REL --> SIG["SIGNALING envelopes<br/>carry SDP / ICE (server blind)"]
    SIG --> DC["WebRTC data channels<br/>(direct peer-to-peer)"]
    DC --> RAT["Double-ratchet ciphertext<br/>applied BEFORE DTLS"]
    RAT --> DTLS["DTLS encryption<br/>(defense-in-depth, not the only layer)"]

    style REL fill:#0d2235,stroke:#00e5ff,color:#cdefff
    style RAT fill:#1a1326,stroke:#b388ff,color:#e7dbff
```

> The relay is the fallback for **coordination**, never for **media**. On `directFailed`, the UI
> surfaces the failure — it does not silently reroute media through the relay.

---

## 9. Event bus fan-out

Use cases emit typed events; infrastructure subscribes. No use case imports a logger directly.

```mermaid
graph LR
    U1[CreateSession] -- SessionCreated --> BUS{{IEventBus}}
    U2[RelayMessage] -- MessageRelayed / EnvelopeRejected --> BUS
    U3[CleanupSessions] -- SessionExpired --> BUS
    WS[WsTransport] -- PeerJoined / PeerDisconnected --> BUS
    BUS --> LOG[Winston logger<br/>payload NEVER logged]
    BUS --> MET[metrics / IO indicator]
    BUS --> FEL[frontend event-log panel]

    style BUS fill:#2a1a0d,stroke:#ffae42,color:#ffe9c7
```

---

## 10. Client persistence model

Where each piece of state lives, and what survives a refresh vs. tab close.

```mermaid
graph TB
    subgraph "sessionStorage — survives refresh, clears on tab close"
        SS["active session: sessionId, peerId, peerToken"]
    end
    subgraph "localStorage — cross-session"
        LS1["saved vaults + recovery tokens"]
        LS2["qb-theme (cyberpunk / halo / classic)"]
        LS3["qb-blur preference"]
        LS4["long-term identity (encrypted)"]
        LS5["contacts, memberships"]
    end
    subgraph "React state — ephemeral, never persisted"
        RS["UI state, messages, call state"]
    end

    style SS fill:#0d2235,stroke:#00e5ff,color:#cdefff
    style RS fill:#10261a,stroke:#2ecc71,color:#d6ffe0
```

> Never a database, Redis, or file. Ephemerality is the design (see ADR-001/002).

---

## 11. Module map

High-level file responsibilities across the monorepo.

```mermaid
graph TB
    subgraph Shared
        SHC["shared/contracts/v1 — wire types & Zod"]
    end
    subgraph Backend
        BENT["entrypoints/container.ts — DI"]
        BAPP["application/use-cases + ports"]
        BAD["adapters/ store · transport · events · logging"]
        BCORE["core/ constants · policies · errors"]
    end
    subgraph "Frontend (client)"
        FUI["App.tsx + components"]
        FHOOKS["hooks: useSession/Relay/P2P/Call/Identity/Contacts/Membership"]
        FTRANS["transport/ webrtc-mesh · call-connection · ice-config · p2p-policy"]
        FCRYP["crypto/message-padding · file-crypto · file-transfer · voice-record"]
    end
    SRV["server.ts — Express + Vite + ws + cleanup"]

    SRV --> BENT
    BENT --> BAPP --> BCORE
    BENT --> BAD --> BAPP
    BAD --> SHC
    FUI --> FHOOKS --> FTRANS --> FCRYP
    FHOOKS --> SHC
    BCORE --> SHC

    style SHC fill:#1a1326,stroke:#b388ff,color:#e7dbff
    style SRV fill:#2a1a0d,stroke:#ffae42,color:#ffe9c7
```

---

*See also: [`workflows.md`](workflows.md) for runtime sequences and
[`../design-document.md`](../design-document.md) for the full design rationale.*
