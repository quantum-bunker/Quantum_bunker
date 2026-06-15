# Event Log

## Definition
A real-time scrolling log in the chat room sidebar that displays WebSocket connection events, handshake status, and performance metrics.

## Purpose
To provide operational visibility into the relay connection, WebSocket state, and session health.

## Access
Right sidebar of the chat room, bottom panel labeled "Event Log".

## Usage Steps
- No action required. The log updates automatically.
- Scroll the log area manually to review past entries.

## Options/Settings
None.

## Result
The log displays three types of entries:
- **Connection events:** Timestamped entries showing "WS_CONNECT: [ESTABLISHED]" when the WebSocket connects or reconnects, and "ERR: WebSocket connection failed" on failure.
- **Handshake status:** Shows "[HANDSHAKE_WAIT] - Listening..." when waiting for encrypted peer connection.
- **Performance metrics:** Two readouts at the bottom — IO_LOAD (percent) and LATENCY (milliseconds).

## Notes/Limitations
- The log is ephemeral. Entries are lost when leaving the session or reloading the page.
- WebSocket reconnection attempts appear as repeated "WS_CONNECT" entries.
- The log scrolls automatically on new entries but can be scrolled back manually.