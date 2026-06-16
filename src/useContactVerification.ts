import { useState, useCallback, useMemo } from 'react';
import {
  ContactPins,
  ContactStatus,
  contactKey,
  contactStatus,
  loadPins,
  pinContact,
  savePins,
  unpinContact,
} from './contact-verification';

// Owns all TOFU-pin side effects (localStorage read/write) so components stay
// declarative. Derives a per-peer verification status from the live fingerprints
// reported by useRelay against the pins captured out of band.
export function useContactVerification(
  sessionId: string | null,
  fingerprints: Record<string, string>,
) {
  const [pins, setPins] = useState<ContactPins>(() => loadPins());

  // Pins the peer's CURRENT fingerprint as verified. Also serves as the
  // re-verification action after a key change — pinContact overwrites the pin.
  const verify = useCallback((peerId: string) => {
    if (!sessionId) return;
    const fp = fingerprints[peerId];
    if (!fp) return;
    setPins((prev) => {
      const next = pinContact(prev, contactKey(sessionId, peerId), fp);
      savePins(next);
      return next;
    });
  }, [sessionId, fingerprints]);

  const unverify = useCallback((peerId: string) => {
    if (!sessionId) return;
    setPins((prev) => {
      const next = unpinContact(prev, contactKey(sessionId, peerId));
      if (next === prev) return prev;
      savePins(next);
      return next;
    });
  }, [sessionId]);

  const statuses = useMemo(() => {
    const out: Record<string, ContactStatus> = {};
    if (!sessionId) return out;
    for (const peerId of Object.keys(fingerprints)) {
      out[peerId] = contactStatus(pins[contactKey(sessionId, peerId)], fingerprints[peerId]);
    }
    return out;
  }, [sessionId, fingerprints, pins]);

  // Peers whose pinned key no longer matches — messaging must block until each
  // is re-verified (or the pin is cleared).
  const changedPeers = useMemo(
    () => Object.keys(statuses).filter((id) => statuses[id] === 'changed'),
    [statuses],
  );

  return { statuses, changedPeers, verify, unverify };
}
