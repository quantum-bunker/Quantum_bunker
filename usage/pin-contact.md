# Pin Contact (Add Contact)

## Definition
Manually adds another user's public key as a trusted contact by pasting their trust link or member code.

## Purpose
To establish a trust relationship with a specific person so they can auto-join sessions without host approval.

## Access
Home screen, "Trusted_Contacts" panel, right column labeled "Add_Contact".

## Usage Steps
1. Obtain the other user's trust link (from their "Your_Trust_Handshake" panel) or member code (from their "Your_Member_Code" section).
2. On the home screen, locate the "Trusted_Contacts" panel.
3. Optionally type a label in the "LABEL" field to identify the contact.
4. Paste the trust link or member code into the "PASTE_TRUST_LINK_OR_MEMBER_CODE" text area.
5. Click "Pin_Contact".
6. The contact is added to the "Pinned" list below.

## Options/Settings
- **LABEL:** Optional display name for the contact.
- **PASTE_TRUST_LINK_OR_MEMBER_CODE:** Required. Accepts either a full trust link URL or a member code string.

## Result
- The contact appears in the pinned list with a shield icon.
- A green shield with "Pin intact" indicates the key matches.
- A red shield with "KEY MISMATCH" indicates possible impersonation or key rotation.
- Each pinned contact can be expanded (Manage) to issue auto-admit tokens or save incoming tokens.
- The contact can be removed by clicking the trash icon.

## Notes/Limitations
- An invalid input produces "INVALID_TRUST_PAYLOAD" in red text for 2.5 seconds.
- The "Pin_Contact" button is disabled until text is pasted.
- Pinned contacts are stored in browser local storage.