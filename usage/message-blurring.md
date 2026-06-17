# Message Blurring

## Definition

A security toggle that blurs all message content in the chat room by default. The message text becomes readable only when the user hovers the mouse pointer over it (desktop) or taps it (mobile).

## Purpose

To prevent shoulder-surfing and accidental exposure of message content when the screen is visible to others nearby.

## Access

- **Desktop:** The "Blur" checkbox in the header bar, left of the theme toggle.
- **Mobile:** The hamburger menu, under "Security Settings".

## Usage Steps

**Enable blurring:**
1. Check the "Blur" checkbox in the header (desktop) or in the hamburger menu (mobile).
2. All messages in the chat room appear visually obscured.
3. Hover over any message (desktop) or tap it (mobile) to temporarily reveal its content.

**Disable blurring:**
1. Uncheck the "Blur" checkbox.
2. All messages are displayed in full with no hover interaction required.

## Result

- With blurring on, message text is visually obscured until hovered or touched.
- The preference persists across page reloads and browser restarts. It is saved in `localStorage` under the key `qb-blur`.
- The setting is global — it applies to all vaults and all sessions.

## Notes/Limitations

- Blurring is visual only. It does not encrypt or hide content in the DOM or browser developer tools.
- On mobile devices without reliable hover, this feature provides limited protection. Use the always-on window blur blackout (activates when the app loses focus) as the primary mobile deterrent.
- The setting is stored per-browser, not per-vault.
