# Member Code

## Definition
A read-only public key string that identifies the user to hosts. Hosts use this code to whitelist the user for private sessions.

## Purpose
To share a cryptographic identifier with session hosts so they can issue membership invites.

## Access
Home screen, "Whitelist" panel, left column under "Your_Member_Code". Also visible in the chat room sidebar.

## Usage Steps
1. Locate the "Whitelist" panel on the home screen.
2. Find the "Your_Member_Code" section. A long base64-encoded string is displayed.
3. Click the copy button next to the code to copy it to the clipboard.
4. Send this code to a session host.

## Options/Settings
None.

## Result
- The code is copied to the clipboard.
- The copy button shows a checkmark icon for 2 seconds to confirm success.
- The host can use this code in the "Issue_Invite" section to generate a whitelist token.

## Notes/Limitations
- The member code is derived from the user's current public key. If using a burner key (no long-term identity), the code changes with each new session.
- The code itself is public. It is not a secret.