# Verify Contacts

## Definition
A security verification panel that displays safety numbers and fingerprints for connected peers. Users compare these values out-of-band to confirm end-to-end encryption integrity and detect man-in-the-middle attacks.

## Purpose
To validate that the peer connected via the relay is the intended person, not an impostor. Verification is the only defense against a compromised or malicious relay server.

## Access
Left sidebar of the chat room, panel labeled "Verify Contacts".

## Usage Steps

**Verify a peer:**
1. While in a chat room with at least one connected peer, locate the "Verify Contacts" panel.
2. After the Noise Protocol handshake completes, each peer appears with a safety number and fingerprint.
3. Contact the peer through a separate trusted channel (call, in-person, another messaging app).
4. Have the peer read their safety number from their "Verify Contacts" panel.
5. Compare the safety number shown on your screen with what the peer reads. They must match exactly.
6. If they match, click "Verify contact" under that peer's entry.
7. The peer's status changes to "Verified" with a green shield icon.

**Unverify a peer:**
1. Click "Unverify" under a previously verified peer.
2. The status reverts to "Unverified".

**Re-verify after a key change:**
1. If a peer's key changes, a full-screen red overlay appears with the title "Key Changed — Possible Interception".
2. The overlay blocks all messaging until action is taken.
3. Contact the peer out-of-band to confirm the new safety number.
4. If confirmed, click "I confirmed it — re-verify".
5. Alternatively, click "Clear pin" to remove the contact's pin and exit the overlay.

## Options/Settings
None.

## Result
- Verified peers show a green "Verified" label with a shield icon.
- Unverified peers show an amber "Unverified" label with a question-mark shield.
- Peers whose key has changed since last verification show a red "Key Changed" label with an alert shield.
- The user's own fingerprint is displayed at the top of the panel for comparison.

## Notes/Limitations
- The "Verify Contacts" panel only populates after at least one peer has completed the Noise Protocol handshake.
- Before handshake, the panel shows "Peers appear here after the handshake. Compare the safety number out of band, then verify."
- Safety numbers and fingerprints are derived from cryptographic key exchange. Any change indicates a new key was negotiated — possibly due to relay interception.
- Verification status is stored in the browser session only. It does not persist across page reloads.