# Pin Contact (Add Contact)

## Definition

Manually adds another user's public key as a trusted contact by pasting their trust link or member code. Once pinned, the contact's key is tracked and any key change triggers an alert.

## Purpose

To establish a persistent trust record for a specific person. Pinned contacts enable contact verification (safety numbers) and integrate with the mutual whitelist flow in active sessions.

## Access

Home screen. "Trusted_Contacts" panel, right column labeled "Add_Contact".

## Usage Steps

1. Obtain the other user's trust link (from their "Your_Trust_Handshake" panel) or member code (from their "Your_Member_Code" section).
2. On the home screen, locate the "Trusted_Contacts" panel, right column ("Add_Contact").
3. Optionally type a label in the "LABEL" field. This name appears in your contacts list.
4. Paste the trust link or member code into the "PASTE_TRUST_LINK_OR_MEMBER_CODE" text area.
5. Click "Pin_Contact".

## Result

- The contact appears in the pinned contacts list with a shield icon.
- **Green shield / "Pin intact":** The key in your contacts list matches the key you just pasted.
- **Red shield / "KEY MISMATCH":** The key differs from a previously pinned entry for the same identity. This may indicate key rotation or impersonation.
- Each pinned contact can be expanded ("Manage") to issue auto-admit tokens or save incoming tokens for that contact.
- The contact can be removed by clicking the trash icon next to their entry.

## Notes/Limitations

- An invalid input shows "INVALID_TRUST_PAYLOAD" in red text for 2.5 seconds.
- The "Pin_Contact" button is disabled until text is entered in the paste field.
- Pinned contacts are stored in `localStorage`. Clearing browser data removes all contacts.
- Pinning is one-directional — you hold their key. For the mutual whitelist to work, both parties must pin each other.
