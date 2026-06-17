# Member Code

## Definition

A read-only public key string that cryptographically identifies you to hosts and other users. Hosts use this code to issue whitelist membership tokens.

## Purpose

To share your cryptographic identifier with a session host so they can pre-authorize you with a membership token, or with anyone who wants to add you as a trusted contact.

## Access

Home screen. "Whitelist" panel, left column under "Your_Member_Code". Also visible in the chat room sidebar when in an active session.

## Usage Steps

1. On the home screen, find the "Whitelist" panel.
2. Locate the "Your_Member_Code" section. A long base64url-encoded string is shown — this is your current public key.
3. Click the copy button next to the code.
4. Send this code to the session host.

## Result

- The code is copied to the clipboard.
- The copy button shows a checkmark icon for ~2 seconds to confirm success.
- The host pastes this code into the "Issue_Invite" section to generate a whitelist token for you.

## Notes/Limitations

- The member code is your **public key** — it is not secret. Sharing it does not expose your private key or give anyone access to your messages.
- If you are using a burner key (no long-term identity), your member code changes with each new session. Whitelist tokens issued for a previous burner key will not work in future sessions. Use a long-term identity for stable membership. See `usage/create-long-term-identity.md`.
- The member code and the public key shown in your "Your_Trust_Handshake" panel are the same key, just presented differently.
