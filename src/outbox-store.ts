import { EnvelopeType } from './shared/contracts/v1/envelope';
import { utf8, fromUtf8, toBase64, fromBase64 } from './crypto/noise-primitives';

// Client-side store-and-forward for messages aimed at a peer who is currently
// offline. Nothing here ever reaches the relay: the server stays a blind, zero-
// storage fan-out. Queued messages live in this device's IndexedDB, encrypted at
// rest, and are re-sent over the live relay/P2P path once both peers are online
// together. Delivery is confirmed by the existing ACK receipt (markDelivered).
//
// We queue PLAINTEXT — not the wire ciphertext — because the double-ratchet
// channel to an absent peer does not exist yet. The cleartext is sealed at rest
// with a key derived from the session secret, and re-encrypted for the recipient
// at flush time (see useRelay), keeping the ORIGINAL nonce so the recipient's
// client-side dedup drops any duplicate (CLAUDE.md rule 5).

// Mirrors RELAY_LIMITS.MSG_PER_SECOND_LIMIT in src/backend/core/constants.ts.
// The frontend cannot import backend modules across the hexagonal boundary, so
// the value is duplicated with the backend kept as the source of truth. The
// flush spaces sends by FLUSH_INTERVAL_MS to stay under the per-peer limiter.
export const MSG_PER_SECOND_LIMIT = 10;
export const FLUSH_INTERVAL_MS = Math.ceil(1000 / MSG_PER_SECOND_LIMIT);

const DB_NAME = 'qb-outbox';
const STORE_NAME = 'entries';
const WILDCARD_RECIPIENT = '*';

export { WILDCARD_RECIPIENT };

export interface OutboxEntry {
  nonce: string; // original message nonce — preserved across flush for dedup
  to: string; // target peerId, or '*' for "whichever trusted peer returns"
  type: EnvelopeType;
  plaintext: string; // cleartext payload, re-encrypted at flush time
  timestamp: number; // original send time
  attempts: number;
}

interface SealedRecord {
  nonce: string;
  iv: string; // base64
  ct: string; // base64 AES-GCM ciphertext of the JSON OutboxEntry
}

export interface OutboxBackend {
  list(): Promise<SealedRecord[]>;
  put(record: SealedRecord): Promise<void>;
  remove(nonce: string): Promise<void>;
  clear(): Promise<void>;
}

// In-memory backend for tests/SSR or when IndexedDB is unavailable. Entries are
// still sealed by MessageOutbox before reaching here, so plaintext never lands
// in this map either.
export class MemoryOutboxBackend implements OutboxBackend {
  private readonly map = new Map<string, SealedRecord>();
  async list(): Promise<SealedRecord[]> {
    return Array.from(this.map.values());
  }
  async put(record: SealedRecord): Promise<void> {
    this.map.set(record.nonce, record);
  }
  async remove(nonce: string): Promise<void> {
    this.map.delete(nonce);
  }
  async clear(): Promise<void> {
    this.map.clear();
  }
}

class IndexedDBOutboxBackend implements OutboxBackend {
  constructor(private readonly dbPromise: Promise<IDBDatabase>) {}

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.dbPromise;
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  list(): Promise<SealedRecord[]> {
    return this.tx('readonly').then(
      store =>
        new Promise<SealedRecord[]>((resolve, reject) => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result as SealedRecord[]);
          req.onerror = () => reject(req.error);
        }),
    );
  }

  put(record: SealedRecord): Promise<void> {
    return this.tx('readwrite').then(
      store =>
        new Promise<void>((resolve, reject) => {
          const req = store.put(record);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        }),
    );
  }

  remove(nonce: string): Promise<void> {
    return this.tx('readwrite').then(
      store =>
        new Promise<void>((resolve, reject) => {
          const req = store.delete(nonce);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        }),
    );
  }

  clear(): Promise<void> {
    return this.tx('readwrite').then(
      store =>
        new Promise<void>((resolve, reject) => {
          const req = store.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        }),
    );
  }
}

function openIndexedDB(sessionId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`${DB_NAME}-${sessionId}`, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'nonce' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Derives a non-extractable AES-GCM key from the session/contact secret via
// PBKDF2-SHA256. The secret never leaves the device; the sessionId is the salt.
async function deriveAtRestKey(secret: string, sessionId: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', utf8(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: utf8(`qb-outbox:${sessionId}`), iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export class MessageOutbox {
  private constructor(
    private readonly backend: OutboxBackend,
    private readonly key: CryptoKey,
  ) {}

  // `secret` should be a high-entropy per-session secret (e.g. the device's
  // Noise identity secret key, base64). `backend` is injectable for tests; in a
  // browser it defaults to IndexedDB, falling back to memory if unavailable.
  static async open(sessionId: string, secret: string, backend?: OutboxBackend): Promise<MessageOutbox> {
    const key = await deriveAtRestKey(secret, sessionId);
    let store = backend;
    if (!store) {
      store =
        typeof indexedDB !== 'undefined'
          ? new IndexedDBOutboxBackend(openIndexedDB(sessionId))
          : new MemoryOutboxBackend();
    }
    return new MessageOutbox(store, key);
  }

  private async seal(entry: OutboxEntry): Promise<SealedRecord> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, utf8(JSON.stringify(entry))),
    );
    return { nonce: entry.nonce, iv: toBase64(iv), ct: toBase64(ct) };
  }

  private async unseal(record: SealedRecord): Promise<OutboxEntry | null> {
    try {
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(record.iv) },
        this.key,
        fromBase64(record.ct),
      );
      return JSON.parse(fromUtf8(new Uint8Array(pt))) as OutboxEntry;
    } catch {
      return null;
    }
  }

  async enqueue(
    input: Omit<OutboxEntry, 'attempts'> & { attempts?: number },
  ): Promise<void> {
    const entry: OutboxEntry = { attempts: 0, ...input };
    await this.backend.put(await this.seal(entry));
  }

  // All queued entries, oldest first, optionally filtered to a recipient (plus
  // wildcard entries, which any returning trusted peer may receive).
  async pending(to?: string): Promise<OutboxEntry[]> {
    const records = await this.backend.list();
    const entries: OutboxEntry[] = [];
    for (const record of records) {
      const entry = await this.unseal(record);
      if (entry) entries.push(entry);
    }
    entries.sort((a, b) => a.timestamp - b.timestamp);
    if (!to) return entries;
    return entries.filter(e => e.to === to || e.to === WILDCARD_RECIPIENT);
  }

  // Removes a delivered entry. Called when its ACK arrives — this is what makes
  // delivery exactly-once: a flushed-but-unacked entry survives and is retried,
  // while the recipient's nonce dedup discards any duplicate it already saw.
  async markDelivered(nonce: string): Promise<void> {
    await this.backend.remove(nonce);
  }

  async clear(): Promise<void> {
    await this.backend.clear();
  }

  // Flushes pending entries through `send`, spaced by FLUSH_INTERVAL_MS so the
  // burst stays under the relay's per-peer rate limiter. Entries are NOT removed
  // here — they are removed on ACK (markDelivered). `send` returning false (no
  // live path) aborts the drain so the queue is preserved for the next attempt.
  // `sleep` is injectable for deterministic tests.
  async drain(
    send: (entry: OutboxEntry) => boolean | Promise<boolean>,
    opts: { to?: string; sleep?: (ms: number) => Promise<void> } = {},
  ): Promise<number> {
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    const entries = await this.pending(opts.to);
    let sent = 0;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const ok = await send({ ...entry, attempts: entry.attempts + 1 });
      if (!ok) break;
      sent++;
      await this.backend.put(await this.seal({ ...entry, attempts: entry.attempts + 1 }));
      if (i < entries.length - 1) await sleep(FLUSH_INTERVAL_MS);
    }
    return sent;
  }
}
