# Vault History (Active_Vault_History)

## Definition
A persistent list of previously joined or created sessions stored in the browser's local storage. Each entry shows the session name, role, hash, last access time, and provides reconnect and delete actions.

## Purpose
To let users return to sessions they have used before without re-entering the vault hash ID.

## Access
Home screen. Right column panel labeled "Active_Vault_History".

## Usage Steps

**To reconnect to a previous session:**
1. On the home screen, find the "Active_Vault_History" panel on the right.
2. Click any session entry. The button label shows session name, role (HOST/MEMBER), hash prefix, and last access timestamp.
3. The application joins the selected session.

**To delete a history entry:**
1. Click the trash icon button next to the session entry.
2. The entry is immediately removed from the list.

## Options/Settings
None.

## Result
- Clicking a session entry navigates to the chat room for that vault.
- Deleting an entry removes that session from local storage. The session itself is not destroyed on the server unless the user was the host and uses the "Destroy_Session" button from within the chat room.

## Notes/Limitations
- History is stored in browser local storage. Clearing browser data removes all entries.
- The history panel shows "History_Buffer_Empty" when no sessions exist.
- Each entry shows the role (HOST or MEMBER) in a colored badge.
- The reconnect button label changes based on context: shows "RECONNECT" for previously joined sessions, "JOIN" for new sessions.
- The history persists across browser restarts as long as local storage is preserved.