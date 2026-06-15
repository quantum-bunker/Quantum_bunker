# Create Long-Term Identity

## Definition
Creates a persistent encryption key pair protected by a user-chosen passphrase. Once created, the same identity is used across sessions instead of generating a new burner key each time.

## Purpose
To maintain a consistent cryptographic identity across multiple sessions so that contacts and membership whitelists remain valid.

## Access
Home screen, left column, "Identity_Key" panel. Also accessible from the chat room sidebar.

## Usage Steps

**Create a new identity:**
1. On the home screen, find the "Identity_Key" panel.
2. Type a passphrase into the "NEW_PASSPHRASE" field.
3. Type the same passphrase into the "CONFIRM_PASSPHRASE" field.
4. Click "Create_Long_Term_Identity".
5. Once created, a fingerprint code is displayed and the state changes to "Long-term key active".

**Unlock an existing identity:**
1. If a long-term identity already exists, the panel shows "Locked — unlock to use".
2. Type the passphrase into the single "PASSPHRASE" field.
3. Click "Unlock_Identity".

**Forget an existing identity:**
1. When an identity is active, click "Forget this device identity".
2. The identity is removed from the device.

**Promote a burner key:**
1. If a session key is active and no identity exists, a prompt appears: "A per-session key was found — set a passphrase to promote it to a durable identity."
2. Enter and confirm a passphrase.
3. Click "Promote_To_Long_Term".

## Options/Settings
- **Passphrase:** A user-chosen string. Must match between the two fields for new identities.
- No length or complexity requirements are enforced by the UI.

## Result
- A stable identity fingerprint is displayed (32-byte hex string).
- The session key is promoted to a long-term identity. Future sessions use the same key pair.
- The fingerprint persists across browser restarts (encrypted at rest with PBKDF2-SHA256).

## Notes/Limitations
- Without a long-term identity, a fresh burner key is generated per session.
- If the passphrase is lost, the identity cannot be recovered.
- The "Forget" action is permanent and removes the identity from the device immediately.