# Share Vault

## Definition
Provides a QR code and a shareable link that others can use to join the current chat session.

## Purpose
To let other users join the session without manually typing the vault hash ID.

## Access
Left sidebar of the chat room, under the "Share Vault" heading. Visible to both host and member roles.

## Usage Steps
1. While in a chat room, locate the "Share Vault" panel in the left sidebar.
2. Choose one of two methods:
   - **QR code:** Have the other user scan the displayed QR code.
   - **Share link:** Click "Copy_Share_Link" to copy the join URL to the clipboard. Send this link to the other user.

## Options/Settings
None.

## Result
- The copied link has the format `http://{domain}/join/{vault-hash-id}`.
- When the recipient opens the link, the Enter_Vault field on the home screen auto-populates with the vault hash ID.

## Notes/Limitations
- The QR code and link are only valid while the session is active.
- Both host and members can share the same vault link.
- The share link encodes the same vault hash ID found in the "Active Session" panel.