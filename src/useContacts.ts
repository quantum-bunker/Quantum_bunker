import { useCallback, useState } from 'react';
import {
  Contact,
  loadContacts,
  upsertContact,
  attachContactToken,
  revokeContact,
  encodeTrustPayload,
  decodeTrustPayload,
} from './contacts-store';

// Owns the client-side contact book: pinned trusted member keys plus any tokens
// those contacts have issued this device. Pure localStorage; nothing here ever
// reaches the relay. Pairs with useMembership — the membership hook mints/holds
// the raw tokens, this hook gives them a labeled, pinned, revocable identity.
export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>(() => loadContacts());

  // Pin a contact from a scanned/pasted trust payload (one-time key exchange).
  const pinFromTrustLink = useCallback((encoded: string, labelOverride?: string): Contact | null => {
    const decoded = decodeTrustPayload(encoded);
    if (!decoded) return null;
    const next = upsertContact(decoded.publicKey, labelOverride || decoded.label || '', undefined);
    setContacts(next);
    return next.find(c => c.publicKey === decoded.publicKey) ?? null;
  }, []);

  const pinManual = useCallback((publicKey: string, label: string): Contact | null => {
    if (!publicKey.trim()) return null;
    const next = upsertContact(publicKey, label, undefined);
    setContacts(next);
    return next.find(c => c.publicKey === publicKey.trim()) ?? null;
  }, []);

  // Record a token a contact issued us. Returns the vault id it admits us to so
  // the caller can also seed it into the session-keyed token wallet.
  const saveContactToken = useCallback((publicKey: string, encodedToken: string): string | null => {
    const { contacts: next, sessionId } = attachContactToken(publicKey, encodedToken);
    setContacts(next);
    return sessionId;
  }, []);

  const revoke = useCallback((publicKey: string) => {
    setContacts(revokeContact(publicKey));
  }, []);

  return {
    contacts,
    pinFromTrustLink,
    pinManual,
    saveContactToken,
    revoke,
    encodeTrustPayload,
  };
}
