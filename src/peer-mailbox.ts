import { RelayEnvelope, EnvelopeType } from './shared/contracts/v1/envelope';

// Tier-2 store-and-forward (group case). An ONLINE peer transiently holds wire
// envelopes destined for a peer who dropped, then replays them when that peer
// returns. The held blobs stay end-to-end encrypted for the FINAL recipient: a
// NOISE_MESSAGE/FILE payload is `{ c: { peerId: ciphertextSlot } }`, so the
// carrier can read the recipient routing map (peerIds) as metadata but never the
// content — there is no slot addressed to the carrier. The relay is untouched;
// this is a purely client-held, in-memory buffer that vanishes on refresh.

const MAX_ENTRIES = 200;
const ENTRY_TTL_MS = 5 * 60 * 1000; // matches the client-side auto-disappear window

interface MailboxEntry {
  nonce: string;
  envelope: RelayEnvelope;
  recipients: string[]; // peerIds the envelope carries a slot for
  storedAt: number;
}

// Pulls the recipient peerIds out of an encrypted payload without decrypting it.
function recipientsOf(envelope: RelayEnvelope): string[] {
  if (envelope.type !== EnvelopeType.NOISE_MESSAGE && envelope.type !== EnvelopeType.FILE) return [];
  try {
    const parsed = JSON.parse(envelope.payload) as { c?: Record<string, unknown> };
    return parsed.c && typeof parsed.c === 'object' ? Object.keys(parsed.c) : [];
  } catch {
    return [];
  }
}

export class PeerMailbox {
  private readonly entries = new Map<string, MailboxEntry>();

  // Caches an envelope on behalf of any addressed recipient that is currently
  // absent. Present recipients already got it live, so nothing is held for them.
  hold(envelope: RelayEnvelope, presentPeerIds: ReadonlySet<string>): void {
    const recipients = recipientsOf(envelope).filter(id => !presentPeerIds.has(id));
    if (recipients.length === 0) return;
    this.prune();
    this.entries.set(envelope.nonce, { nonce: envelope.nonce, envelope, recipients, storedAt: Date.now() });
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  // Returns the envelopes to replay for a returning peer, and forgets the slot
  // for that peer (dropping the entry once no absent recipient remains).
  release(peerId: string): RelayEnvelope[] {
    this.prune();
    const out: RelayEnvelope[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.recipients.includes(peerId)) continue;
      out.push(entry.envelope);
      entry.recipients = entry.recipients.filter(id => id !== peerId);
      if (entry.recipients.length === 0) this.entries.delete(entry.nonce);
    }
    return out;
  }

  private prune(): void {
    const cutoff = Date.now() - ENTRY_TTL_MS;
    for (const [nonce, entry] of this.entries) {
      if (entry.storedAt < cutoff) this.entries.delete(nonce);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
