// Resolves the RTCConfiguration used for every peer connection.
//
// POLICY (STUN yes, TURN never):
//   * Media bytes MUST NEVER traverse a TURN relay. Relaying would put call /
//     file bandwidth on a server and defeat the zero-load design, so any
//     turn:/turns: URL is stripped from whatever is configured — the never-relay
//     invariant is enforced in code, not just by convention.
//   * Public STUN is ON by default. A STUN server learns an IP address and a
//     timestamp; it never sees media, signaling, or ciphertext, and it cannot
//     correlate the two peers of a session. Weighed against that: without
//     reflection the direct path only ever works between two devices on the same
//     LAN, which is why large files and calls failed everywhere else.
//   * Self-hosting STUN is not an option on the current deployment (Render has
//     no inbound UDP), so "run your own" is not a default that anyone can
//     actually take. Users who want zero reflection set the mode to `off` and
//     accept LAN-only; users who run their own point the setting (or
//     VITE_STUN_URL) at it.
//
// Resolution order, first non-empty wins:
//   user setting (localStorage) -> VITE_ICE_SERVERS -> VITE_STUN_URL -> defaults
// A user setting of `off` short-circuits to an empty list.

import { loadStunSetting, StunSetting } from '../stun-settings';

// Two independent operators so a single outage does not take reflection down.
// Both are anycast, free, and require no credentials.
export const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

function isRelayUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith('turn:') || u.startsWith('turns:');
}

// Enforces the never-relay invariant: drops every turn:/turns: URL from an ICE
// server list, and drops any server left with no usable URL.
export function stripRelayServers(servers: RTCIceServer[]): RTCIceServer[] {
  const out: RTCIceServer[] = [];
  for (const s of servers) {
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(u => !isRelayUrl(u));
    if (urls.length === 0) continue;
    out.push({ ...s, urls: urls.length === 1 ? urls[0] : urls });
  }
  return out;
}

export function parseIceServers(raw: string | undefined): RTCIceServer[] {
  if (!raw || !raw.trim()) return [];

  const text = raw.trim();
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.filter(s => s && typeof s === 'object' && 'urls' in s) as RTCIceServer[];
      }
    } catch {
      return [];
    }
    return [];
  }

  const urls = text.split(',').map(u => u.trim()).filter(Boolean);
  return urls.length ? [{ urls }] : [];
}

// The single resolver. `setting` is the per-device user choice; omitting it
// means "no user preference" and resolution falls through to the env vars and
// then the built-in defaults. TURN entries are stripped from every source.
export function resolveStunServers(
  env: Record<string, string | undefined>,
  setting?: StunSetting,
): RTCIceServer[] {
  if (setting?.mode === 'off') return [];
  if (setting?.mode === 'custom') {
    const custom = stripRelayServers([{ urls: setting.urls }]);
    if (custom.length) return custom;
  }

  const override = stripRelayServers(parseIceServers(env.VITE_ICE_SERVERS));
  if (override.length) return override;

  const raw = env.VITE_STUN_URL;
  if (raw && raw.trim()) {
    const urls = raw.split(',').map(u => u.trim()).filter(Boolean).filter(u => !isRelayUrl(u));
    if (urls.length) return [{ urls }];
  }

  return stripRelayServers(DEFAULT_STUN_SERVERS);
}

// True when the resolved config can reflect a public address at all. The
// failure diagnostics use this to tell "you turned STUN off" apart from "STUN
// was on and still could not punch a path".
export function hasStunConfigured(config: RTCConfiguration): boolean {
  return (config.iceServers ?? []).length > 0;
}

function readEnv(): Record<string, string | undefined> {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return meta.env ?? {};
}

// Pre-gathering a small pool shortens the time to a first usable candidate pair,
// which matters most on the relay-cold-start path where trickle ICE would
// otherwise begin only after signaling completes.
const ICE_CANDIDATE_POOL_SIZE = 4;

export function getIceConfig(): RTCConfiguration {
  return {
    iceServers: resolveStunServers(readEnv(), loadStunSetting()),
    iceCandidatePoolSize: ICE_CANDIDATE_POOL_SIZE,
  };
}

// ICE config for the direct media path (calls + streamed files). Identical
// policy to getIceConfig — both the call layer and the data mesh share one
// resolver so they can never disagree on reachability.
export function getP2PIceConfig(): RTCConfiguration {
  return getIceConfig();
}
