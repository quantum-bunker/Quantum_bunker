# Anti-Capture Mode (Removed)

## Status

**Removed.** The anti-capture strobe was a CSS `@keyframes` animation that flickered message text to "disrupt" screen capture. It did not prevent screenshots, screen recording, or photography. It was removed to avoid implying a protection that did not exist.

## What Remains

Two genuine capture deterrents are still present and are not configurable:

**Window-blur blackout** — always active inside the chat room. A full-screen opaque overlay covers the entire page whenever the browser window loses focus: tab switch, alt-tab, another window coming to the foreground, or a Meta/PrintScreen key event. There is no toggle for this — it is always on in chat.

**Message blur-to-reveal** — controlled by the "Blur" toggle (header bar on desktop, hamburger menu on mobile). When enabled, message bubbles are visually blurred until hovered or tapped. This preference persists across reloads via `localStorage` key `qb-blur`. See `usage/message-blurring.md`.

## Migration Notes

- The "Anti-Capture" checkbox has been removed from the desktop header and mobile Security Settings menu.
- The `@keyframes strobe` animation has been removed from `src/index.css`.
- `securityOptions` no longer carries an `antiCapture` field. The shape is now `{ blur: boolean }`.
