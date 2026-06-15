# Enter Vault (Join Vault)

## Definition
Joins an existing encrypted chat session created by another user. The joining user becomes a member peer.

## Purpose
To connect to a private chat room using a shared vault hash ID, without needing an account or server authentication.

## Access
Home screen. Left column, second card labeled "Enter_Vault".

## Usage Steps
1. Obtain the vault hash ID from a host (via shared link, QR code, or manually copied text).
2. On the home screen, locate the "Enter_Vault" card.
3. Type or paste the vault hash ID into the "VAULT_HASH_ID" field.
4. Optionally type a display name into the "IDENT_TAG" field.
5. Click "JOIN" (or "RECONNECT" if the vault was visited before).
6. The application switches to the chat room.

## Options/Settings
- **VAULT_HASH_ID:** Required. A UUID string (e.g., `381887fa-6b26-4d8c-8007-078e10d4835e`). This field auto-populates when navigating from a `/join/{hash}` URL or a `?vault={hash}` query parameter.
- **IDENT_TAG:** Optional. A short label sent as the join message. Defaults to "Hello" if left empty. Shown to the host when the user joins.

## Result
- The user is taken to a chat room with a left sidebar showing: Vault Name, Vault ID, Peer identity (auto-generated), Online status, and a Decay Timer.
- A QR code and share link are also available to this user for sharing further.
- The vault is added to "Active_Vault_History" on the home screen.
- The user's role is set to MEMBER.

## Notes/Limitations
- The vault hash ID must be an existing, active session. Expired sessions cannot be joined.
- If the vault hash is invalid or the session has expired, the alert "Vault not found or expired." appears.
- Navigating to a `/join/{hash}` URL automatically fills the vault hash field and strips the path from the browser URL.
- No password or authentication is required to join. Security is handled by the Noise Protocol handshake between peers.