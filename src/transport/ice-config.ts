// Resolves the RTCConfiguration used for every peer connection.
//
// Default is an EMPTY iceServers list: peers connect via host candidates only
// (LAN / localhost / same network) and no public IP is leaked to any third
// party. Operators who need NAT traversal set VITE_ICE_SERVERS to either a JSON
// array of RTCIceServer objects or a comma-separated list of URLs.

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

export function getIceConfig(): RTCConfiguration {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return { iceServers: parseIceServers(meta.env?.VITE_ICE_SERVERS) };
}

// Multiple public STUN servers. STUN reflects public addresses so browsers can
// attempt direct hole-punching. Multiple entries increase resilience when one
// provider is slow or blocked, but STUN alone cannot traverse symmetric NATs —
// peers on different carrier/VPN networks require a TURN relay (see below).
const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// Build TURN entry from convenience env vars, as an alternative to the full
// VITE_ICE_SERVERS JSON. Set VITE_TURN_URL (e.g. "turn:myserver.com:3478"),
// VITE_TURN_USERNAME, and VITE_TURN_CREDENTIAL.
function getTurnFromEnv(env: Record<string, string | undefined>): RTCIceServer[] {
  const url = env.VITE_TURN_URL;
  if (!url) return [];
  const entry: RTCIceServer = { urls: url };
  if (env.VITE_TURN_USERNAME) entry.username = env.VITE_TURN_USERNAME;
  if (env.VITE_TURN_CREDENTIAL) entry.credential = env.VITE_TURN_CREDENTIAL;
  return [entry];
}

// ICE config for the direct media path. Defaults to multiple public STUN servers
// so peers on the same or compatible NAT types can connect. Operators add TURN
// via VITE_ICE_SERVERS (full JSON) or VITE_TURN_URL / VITE_TURN_USERNAME /
// VITE_TURN_CREDENTIAL (convenience vars) for cross-network calls behind
// symmetric NATs. TURN relays media bytes — an explicit operator opt-in.
export function getP2PIceConfig(): RTCConfiguration {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  const env = meta.env ?? {};
  const override = parseIceServers(env.VITE_ICE_SERVERS);
  if (override.length) return { iceServers: override };
  const turn = getTurnFromEnv(env);
  return { iceServers: [...DEFAULT_STUN_SERVERS, ...turn] };
}
