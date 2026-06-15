# Theme Toggle

## Definition
Switches the application between light and dark color modes.

## Purpose
To accommodate user preference for display brightness and contrast.

## Access
Header bar, right side, button with a sun or moon icon. Labelled "Toggle theme".

## Usage Steps
1. Locate the theme toggle button in the header bar (moon icon = light mode, sun icon = dark mode).
2. Click the button.
3. The entire interface switches color scheme immediately.

## Options/Settings
- **Light mode:** Light background with dark text. Moon icon displayed.
- **Dark mode:** Dark background with light text. Sun icon displayed. This is the default.

## Result
- All UI elements, panels, and chat messages change to the selected theme.
- The selected theme persists across page reloads. It is saved in browser local storage under the key `qb-theme`.
- The theme applies to the home screen and chat room equally.

## Notes/Limitations
- The theme setting is stored per-browser, not per-session or per-vault.
- Default is dark mode on first visit.