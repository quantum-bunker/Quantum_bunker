# Vault History (Active_Vault_History)

## Definition

A persistent list of vaults the user has previously created or joined, stored in the browser's `localStorage`. Each entry shows the session name, role, hash prefix, last access time, and provides reconnect and delete actions.

## Purpose

To let users return to sessions they have visited before without re-entering the vault hash ID, and to allow hosts to destroy sessions from the home screen.

## Access

Home screen. Right column panel labeled "Active_Vault_History".

## Usage Steps

**Reconnect to a previous session:**
1. Find the "Active_Vault_History" panel on the right side of the home screen.
2. Click any session entry. Each entry shows the session name (or hash prefix), your role (HOST/MEMBER), and the last access timestamp.
3. The application attempts to reconnect to that vault.

**Delete a history entry:**
1. Click the trash icon button next to the session entry.
2. The entry is removed from the list immediately.

## Result

**On reconnect click:**
- The application navigates to the chat room for that vault and attempts to rejoin.
- If the session is still active, you reconnect with your saved `peerToken` (or `hostRecoveryToken` if you were the host).
- If the session has expired, you will see an error and be returned to the home screen.

**On delete:**
- The local entry is removed from `localStorage`. The session on the server is unaffected unless you destroy it from inside the chat room.

## Notes/Limitations

- History is stored in browser `localStorage`. Clearing browser data removes all entries.
- The panel shows "History_Buffer_Empty" when no sessions exist.
- Each entry shows a role badge: `HOST` (amber) or `MEMBER` (blue/neutral).
- The reconnect button label shows "RECONNECT" for previously visited sessions and "JOIN" for sessions that have not been entered yet on this device.
- History persists across browser restarts as long as `localStorage` is not cleared.
- Deleting a history entry does not destroy the server-side session. Hosts must use "Destroy_Session" from inside the chat room or the trash icon while connected.
