# Issue Invite (Generate Invite)

## Definition

A host-side tool that creates a cryptographically signed membership token granting a specific member access to a specific session. The member can join that session automatically without requiring host approval at join time.

## Purpose

To pre-authorize a trusted person for a session, so they do not appear in the join request queue and the host does not need to be online to approve them.

## Access

Home screen. "Whitelist" panel, middle column labeled "Issue_Invite (host)".

## Prerequisite

You must have created the session with a host public key (long-term identity enabled) to use stateless whitelisting. If you created the session without a public key, the token will not be accepted by the server.

## Usage Steps

1. Obtain the member's code from the "Your_Member_Code" section on their home screen. They paste it to you via any channel.
2. Paste the member's base64url public key string into the "MEMBER_CODE" field.
3. Select the target session:
   - If you have active host sessions, a dropdown lists them. Select the desired one.
   - Otherwise, type the vault hash ID manually into the "VAULT_HASH_ID" field.
4. Click "Generate_Invite".
5. A long base64url token string appears. Click the copy button next to it.
6. Send the token to the member through any channel (it does not need to be secret).

## Result

- A signed `MembershipToken` is generated: an Ed25519 signature over `{ memberPublicKey, sessionId }` using your host private key.
- The token is displayed and copied to the clipboard.
- The member redeems this token using "Redeem_Invite" to save it in their browser.
- On their next join, the token is presented automatically and they are admitted without host interaction.

## Notes/Limitations

- The "Generate_Invite" button is disabled until a member code is entered.
- Only hosts with a long-term identity can issue stateless whitelist tokens.
- The token is bound to one specific member key and one specific session. It cannot be transferred or reused for a different session.
- The token itself is not secret — it cannot be used without the matching private key from the member's side.
