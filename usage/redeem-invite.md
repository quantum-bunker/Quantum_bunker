# Redeem Invite (Save Membership)

## Definition

A member-side tool that accepts a host-issued invite token and saves it to the browser's local membership wallet. Once saved, the token is automatically presented when joining the associated session.

## Purpose

To activate pre-authorized access to a specific session so that joining is automatic — no host approval required at join time.

## Access

Home screen. "Whitelist" panel, right column labeled "Redeem_Invite (member)".

## Usage Steps

1. Receive an invite token from the host (via any channel — the token is not a secret).
2. Paste the full token string into the "PASTE_INVITE_TOKEN" text area.
3. Click "Save_Membership".
4. A confirmation message appears: `WHITELISTED_FOR {vault-hash-prefix}`.

## Result

- The token is stored in `localStorage` under your membership wallet.
- The active membership counter at the bottom of the panel increments.
- When you join the session for which the token was issued, it is presented automatically along with a possession proof. You are admitted without a host approval step.

## Notes/Limitations

- The "Save_Membership" button is disabled until text is pasted.
- An invalid or malformed token shows `INVALID_INVITE_TOKEN`.
- Memberships are stored in `localStorage`. Clearing browser data removes all saved memberships.
- If you use a burner key (no long-term identity), the token was issued for that specific key. A new session on a different device or after key rotation will not be admitted automatically.
- The token is bound to the session and public key it was issued for. It cannot be used for a different session.
