# Issue Invite (Generate Invite)

## Definition
A host-side tool that creates a one-time cryptographic token granting access to a specific session to a specific member.

## Purpose
To whitelist a member into a private vault without sharing the vault hash directly, and to tie access to the member's public key.

## Access
Home screen, "Whitelist" panel, middle column labeled "Issue_Invite (host)".

## Usage Steps
1. Obtain the member's code (from the "Your_Member_Code" section on their screen).
2. In the "MEMBER_CODE" field, paste the member's base64 public key string.
3. Select or type a vault hash ID:
   - If you have active host sessions, a dropdown lists them. Select the desired one.
   - Otherwise, type a vault hash ID manually into the "VAULT_HASH_ID" field.
4. Click "Generate_Invite".
5. A long token string appears. Click the copy button next to it.
6. Send this token to the member.

## Options/Settings
- **MEMBER_CODE:** Required. The recipient's public key string.
- **VAULT_HASH_ID:** Required. A dropdown (pre-filled from active host sessions) or manual text input.

## Result
- A base64-encoded invite token is generated and displayed.
- The token is copied to the clipboard on button click.
- The member redeems the token using "Redeem_Invite".

## Notes/Limitations
- The "Generate_Invite" button is disabled until a member code is entered.
- Only the host can issue invites. Members cannot invite other members.
- The invite token encodes both the vault ID and the member's public key.