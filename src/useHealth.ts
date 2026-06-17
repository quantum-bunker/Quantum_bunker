import { useEffect, useState } from 'react';

type Health = { online: boolean; latencyMs: number | null };

// Polls the relay's /api/health so the home screen can report a real reachability
// state and round-trip latency instead of decorative, hard-coded numbers. There
// is no WebSocket on the landing view, so this lightweight ping is the only
// honest signal available before a session exists.
export function useHealth(intervalMs = 30000): Health {
  const [health, setHealth] = useState<Health>({ online: false, latencyMs: null });

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      const started = performance.now();
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (cancelled) return;
        const latencyMs = Math.round(performance.now() - started);
        setHealth({ online: res.ok, latencyMs });
      } catch {
        if (!cancelled) setHealth({ online: false, latencyMs: null });
      }
    };

    ping();
    const id = setInterval(ping, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);

  return health;
}
