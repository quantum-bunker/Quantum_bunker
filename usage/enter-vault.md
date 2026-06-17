# Enter Vault (Join Vault)

## Definition

Joins an existing encrypted chat session created by another user. The joining user becomes a member peer.

## Purpose

To connect to a private chat room using a shared vault hash ID, without needing an account, password, or server authentication.

## Access

Home screen. Left column, second card labeled "Enter_Vault".

## Usage Steps

1. Obtain the vault hash ID from the host (via shared link, QR code scan, or manually copied text).
2. On the home screen, locate the "Enter_Vault" card.
3. Type or paste the vault hash ID into the "VAULT_HASH_ID" field.
4. Optionally type a display name into the "IDENT_TAG" field.
5. Click "JOIN" (or "RECONNECT" if returning to a previously visited vault).
6. Wait for the host to approve your join request.

## Options

- **VAULT_HASH_ID:** Required. The UUID of the target session. Auto-populates when opening a `/join/{hash}` URL or a `?vault={hash}` link. The path is then stripped from the browser URL.
- **IDENT_TAG:** Optional. A short label sent as your join message. Shown to the host when you request to join. Defaults to "Hello" if left empty.

## Result

- If the host approves: you enter the chat room. Your role is MEMBER.
- If using a stateless whitelist token (pre-authorized): you are admitted automatically without host action.
- The chat room shows the left sidebar with vault info, your peer identity, connection status, and decay timer.
- A share link and QR code are available to you as well — you can invite others even as a member.
- The vault is added to "Active_Vault_History" on your home screen.
- A `peerToken` is saved in the browser, letting you reclaim your peer identity after a page refresh.

## Notes/Limitations

- The vault hash ID must reference an active, non-expired session. Expired sessions return "Vault not found or expired."
- If the host rejects your join request, you are returned to the home screen.
- Security is handled by the Noise Protocol cryptographic handshake after admission — no server-side password check occurs on join.
