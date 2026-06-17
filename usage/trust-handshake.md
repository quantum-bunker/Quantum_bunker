# Trust Handshake

## Definition

Generates a shareable link and QR code containing your public key. When a recipient opens the link, your key is automatically pinned to their trusted contacts list.

## Purpose

To establish a one-directional trust relationship without manual key copying. Share your trust link with someone out-of-band (in person, over a phone call, via a secondary channel). Both parties share their own links to establish mutual trust.

## Access

Home screen. "Trusted_Contacts" panel, left column labeled "Your_Trust_Handshake".

## Usage Steps

**Share via link:**
1. On the home screen, find the "Trusted_Contacts" panel.
2. Optionally type a label into the "YOUR_LABEL (OPTIONAL)" field. This label appears in the recipient's contacts list as the display name for your key.
3. Click "Copy_Link". The trust URL is copied to the clipboard.
4. Send the link to the recipient through a trusted out-of-band channel.
5. When they open the link, your key is automatically pinned and the `?trust=` parameter is stripped from their URL.

**Share via QR code:**
1. Have the recipient open their camera or QR scanner.
2. Point it at the QR code displayed on the left side of the panel.
3. Their device opens the trust URL and pins your key.

## Result

- A trust URL with format `http://{domain}/?trust={base64url-encoded-payload}` is generated from your current public key.
- The link encodes your public key and optional label. No private key material is included.
- The recipient's browser processes the `?trust=` parameter silently and adds your key to their contacts.
- The "Copy_Link" button shows a checkmark for 2 seconds to confirm the copy.

## Notes/Limitations

- The trust handshake is **one-directional**. The recipient gets your key, but you do not get theirs. Each party must share their own trust link for mutual trust.
- The link contains only your public key — it is not a secret. However, sharing it means the recipient can identify and whitelist you.
- If you are using a burner key (no long-term identity), the trust link changes with each new session. Use a long-term identity for stable trust links. See `usage/create-long-term-identity.md`.
- Links are processed automatically when the URL contains the `?trust=` parameter.
