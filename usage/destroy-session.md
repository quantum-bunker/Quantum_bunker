# Destroy Session

## Definition

Immediately terminates an active chat session and disconnects all participants. Host-only action.

## Purpose

To end a session before its auto-decay timer expires, or to clean up a saved session entry from Vault History.

## Access

Two locations:
- **Header:** The "Destroy_Session" button visible in the top bar while inside a chat room (host only).
- **Vault History:** A trash icon button next to each session entry on the home screen.

## Usage Steps

**From inside a chat room (host):**
1. Click "Destroy_Session" in the header bar.
2. The session terminates immediately. All connected peers are disconnected.

**From Vault History (home screen):**
1. Find the session entry in the "Active_Vault_History" panel on the right.
2. Click the trash icon next to the entry.
3. The entry is removed from the history list.

## Result

**From inside the chat room:**
- The session is destroyed on the server immediately.
- All connected peers lose their connection and see an error or are returned to the home screen.
- The vault is removed from "Active_Vault_History" on your home screen.

**From Vault History:**
- The local history entry is deleted. The session itself may still be active on the server if it has not expired.

## Notes/Limitations

- No confirmation dialog. The action is immediate and irreversible.
- Only the host can destroy a session from inside the chat room. Members see no destroy button.
- Destroying a session does not prevent creating a new one with the same vault label.
- A destroyed session cannot be recovered. Any message history in peer browsers is also lost on reload.
