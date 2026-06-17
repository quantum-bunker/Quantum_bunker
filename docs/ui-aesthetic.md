# UI Aesthetic

## Design Philosophy

The UI should feel like purpose-built secure communication software, not a consumer chat app. Themes differ in **layout feel and visual weight**, not just color. Switching themes should feel like switching between different applications.

---

## Themes

### Cyberpunk (Default)

The primary aesthetic. High-contrast, neon-on-dark.

| Token | Value |
|---|---|
| Primary accent | Cyan `#22d3ee` |
| Secondary accent | Orange `#f97316` |
| Background | Near-black |
| Typography | `font-mono` throughout |
| Vibe | Tactical, immersive, slightly intimidating |

Panels use subtle borders and glow effects. Active states use cyan. Destructive actions use orange. Animations are subtle — no gratuitous motion.

### Halo

Military/tactical aesthetic. Darker, more muted, with a command-center feel.

- Lower contrast than Cyberpunk
- Sans-serif for body text, mono for data fields
- Heavier use of structural borders

### Classic

Clean and minimal. Reduced visual noise for users who prefer a simpler interface.

- Lighter backgrounds, standard contrast
- Less decoration on panels
- Conventional chat app feel while preserving all security features

---

## Typography

- **Labels and identifiers** (`font-mono`): session IDs, peer IDs, vault hashes, fingerprints, timestamps
- **UI text** (`font-mono` in Cyberpunk/Halo, sans-serif in Classic): panel headings, button labels
- **Message text**: inherits from theme

All uppercase label conventions (`VAULT_HASH_ID`, `PEER`, `STATUS`) are intentional — they signal system fields, not user-facing prose.

---

## Animation Principles

- Prefer transition effects on state changes (panel open/close, message appear)
- No looping or idle animations
- Motion should communicate state, not decorate
- Framer Motion is the animation library; use `AnimatePresence` for enter/exit transitions

---

## Layout Structure

**Home screen:** Three-column layout (vault controls / identity+whitelist / vault history). Collapses to single column on mobile.

**Chat room:**
- Left sidebar: Active Session panel, Relay Interface, Search Messages, Share Vault, Verify Contacts
- Center: Message list + input bar
- Right sidebar (or expandable): Event Log

**Responsive:** All panels collapse into a hamburger menu on mobile. Security controls (blur toggle) move into the menu.

---

## Color Usage Rules

| Use case | Color |
|---|---|
| Interactive primary (create, send, connect) | Cyan `#22d3ee` |
| Destructive action (destroy, kick, forget) | Orange `#f97316` |
| Success / verified | Green |
| Warning / unverified | Amber |
| Error / key mismatch | Red |
| System fields / metadata | Muted (low contrast) |

Never use red for non-security-critical actions. Reserve it for key-change alerts and critical failures.

---

## Writing Style

UI labels use `SCREAMING_SNAKE_CASE` for system identifiers and action names (`VAULT_HASH_ID`, `CREATE_BUNKER`, `DESTROY_SESSION`). Descriptive text in panels uses normal sentence case. This contrast distinguishes system-generated data from human-readable context.
