# Redeem Invite (Save Membership)

## Definition
A member-side tool that accepts a host-issued invite token to gain whitelisted access to a specific session.

## Purpose
To authorize a member into a specific vault using a cryptographic token, tying their public key to the session for future access.

## Access
Home screen, "Whitelist" panel, right column labeled "Redeem_Invite (member)".

## Usage Steps
1. Receive an invite token from a host.
2. Paste the full token string into the "PASTE_INVITE_TOKEN" text area.
3. Click "Save_Membership".
4. A confirmation message appears: "WHITELISTED_FOR {vault-hash-prefix}".

## Options/Settings
None.

## Result
- A success message confirms the membership is saved.
- The counter at the bottom increments ("N active membership(s)").
- The member can now join the vault for which the invite was issued.

## Notes/Limitations
- The "Save_Membership" button is disabled until text is pasted.
- An invalid token produces "INVALID_INVITE_TOKEN".
- Memberships are stored locally in the browser. Clearing local storage removes them.