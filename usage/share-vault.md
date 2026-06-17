# Share Vault

## Definition

A panel providing a QR code and a shareable link that others can use to join the current active session.

## Purpose

To let users invite peers to the session without requiring them to manually enter the vault hash ID.

## Access

Left sidebar of the chat room. Panel under "Share Vault". Available to both host and member roles — any participant can share the vault link.

## Usage Steps

**Share via QR code:**
1. In the left sidebar, locate the "Share Vault" panel.
2. Have the other user open their camera / QR scanner app.
3. Point it at the QR code displayed in the panel.
4. Their device opens the join URL automatically.

**Share via link:**
1. In the "Share Vault" panel, click "Copy_Share_Link".
2. A confirmation animation indicates the link was copied.
3. Paste and send the link to the other user via any channel.

## Result

- The copied link has the format `http://{domain}/join/{vault-hash-id}`.
- When the recipient opens the link, the "VAULT_HASH_ID" field on the home screen auto-populates with the vault hash, and the join path is stripped from the URL.
- The QR code encodes the same URL.

## Notes/Limitations

- The link and QR code are valid only while the session is active. Expired sessions cannot be joined.
- Both host and members can share the link. The share link does not grant any special permissions — it only pre-fills the hash ID.
- The shared link connects the recipient as a new member; the host must still approve unless the recipient has a valid whitelist membership token.
