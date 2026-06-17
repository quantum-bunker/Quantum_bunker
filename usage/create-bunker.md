# Create Bunker (Init_Vault)

## Definition

Creates a new encrypted chat session. The user who creates it becomes the host with full control authority. A unique vault hash ID is generated that others use to join.

## Purpose

To start a private, end-to-end encrypted chat room with no data stored on any server.

## Access

Home screen. Left column, top card labeled "Init_Vault".

## Usage Steps

1. On the home screen, locate the "Init_Vault" card on the left.
2. Optionally type a name into the "VAULT_LABEL (OPTIONAL)" field.
3. Click "CREATE_BUNKER".
4. The application connects and opens the chat room.

## Options

- **VAULT_LABEL (OPTIONAL):** A display name for the session. Shown in the chat room header and in Vault History. If left blank, the session is identified by a truncated hash only.

## Result

- A session is created with a UUID (e.g., `381887fa-6b26-4d8c-8007-078e10d4835e`).
- The chat room opens with the left sidebar showing: vault name, vault ID, your peer identity, connection status, and a decay timer starting at 15:00.
- A QR code and share link are generated in the "Share Vault" panel for inviting others.
- The vault appears in "Active_Vault_History" on the home screen.
- Your role is set to HOST. You will see join requests and approve or reject peers.
- A `hostRecoveryToken` and `peerToken` are saved in the browser, allowing you to reclaim host authority after a page refresh.

## Notes/Limitations

- Only the creator is the host. Host ownership cannot be transferred.
- The vault hash ID is auto-generated and cannot be customized.
- The session exists only in server memory. It expires when the decay timer runs out, after 30 minutes of no messages, or after 5 minutes with no peers connected.
