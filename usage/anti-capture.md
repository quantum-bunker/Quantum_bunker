# Anti-Capture Mode

## Definition
A security toggle that provides two protections: a black overlay when the browser window loses focus or a screenshot key is detected, and a strobing effect on message text to disrupt photography.

## Purpose
To obstruct screen capturing through screenshots, cameras, or screen-sharing that relies on the Meta key or PrintScreen key.

## Access
Desktop: The "Anti-Capture" checkbox in the header bar, left of the theme toggle. Mobile: The hamburger menu, under "Security Settings" → "Anti-Capture Mode".

## Usage Steps
**Desktop:**
1. In the header bar, check the "Anti-Capture" checkbox to enable the mode.
2. A full-screen black overlay appears when:
   - The browser window loses focus (user switches tabs or windows).
   - The Meta key (Windows/Super key, Command on Mac) is pressed.
   - The PrintScreen key is pressed.
3. Message text in the chat room strobes rapidly to disrupt camera capture.
4. Uncheck the checkbox to disable.

**Mobile:**
1. Tap the hamburger menu icon in the header.
2. Under "Security Settings", check "Anti-Capture Mode".
3. The same protections apply.

## Options/Settings
- **Enabled (checked):** Black overlay on blur/Meta/PrintScreen events. Message text strobes.
- **Disabled (unchecked):** No overlay. No strobe effect.

## Result
- When the user presses Meta or PrintScreen, or switches away from the browser, a solid black overlay covers the entire page.
- Message text in the chat room flickers rapidly, making it difficult to capture with a camera.
- Focus-based overlay only applies while inside a chat room, not on the home screen.

## Notes/Limitations
- The overlay is CSS-only (pointer-events-none). It does not prevent operating-system-level screenshots.
- Detection of PrintScreen and Meta key relies on browser keyboard events, which may not work in all browsers or contexts.
- The strobe animation is a CSS effect and does not interfere with DOM access or dev tools inspection.
- The setting applies globally to all sessions.