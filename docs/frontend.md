# Frontend

## Stack

| Component | Choice |
|---|---|
| Framework | React 19, functional components only |
| Build / dev server | Vite (served via Express middleware on port 3000) |
| Styling | Tailwind CSS, dark-mode first |
| Animations | Framer Motion |
| Crypto | `@stablelib/noise`, SubtleCrypto (Web API) |
| No build step in dev | Vite middleware handles HMR |

---

## Hook Architecture

Business logic lives in custom hooks. Components only render; they hold no side effects and own no direct API or WebSocket calls.

### Core Hooks

**`useSession`** — session lifecycle

Manages: `sessionId`, `peerId`, `isHost`, `expiresAt`, TTL auto-refresh, and vault history in `localStorage`. On mount, attempts to restore an active session from `sessionStorage`. Exposes `createSession()`, `joinSession()`, `refreshSession()`, `destroySession()`.

**`useRelay`** — WebSocket connection

Manages: WS connection, reconnect logic, sending `RelayEnvelope` frames, dispatching incoming frames to their handlers. Routes `SIGNALING` envelopes with specific `kind` values to `useP2P.handleSignal()` and `useCall.handleSignal()`. Handles all message types: `NOISE_MESSAGE`, `ACK`, `READ`, `EDIT`, `DELETE`, `FILE`.

**`useP2P`** — WebRTC mesh

Manages: one `RTCPeerConnection` per remote peer, ICE negotiation, data channels (text + binary). Exposes `sendDirect()` and `sendBinaryDirect()` — both return `false` if the channel is not open. `directFailed` is set `true` when ICE permanently fails for any peer; the UI must surface this. Never used for media (that is `useCall`'s domain).

**`useCall`** — 1-on-1 voice/video

Manages: `getUserMedia`, `RTCPeerConnection` for media, call state machine (`idle → calling → ringing → connecting → active`). Only offered when the session has exactly one other peer. Signaling via `SIGNALING` envelopes with `kind: 'call'`. State stored in refs alongside React state to prevent stale closure bugs in WS callbacks.

**`useIdentity`** — key pair management

Manages: Ed25519 key pair, encrypted at rest with PBKDF2-SHA256. If no long-term identity exists, a per-session burner key is generated. Exposes `createIdentity()`, `unlockIdentity()`, `forgetIdentity()`, `promoteToLongTerm()`. Fingerprint is the 32-byte hex of the public key.

**`useContacts`** — trusted contacts

Manages: pinned contact list in `localStorage`. Contacts are keyed by public key. Exposes `pinContact()`, `removeContact()`, `resolveContact()`. Used by the mutual whitelist flow and contact verification.

**`useContactVerification`** — safety numbers

Manages: safety number computation (derived from Noise handshake remote static key), verification status per peer, key-change detection. When a pinned peer's key changes, sets `keyChangedPeer` which triggers a blocking UI overlay.

**`useMembership`** — whitelist tokens

Manages: `MembershipToken` wallet in `localStorage`. Exposes `issueToken()` (host-only), `redeemToken()` (member), `findTokenForSession()` (called on join). Token format: Ed25519 signature over `{ memberPublicKey, sessionId }`.

---

## State Persistence

| Key | Storage | Contents |
|---|---|---|
| `qb-session` | `sessionStorage` | Active session: `sessionId`, `peerId`, `peerToken`, `isHost` |
| `qb-vaults` | `localStorage` | Vault history: name, role, hash, last access |
| `qb-theme` | `localStorage` | Selected theme: `cyberpunk` \| `halo` \| `classic` |
| `qb-blur` | `localStorage` | Message blur enabled: `true` \| `false` |
| `qb-identity` | `localStorage` | Encrypted long-term key pair (PBKDF2 + AES-GCM) |
| `qb-contacts` | `localStorage` | Pinned contacts list |
| `qb-memberships` | `localStorage` | Whitelist tokens wallet |

---

## Component Structure

Components under `src/components/` are organized by feature. No component imports a hook it doesn't own — hooks are passed down via props or composed at the page level in `App.tsx`.

**Page-level components (rendered by `App.tsx`):**
- Home screen — vault creation, vault entry, whitelist panel, trusted contacts
- Chat room — message list, input bar, sidebars (active session, relay interface, search, share, event log, verify contacts)

**Rule:** A component file may import only from `../components/`, `../shared/`, and npm packages. It must never import from `../backend/` or `../shared/contracts/`.

---

## Themes

Three themes ship out of the box:

| Theme | Aesthetic |
|---|---|
| `cyberpunk` | Neon cyan/orange, `font-mono`, high-contrast dark (default) |
| `halo` | Military/tactical dark aesthetic |
| `classic` | Clean, minimal, reduced visual noise |

Theme is toggled via the header bar control and persisted in `localStorage` under `qb-theme`. The `useTheme` hook reads/writes this key and applies the theme class to the document root.

---

## Security / Privacy UI

### Window Blur Blackout
Always active inside a chat room. When the browser window loses focus (tab switch, alt-tab, Meta/PrintScreen key event), a full-screen opaque overlay covers the chat. There is no toggle — this is not optional.

### Message Blur-to-Reveal
Optional. Controlled by the "Blur" checkbox in the header (desktop) or hamburger menu (mobile). When enabled, message bubbles are visually blurred until hovered or touched. Persisted in `localStorage` under `qb-blur`.

Both features are visual deterrents only. They do not prevent screenshots, screen recording, or DOM inspection.

---

## File Transfer

Two paths:

**Relay path (≤ 5 MB):** `src/file-transfer.ts` encodes the file as a `FileAttachment` object (base64 blob + MIME type + size + name + optional IV), encrypts it via the double ratchet, and sends it as a `FILE` envelope. Recipient decrypts and renders inline. Voice messages (`audio/webm`) and video files use this path.

**P2P path (≤ 256 MB):** Large files are chunked at `FILE_CHUNK_BYTES` (64 KB), each chunk AEAD-sealed independently, then streamed over the WebRTC data channel via `sendBinaryDirect()`. The relay is not involved. Backpressure is managed by polling `bufferedAmount` from `useP2P`.

**Password-protected files:** An additional encryption pass using PBKDF2-SHA256 (210k iterations) + user-chosen AEAD (AES-GCM or ChaCha20-Poly1305) is applied *before* the ratchet. The password is never transmitted; recipients enter it to unlock.

---

## Voice/Video Calls

`useCall` provides 1-on-1 calls. The call UI is hidden when more than one other peer is in the session.

Call signaling flows through the relay as opaque `SIGNALING` envelopes (`kind: 'call'`). The relay never sees the SDP or ICE content. Media travels directly between peers over DTLS-SRTP (WebRTC mandatory). The double-ratchet layer is NOT applied to media streams (real-time constraint); the security model for calls is DTLS-SRTP + out-of-band safety number verification.

---

## Traffic Analysis Hardening

Before encryption, `src/crypto/message-padding.ts` pads the plaintext to the next fixed bucket: **8 KB / 64 KB / 512 KB / 4 MB**. A 4-byte big-endian length prefix is prepended so the receiver can strip padding after decryption.

Non-interactive frames (ACK, READ, EDIT, DELETE) add a random delay of 0–`TIMING_JITTER_MAX_MS` (120 ms) before sending to blunt timing correlation. Interactive text messages are not delayed.

The server knows nothing about this — it sees only the padded ciphertext size.

---

## Vite / Dev Server

In development, Express mounts Vite as middleware (`createViteServer({ server: { middlewareMode: true } })`). This means:
- No separate `npm run dev:client` — one process at port 3000 serves both API and UI
- HMR works without an extra port
- In production, Vite outputs to `dist/` and Express serves it as static files
