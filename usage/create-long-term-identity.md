# Create Long-Term Identity

## Definition

Creates or manages a persistent Ed25519 key pair protected by a user-chosen passphrase. Once created, the same cryptographic identity is reused across sessions instead of generating a fresh burner key each time.

## Purpose

A consistent identity allows contacts to recognize you across sessions, and lets whitelist tokens and pinned contacts remain valid over time. Without a long-term identity, each session uses a new key — contacts and memberships tied to the old key become invalid.

## Access

Home screen, left column, "Identity_Key" panel. Also visible in the chat room sidebar.

## Usage Steps

**Create a new long-term identity:**
1. On the home screen, find the "Identity_Key" panel.
2. Type a passphrase into the "NEW_PASSPHRASE" field.
3. Type the same passphrase into the "CONFIRM_PASSPHRASE" field.
4. Click "Create_Long_Term_Identity".
5. A 32-byte hex fingerprint is displayed and the panel state changes to "Long-term key active".

**Unlock an existing identity:**
1. If a long-term identity exists but is locked, the panel shows "Locked — unlock to use".
2. Enter your passphrase into the "PASSPHRASE" field.
3. Click "Unlock_Identity".
4. The identity is active for the current browser session.

**Forget an existing identity:**
1. When an identity is active, click "Forget this device identity".
2. The key pair is deleted from `localStorage` immediately. This action is permanent.

**Promote a burner key to long-term:**
1. If you have an active session key (burner) and no long-term identity exists, a prompt appears: "A per-session key was found — set a passphrase to promote it to a durable identity."
2. Enter and confirm a passphrase.
3. Click "Promote_To_Long_Term".
4. The session key becomes your long-term identity and is encrypted with the passphrase.

## Result

- A stable identity fingerprint (32-byte hex) is displayed and can be shared as your member code.
- Future sessions reuse this key pair, keeping contacts and membership tokens valid.
- The key pair is stored encrypted in `localStorage` using PBKDF2-SHA256 key derivation + AES-GCM encryption.

## Notes/Limitations

- Without a long-term identity, a fresh burner key is generated per session. Burner keys are discarded when the tab closes.
- The passphrase is never transmitted or stored in plain text. If lost, the identity cannot be recovered — there is no reset mechanism.
- "Forget" is permanent and immediate. There is no undo.
- If creating a new identity on a device that already has a different key registered in trusted contacts, the fingerprint will change and contacts will need to re-verify.
