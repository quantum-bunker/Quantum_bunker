# Trust Handshake

## Definition
Generates a shareable link and QR code containing the user's public key. Recipients who open the link automatically pin the sender's key as a trusted contact.

## Purpose
To establish a one-directional trust relationship by sharing a cryptographic key, bypassing the need for member codes and invite tokens.

## Access
Home screen, "Trusted_Contacts" panel, left column labeled "Your_Trust_Handshake".

## Usage Steps
1. On the home screen, locate the "Trusted_Contacts" panel.
2. Optionally type a label into the "YOUR_LABEL (OPTIONAL)" field. This label is attached to the link payload.
3. Share using one of two methods:
   - **QR code:** Have the recipient scan the QR code displayed on the left.
   - **Share link:** Click "Copy_Link" to copy the trust URL to the clipboard. Send this link to the recipient.
4. When the recipient opens the link, the sender's public key is pinned to their contact list.

## Options/Settings
- **YOUR_LABEL (OPTIONAL):** A display name included in the trust payload. The recipient sees this label.

## Result
- A trust link with format `http://{domain}/?trust={base64-encoded-payload}` is generated.
- The "Copy_Link" button shows a checkmark for 2 seconds after copying.
- The recipient's browser automatically pins the sender's key on link open.

## Notes/Limitations
- The trust handshake is one-directional. The other party must share their own trust handshake to establish mutual trust.
- The link contains only a public key. No secrets are transmitted.
- Links opened via a `?trust=` parameter are processed silently and the parameter is stripped from the URL.