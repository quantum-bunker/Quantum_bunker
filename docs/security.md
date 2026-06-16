# Security & Privacy

- **Zero-knowledge backend**: Server sees envelopes but not contents.
- **Capture deterrents**:
  - UI blackout when the window loses focus (always on in chat).
  - Optional message-level blur-to-reveal, scoped strictly to text bubbles (persisted via `qb-blur`).
  - (The ineffective anti-capture strobe was removed — see `usage/anti-capture.md`.)
- **Access Control**: Host accepts/rejects joins. Host recovery tokens via `localStorage`.
  Mutual-consent whitelist: peers whitelist each other in-chat (both must accept); a
  newcomer joins a whitelist group only if mutually whitelisted with every member.
- **TTL**: Messages disappear client-side after 5 minutes.
