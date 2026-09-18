import { SessionPeer } from '../../../shared/contracts/v1/session';
import { SESSION_LIMITS } from '../constants';

// A peer that drops keeps its slot — and its token — for the reconnect grace
// window, so a refresh or a flaky link does not cost it host re-approval. Past
// that window the slot is reclaimed; otherwise a vault that ten people passed
// through reports "Session full" forever while showing an empty roster.
export function stalePeerIds(
  peers: Record<string, SessionPeer>,
  connected: ReadonlySet<string>,
  hostId: string,
  now: number,
  graceMs: number = SESSION_LIMITS.RECONNECT_GRACE_MS,
): string[] {
  const cutoff = now - graceMs;
  const stale: string[] = [];
  for (const id of Object.keys(peers)) {
    if (id === hostId) continue;
    if (connected.has(id)) continue;
    const peer = peers[id];
    if (peer && peer.lastSeenAt > cutoff) continue;
    stale.push(id);
  }
  return stale;
}
