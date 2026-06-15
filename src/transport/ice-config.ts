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

// Free, public STUN — no TURN. STUN only reflects a peer's public address so
// the two browsers can attempt a direct hole-punched connection; it relays no
// media and costs nothing. A TURN relay would route the bytes (defeating the
// zero-server-bandwidth goal) so it is intentionally absent: if a direct path
// cannot be punched, the media send fails visibly rather than relaying.
const DEFAULT_STUN_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

// ICE config for the direct media path. Defaults to public STUN so peers behind
// different NATs can connect; operators may override (or add TURN at their own
// cost) via VITE_ICE_SERVERS. This deliberately differs from getIceConfig(),
// whose empty default keeps the relay-only text path from leaking any IP.
export function getP2PIceConfig(): RTCConfiguration {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  const override = parseIceServers(meta.env?.VITE_ICE_SERVERS);
  return { iceServers: override.length ? override : DEFAULT_STUN_SERVERS };
}
