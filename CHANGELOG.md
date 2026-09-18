# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning starts at `0.1.0`. Earlier builds were unversioned — the root package
was `react-example@0.0.0` and the UI displayed a `v1.0.4-RELAY` string that
corresponded to nothing.

## [Unreleased]

## [0.1.0] - 2026-09-17

First versioned release. Fixes four unrelated defects that between them made
peer-to-peer transfer, voice messages, and calls unusable on a hosted
deployment, and makes the project's privacy claim accurate.

### Added
- Public STUN servers are configured by default, with a per-device setting
  (`default` / `custom` / `off`) in a new connectivity panel, stored under
  `qb-stun` in `localStorage`.
- Direct-connection failures now carry a reason (`no-stun`,
  `no-reflexive-candidate`, `symmetric-nat`, `timeout`, `signaling-error`,
  `peer-left`) and are explained in the UI with advice that matches the actual
  outcome.
- A priority send queue paces all `SIGNALING` traffic below the relay's rate
  limit, ordered Noise handshake > chat > RTC mesh > call ICE.
- ICE candidates are batched into a single envelope on both the mesh and call
  paths. The previous single-candidate frame shape is still accepted on receive.
- `PROTOCOL_VERSION` in `shared/contracts/v1/protocol.ts`, following the
  existing `MEMBERSHIP_VERSION` pattern.
- `/api/health` reports `version`, `commit`, and `protocol`.
- `onError` handling on image, audio, and video attachments, with a download
  fallback.
- One ICE restart before a peer is declared failed; a distinct `dropped` state
  for a link that dies mid-session; `dc.onerror` wired.
- Error boundaries around `ChatRoom` and `CallView` individually.
- `QB_METADATA_LOGS=1` opt-in for local metadata debugging.

### Changed
- `P2P_FILE_THRESHOLD_BYTES` raised from 64 KB to 1 MB, and
  `RELAY_LIMITS.MAX_FILE_BYTES` lowered from 5 MB to 1 MB so the two agree.
- Files are routed peer-to-peer above 3 peers regardless of size, because
  per-recipient ciphertext fan-out makes a relayed copy expensive.
- The ICE connect timeout is 20 s (was 8 s), with candidate pre-gathering.
- The root package is `quantum-bunker@0.1.0` (was `react-example@0.0.0`), with a
  description, license, and repository. The UI version now comes from
  `package.json` via Vite `define`.
- `metadata.json` no longer describes the app as 2-peer; vaults hold up to 10.

### Fixed
- **Production CSP had no `media-src`**, so every decrypted `data:`/`blob:`
  attachment was blocked by the browser. Voice messages played for nobody.
  `img-src` gained `blob:` for the same reason. Invisible in development, where
  CSP is disabled.
- **A video call could break messaging.** Each ICE candidate was its own relay
  envelope, and the trickle burst exceeded the per-peer rate limit; the dropped
  frames included Noise handshakes, leaving chat silently undecryptable.
- **Large files failed off-LAN.** The ICE server list was empty, so only private
  host candidates were offered.
- **A call invite rang every peer in the vault.** The relay broadcasts
  `SIGNALING` and `useCall.handleSignal` did not check the addressee, so the
  fullscreen call modal covered chat for uninvolved peers.
- Granting camera access blanked the screen: the permission prompt takes window
  focus, which raised the privacy blackout over the call UI.
- Voice recording guarded on render-closure state across the `getUserMedia`
  await, so a quick tap left the recorder running and the microphone live.
- Object URLs were never revoked; every streamed file leaked for the session.
- A voice note arriving with a generic MIME rendered in a blank `<video>`.
- `socket.onmessage` had no `try`/`catch` around `JSON.parse` or envelope
  dispatch.

### Security
- **Per-message metadata is no longer logged.** `MessageRelayed` wrote
  `sessionId + from + envelopeType + byteSize` for every message — a complete
  social and timing graph per session, and the exact metadata the padding and
  jitter defences exist to blunt. `PeerJoined` no longer logs the peer id, and
  the `[API]` session console lines are gone. README and `docs/security.md` now
  state precisely what is retained.

[Unreleased]: https://github.com/quantum-bunker/Quantum_bunker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/quantum-bunker/Quantum_bunker/releases/tag/v0.1.0
