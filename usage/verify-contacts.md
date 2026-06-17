# Verify Contacts

## Definition

A panel that displays safety numbers and key fingerprints for connected peers. Users compare these values out-of-band (phone call, in-person) to confirm the cryptographic handshake is with the intended person.

## Purpose

To detect man-in-the-middle attacks. The relay server — or an attacker who has compromised it — could theoretically substitute a different public key during the Noise Protocol handshake. Comparing safety numbers out-of-band is the only defense against this attack, since it requires a second trusted communication channel.

## Access

Left sidebar of the chat room. Panel labeled "Verify Contacts". Appears after at least one peer has completed the Noise Protocol handshake.

## Usage Steps

**Verify a peer:**
1. Wait for the Noise Protocol handshake to complete. The peer appears in the panel with a safety number.
2. Contact the peer through a separate trusted channel (phone call, in-person conversation, another messaging app).
3. Have the peer read their safety number from their "Verify Contacts" panel on their device.
4. Compare the number they read to the number shown on your screen. They must match exactly.
5. If they match, click "Verify contact" under that peer's entry.
6. The peer's status changes to "Verified" with a green shield icon.

**Unverify a peer:**
1. Click "Unverify" under a previously verified peer.
2. The status returns to "Unverified".

**Respond to a key change alert:**
1. If a pinned peer's public key changes since last verification, a full-screen red overlay appears titled "Key Changed — Possible Interception".
2. The overlay blocks all messaging until you act.
3. Contact the peer out-of-band to confirm their new safety number.
4. If confirmed: click "I confirmed it — re-verify".
5. If you cannot confirm or suspect interception: click "Clear pin" to remove the contact pin and exit the overlay. Do not continue messaging until the situation is resolved.

## Fields

| Status | Icon | Meaning |
|---|---|---|
| Verified | Green shield | Safety number matched and confirmed out-of-band |
| Unverified | Amber question-mark shield | Handshake complete but not yet verified |
| Key Changed | Red alert shield | Key differs from the pinned key; possible interception |

Your own fingerprint is shown at the top of the panel for sharing with your contact.

## Notes/Limitations

- The panel is empty and shows a prompt until at least one peer completes the Noise handshake.
- Safety numbers and fingerprints are derived from the Noise handshake remote static key. Any change in key signals a new handshake — possibly due to relay-level interception or simply because the peer regenerated their key.
- Verification status is stored in the browser session only. It is lost on page reload. A key-change alert will reappear if the pinned key still differs after reload.
- Skipping verification is a choice, not an error. Unverified sessions are still end-to-end encrypted; verification only confirms identity.
