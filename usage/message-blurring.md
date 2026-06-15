# Message Blurring

## Definition
A security toggle that blurs all message content in the chat room by default. The message becomes readable only when the user hovers the mouse pointer over it.

## Purpose
To prevent shoulder-surfing and accidental exposure of message content when the screen is visible to others.

## Access
Desktop: The "Blur" checkbox in the header bar, left of the theme toggle. Mobile: The hamburger menu, under "Security Settings".

## Usage Steps
**Desktop:**
1. In the header bar, check the "Blur" checkbox to enable blurring (checked by default).
2. All messages in the chat room appear blurred.
3. Hover over any message to temporarily reveal its content.
4. Uncheck the checkbox to disable blurring permanently.

**Mobile:**
1. Tap the hamburger menu icon in the header.
2. Under "Security Settings", check or uncheck "Message Blurring".
3. The setting takes effect immediately.

## Options/Settings
- **Enabled (checked):** Messages are blurred. Hover reveals content.
- **Disabled (unchecked):** Messages are shown in full. No hover interaction required.

## Result
- With blurring on, message text is visually obscured until hovered.
- The setting persists within the current browser session but is not persisted across page reloads.

## Notes/Limitations
- Blurring is visual only. It does not encrypt or hide content in the DOM or dev tools.
- The setting applies globally to all sessions. It is not per-vault.
- On mobile devices without hover capability, this feature may not provide effective protection.