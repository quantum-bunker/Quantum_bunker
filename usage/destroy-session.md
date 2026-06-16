# Destroy Session

## Definition
Terminates an active chat session immediately and returns to the home screen.

## Purpose
To permanently end a session before its auto-decay timer expires, or to remove a saved session entry from Vault History.

## Access
Two locations:
- **Header:** The "Destroy_Session" button, visible in the top bar while inside a chat room.
- **Vault History:** A trash icon button next to each session entry on the home screen.

## Usage Steps

**From inside a chat room:**
1. Click the "Destroy_Session" button in the top-right area of the header.
2. The session terminates immediately. No confirmation prompt appears.

**From the home screen (Vault History):**
1. Locate the session in the "Active_Vault_History" panel on the right.
2. Click the trash icon next to the session entry.
3. The session entry is removed from the history list.

## Options/Settings
None.

## Result
- The chat room closes and the home screen is shown.
- The session is removed from "Active_Vault_History".
- The vault hash ID may remain in the Enter_Vault field, but the session no longer exists on the server.
- The server logs the destruction (e.g., "Destroyed session: <id>").

## Notes/Limitations
- No confirmation dialog appears before destruction. The action is immediate.
- If the user was the host, the session becomes unavailable for all connected members.
- A destroyed session cannot be recovered.
- Destroying a session does not prevent creating a new session with the same vault label.