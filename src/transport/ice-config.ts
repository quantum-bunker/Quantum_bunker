// Resolves the RTCConfiguration used for every peer connection.
//
// POLICY (operator chose: STUN-only, never relay):
//   * Media bytes MUST NEVER traverse a TURN relay. Relaying would put call /
//     file bandwidth on a server and defeat the zero-load design, so any
//     turn:/turns: URL is stripped from whatever an operator configures — the
//     never-relay invariant is enforced in code, not just by convention.
//   * NO third-party STUN is ever hardcoded. A public STUN server (Google,
//     Cloudflare, …) would reflect the user's public IP to that third party,
//     which breaks the "can't make it known" requirement. STUN reflection is
//     near-zero load (a single packet, no media), so an operator who wants
//     cross-network connectivity points VITE_STUN_URL (or VITE_ICE_SERVERS) at
//     a STUN server THEY run — no outside party, no media load.
//   * Unconfigured default is an EMPTY list: peers connect via host candidates
//     only (LAN / same network) and nothing leaks anywhere. Cross-network calls
//     behind symmetric/mobile NAT cannot be punched without a relay and will
//     surface an error rather than silently falling back to one.

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

// The single STUN-only resolver. Operators provide their OWN STUN via either the
// full VITE_ICE_SERVERS JSON/list or the convenience VITE_STUN_URL (one or more
// comma-separated stun: URLs). TURN entries are stripped from both. Returns an
// empty list (host-candidates only) when nothing is configured.
export function resolveStunServers(env: Record<string, string | undefined>): RTCIceServer[] {
  const override = stripRelayServers(parseIceServers(env.VITE_ICE_SERVERS));
  if (override.length) return override;

  const raw = env.VITE_STUN_URL;
  if (raw && raw.trim()) {
    const urls = raw.split(',').map(u => u.trim()).filter(Boolean).filter(u => !isRelayUrl(u));
    if (urls.length) return [{ urls }];
  }
  return [];
}

function readEnv(): Record<string, string | undefined> {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return meta.env ?? {};
}

export function getIceConfig(): RTCConfiguration {
  return { iceServers: resolveStunServers(readEnv()) };
}

// ICE config for the direct media path (calls + streamed files). Identical
// STUN-only policy as getIceConfig — both the call layer and the data mesh share
// one resolver so they can never disagree on reachability.
export function getP2PIceConfig(): RTCConfiguration {
  return { iceServers: resolveStunServers(readEnv()) };
}
