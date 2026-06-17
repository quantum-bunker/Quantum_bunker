# Event Log

## Definition

A real-time scrolling log panel in the chat room sidebar that displays WebSocket connection events, cryptographic handshake progress, and performance metrics.

## Purpose

To provide operational visibility into the relay connection state, WebSocket lifecycle, and session health — useful for diagnosing connectivity issues and confirming that the encrypted channel is established.

## Access

Right sidebar (or expandable panel) of the chat room. Panel labeled "Event Log". Present for both host and member roles.

## Usage Steps

No action required. The log updates automatically as events occur. Scroll the log area to review past entries.

## Log Entry Types

| Entry type | Example | When it appears |
|---|---|---|
| WS connection | `WS_CONNECT: [ESTABLISHED]` | WebSocket successfully opens |
| WS failure | `ERR: WebSocket connection failed` | Connection attempt fails |
| Reconnect | `WS_CONNECT: [RECONNECTING]` | Automatic reconnect attempt |
| Handshake wait | `[HANDSHAKE_WAIT] - Listening...` | Noise Protocol handshake pending |
| Performance metrics | `IO_LOAD: 2%  LATENCY: 14ms` | Updated periodically while connected |

## Notes/Limitations

- The log is ephemeral. Entries are not persisted. Leaving the session or reloading the page clears the log.
- WebSocket reconnection attempts appear as repeated `WS_CONNECT` entries. Multiple reconnects in quick succession may indicate a network issue.
- The log scrolls automatically to new entries but can be scrolled back manually to review history.
- `IO_LOAD` and `LATENCY` are estimates; `LATENCY` reflects the round-trip time for a WebSocket ping/pong.
