# Theme Toggle

## Definition

Switches the application between three visual themes: Cyberpunk (default), Halo, and Classic.

## Purpose

To let users choose a visual style that suits their preference or context, from the high-contrast neon default to a cleaner minimal look.

## Access

Header bar, right side. A button cycles through themes and shows the current theme name.

## Themes

| Theme | Description |
|---|---|
| **Cyberpunk** | Default. Neon cyan and orange on dark background, monospace font throughout, high-contrast tactical aesthetic. |
| **Halo** | Military/command-center aesthetic. Darker, more muted, structural borders. |
| **Classic** | Clean and minimal. Reduced visual decoration, standard contrast. |

## Usage Steps

1. Locate the theme toggle button in the header bar.
2. Click the button to cycle to the next theme.
3. The entire interface updates immediately.

## Result

- All UI elements, panels, and chat messages update to the selected theme.
- The selection persists across page reloads and browser restarts. It is saved in `localStorage` under the key `qb-theme`.
- The theme applies to both the home screen and the chat room.

## Notes/Limitations

- The theme setting is stored per-browser, not per-session or per-vault.
- Default is Cyberpunk on first visit.
- All three themes provide the full feature set — themes change appearance only.
