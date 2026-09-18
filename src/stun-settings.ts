// User-controlled STUN policy, persisted per device. Follows the same
// localStorage convention as qb-theme / qb-blur (preferences tier per
// CLAUDE.md) and the same load/save store shape as contacts-store.ts.
//
// STUN reflection is the only way a peer behind NAT learns its own public
// address, and without it the direct path only works between two devices on the
// same LAN. That reflection tells the STUN operator an IP and a timestamp — it
// never carries content or media — so the tradeoff is exposed here as a setting
// rather than being decided for the user.

export const STUN_KEY = 'qb-stun';

//   default — built-in public STUN servers (see DEFAULT_STUN_SERVERS)
//   custom  — only the URLs the user supplied
//   off     — no ICE servers at all: host candidates only, LAN-only, nothing
//             leaves the local network
export type StunMode = 'default' | 'custom' | 'off';

export interface StunSetting {
  mode: StunMode;
  urls: string[];
}

export const DEFAULT_STUN_SETTING: StunSetting = { mode: 'default', urls: [] };

// Only stun:/stuns: is accepted. turn:/turns: is refused at input because media
// must never traverse a relay; ice-config strips it again at resolve time so
// the invariant holds even for values written by an older build.
export function isStunUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith('stun:') || u.startsWith('stuns:');
}

export function parseStunUrls(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map(u => u.trim())
    .filter(Boolean)
    .filter(isStunUrl)
    .slice(0, 8);
}

export function loadStunSetting(): StunSetting {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STUN_KEY);
  } catch {
    return DEFAULT_STUN_SETTING;
  }
  if (!raw) return DEFAULT_STUN_SETTING;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_STUN_SETTING;
    const o = parsed as Record<string, unknown>;
    const mode: StunMode = o.mode === 'custom' || o.mode === 'off' ? o.mode : 'default';
    const urls = Array.isArray(o.urls)
      ? (o.urls as unknown[]).filter((u): u is string => typeof u === 'string' && isStunUrl(u)).slice(0, 8)
      : [];
    // A custom mode with nothing usable left would silently mean "off"; fall
    // back to the built-in servers instead of quietly disabling connectivity.
    if (mode === 'custom' && urls.length === 0) return DEFAULT_STUN_SETTING;
    return { mode, urls };
  } catch {
    return DEFAULT_STUN_SETTING;
  }
}

export function saveStunSetting(setting: StunSetting): void {
  try {
    localStorage.setItem(STUN_KEY, JSON.stringify(setting));
  } catch {
    // Storage denied (private mode / quota): the setting applies to this tab
    // only. Connectivity still works off the in-memory value.
  }
}

export function describeStunMode(setting: StunSetting): string {
  if (setting.mode === 'off') return 'Off — LAN only, no address reflection';
  if (setting.mode === 'custom') return `${setting.urls.length} custom server${setting.urls.length === 1 ? '' : 's'}`;
  return 'Public STUN (default)';
}
