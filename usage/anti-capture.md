# Anti-Capture Mode (Removed)

## Status
**Removed.** The anti-capture strobe was a CSS-only effect that flickered message text
to "disrupt" cameras. It did not actually prevent screenshots, screen recording, or
photography, so it was removed to avoid implying a protection that did not exist.

## What remains
The genuinely useful capture deterrents are still present and are not part of this toggle:

- **Window-blur blackout:** while inside a chat room, a full-screen black overlay covers
  the page whenever the browser window loses focus (tab switch, another window, or a
  Meta/PrintScreen key event). This is always on in chat — there is no toggle.
- **Message blur-to-reveal:** the **Blur** toggle (header bar on desktop, hamburger menu on
  mobile) blurs message bubbles until you hover/touch them. This preference now persists
  across reloads (`localStorage` key `qb-blur`).

## Migration notes
- The "Anti-Capture" checkbox (desktop header and mobile Security Settings) has been removed.
- The `@keyframes strobe` animation has been removed from `src/index.css`.
- `securityOptions` no longer carries an `antiCapture` field — it is now `{ blur: boolean }`.
