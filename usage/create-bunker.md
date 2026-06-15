# Create Bunker (Init_Vault)

## Definition
Creates a new encrypted chat session. The user who creates it becomes the host. A unique relay hash ID is generated that others can use to join.

## Purpose
To start a private, end-to-end encrypted chat room with no data stored on any server.

## Access
Home screen. Left column, top card labeled "Init_Vault".

## Usage Steps
1. On the home screen, locate the "Init_Vault" card on the left.
2. Optionally type a name into the field labeled "VAULT_LABEL (OPTIONAL)".
3. Click the "CREATE_BUNKER" button.
4. The application switches to the chat room. The vault is active.

## Options/Settings
- **VAULT_LABEL (OPTIONAL):** A text field that accepts any string. This becomes the display name of the session in the chat view and in Vault History. If left blank, the session is identified by a truncated hash.

## Result
- A session is created with a UUID (e.g., `381887fa-6b26-4d8c-8007-078e10d4835e`).
- The user is taken to a chat room with a left sidebar showing: Vault Name, Vault ID, Peer identity, Online status, and a Decay Timer counting down from 15:00.
- A QR code and share link are generated for inviting others.
- The vault appears under "Active_Vault_History" on the home screen when the user returns.
- The user's role is set to HOST.

## Notes/Limitations
- Only the creator becomes the host. There is no way to transfer host ownership.
- The vault hash ID is auto-generated; no custom ID can be chosen.
- The session does not persist past the decay timer expiry.