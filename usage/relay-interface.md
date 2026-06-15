# Relay Interface Panel

## Definition
A read-only panel in the chat room sidebar that lists the current cryptographic and relay properties of the active session.

## Purpose
To confirm the security posture of the current session at a glance.

## Access
Left sidebar of the chat room, panel labeled "Relay Interface".

## Usage Steps
- No action required. Values are displayed automatically.

## Options/Settings
None.

## Result
The panel displays four read-only fields:
- **ENVELOPE_TYPE:** Shows "LOCKED" when the relay is configured for encrypted envelopes.
- **SESSION_MEMORY:** Shows "Ephem" — confirms the session is memory-only (ephemeral).
- **ZERO_KNOWLEDGE:** Shows "ACTIVE" — confirms the server cannot decrypt message payloads.
- **MSG_CRYPTO:** Shows "DoubleRatchet" — confirms the double-ratchet encryption protocol is in use.

## Notes/Limitations
- All values are static indicators and do not change during a session.
- These values reflect the configuration, not runtime guarantees.