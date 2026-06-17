# Relay Interface Panel

## Definition

A read-only panel in the chat room sidebar showing the security properties of the active session: encryption mode, session memory model, zero-knowledge status, and message crypto protocol.

## Purpose

To confirm the security posture of the current session at a glance, and to make the privacy guarantees legible without requiring technical knowledge.

## Access

Left sidebar of the chat room. Panel labeled "Relay Interface". Present for both host and member roles.

## Usage Steps

No action required. Values are displayed automatically when in an active session.

## Fields

| Field | Value | Meaning |
|---|---|---|
| **ENVELOPE_TYPE** | `LOCKED` | Messages travel as encrypted envelopes. The relay cannot read them. |
| **SESSION_MEMORY** | `Ephem` | The session exists only in server RAM. Nothing is written to disk or a database. |
| **ZERO_KNOWLEDGE** | `ACTIVE` | The server is a blind relay — it never decrypts, logs, or stores payload content. |
| **MSG_CRYPTO** | `DoubleRatchet` | Messages are encrypted with a double-ratchet protocol, providing per-message forward secrecy and break-in recovery. |

## Notes/Limitations

- All values are static configuration indicators. They do not change during a session.
- `ZERO_KNOWLEDGE: ACTIVE` reflects the server's design, not a runtime measurement. The guarantee holds as long as the server code is unmodified.
- `MSG_CRYPTO: DoubleRatchet` applies to messages sent through the relay. P2P file transfers additionally use WebRTC DTLS as a second encryption layer.
