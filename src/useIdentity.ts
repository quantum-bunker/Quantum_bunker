import { useCallback, useState } from 'react';
import { KeyPair } from './crypto/noise-xx';
import { sha256 } from './crypto/noise-primitives';
import {
  hasLongTermIdentity,
  createLongTermIdentity,
  unlockLongTermIdentity,
  promoteSessionIdentity,
  clearLongTermIdentity,
  detectSessionIdentity,
} from './crypto/identity-store';

// Owns the lifetime/source of the Noise static identity for the UI. The
// resolved `identity` is fed into useRelay → PeerChannels:
//   null         → burner: PeerChannels generates a fresh per-session key.
//   KeyPair      → long-term: the stable, encrypted-at-rest key is reused.
// Long-term identity is opt-in; until the user unlocks/creates one we stay on
// the burner path so the app is usable with no passphrase.

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function useIdentity() {
  const [exists, setExists] = useState<boolean>(hasLongTermIdentity);
  const [migratableSessionId, setMigratable] = useState<string | null>(detectSessionIdentity);
  const [identity, setIdentity] = useState<KeyPair | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fingerprint = identity ? toHex(sha256(identity.publicKey)) : null;

  const adopt = useCallback((kp: KeyPair) => {
    setIdentity(kp);
    setExists(true);
    setMigratable(null);
    setError(null);
  }, []);

  const create = useCallback(async (passphrase: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      adopt(await createLongTermIdentity(passphrase));
      return true;
    } catch {
      setError('Could not create identity');
      return false;
    } finally {
      setBusy(false);
    }
  }, [adopt]);

  const unlock = useCallback(async (passphrase: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const kp = await unlockLongTermIdentity(passphrase);
      if (!kp) {
        setError('Wrong passphrase');
        return false;
      }
      adopt(kp);
      return true;
    } finally {
      setBusy(false);
    }
  }, [adopt]);

  const promote = useCallback(async (passphrase: string): Promise<boolean> => {
    if (!migratableSessionId) return false;
    setBusy(true);
    setError(null);
    try {
      const kp = await promoteSessionIdentity(migratableSessionId, passphrase);
      if (!kp) {
        setError('Nothing to promote');
        return false;
      }
      adopt(kp);
      return true;
    } finally {
      setBusy(false);
    }
  }, [adopt, migratableSessionId]);

  const useBurner = useCallback(() => {
    setIdentity(null);
    setError(null);
  }, []);

  const forget = useCallback(() => {
    clearLongTermIdentity();
    setIdentity(null);
    setExists(false);
    setMigratable(detectSessionIdentity());
  }, []);

  return {
    identity,
    exists,
    migratableSessionId,
    fingerprint,
    error,
    busy,
    create,
    unlock,
    promote,
    useBurner,
    forget,
  };
}

export type UseIdentity = ReturnType<typeof useIdentity>;
