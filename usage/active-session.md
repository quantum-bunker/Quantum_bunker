# Active Session Panel

## Definition
A read-only panel in the chat room sidebar that displays the current session's metadata including name, ID, peer identity, status, and decay timer.

## Purpose
To show session details at a glance without navigating away from the chat.

## Access
Left sidebar of the chat room, top panel labeled "Active Session".

## Usage Steps
- No action required. The panel displays information automatically.
- Click the copy icon next to "Vault_Name" to copy the session name to the clipboard.

## Options/Settings
None.

## Result
The panel shows the following read-only fields:
- **Vault_Name:** The session name set during creation, with a copy button.
- **ID:** The full vault hash ID (UUID).
- **PEER:** The user's peer identifier within this session (e.g., "host-b0fc63c1").
- **STATUS:** Connection status. Shows "ONLINE" when connected.
- **Decay_Timer:** A countdown timer (MM:SS) showing remaining time before the session auto-expires.

## Notes/Limitations
- All fields are auto-populated and cannot be edited.
- The peer identifier is auto-generated and unique per session.
- The Decay Timer starts at 15:00 when the session is created.