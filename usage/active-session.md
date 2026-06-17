# Active Session Panel

## Definition

A read-only panel in the chat room sidebar showing the current session's metadata: vault name, session ID, peer identity, connection status, and time remaining before auto-expiry.

## Purpose

To provide a quick overview of the current session without navigating away from the chat.

## Access

Left sidebar of the chat room. Top panel labeled "Active Session".

## Usage Steps

- No action required. The panel populates automatically when connected to a session.
- Click the copy icon next to the vault name to copy it to the clipboard.

## Fields

| Field | Description |
|---|---|
| **Vault Name** | The label set during session creation. Includes a copy button. Blank if no label was set (session identified by hash only). |
| **ID** | The full vault hash (UUID). This is the session identifier used in share links. |
| **PEER** | Your peer identifier within this session (e.g., `host-b0fc63c1`). Auto-generated. |
| **STATUS** | Connection status. Shows `ONLINE` when the WebSocket is open. |
| **Decay Timer** | Countdown (MM:SS) showing time remaining before the session auto-expires. Starts at 15:00 by default. Auto-refreshes when under 2 minutes. |

## Notes/Limitations

- All fields are auto-populated and cannot be edited from this panel.
- The decay timer auto-refreshes the session TTL when less than 2 minutes remain, extending it by the default TTL. The refresh only succeeds if at least one peer is connected.
- If the timer reaches 00:00 and refresh fails, the session expires and all participants are disconnected.
