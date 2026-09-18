// Paced, prioritised outbound queue for relay signaling.
//
// The relay enforces RELAY_LIMITS.MSG_PER_SECOND_LIMIT (10) per peer and
// SOCKET_MSG_PER_SECOND_LIMIT (20) per socket, and it DROPS whatever exceeds
// them. A video call's trickle-ICE burst used to blow straight through both,
// and the frames lost in the overflow included Noise handshake frames — which
// made subsequent chat messages undecryptable with no error anywhere. Pacing
// signaling below the limit, and ordering it so handshakes go first, is what
// keeps a call from starving chat.
//
// Kept free of React and the WebSocket API so the ordering and rate behaviour
// can be unit-tested with fake timers.

// Mirrors RELAY_LIMITS.MSG_PER_SECOND_LIMIT in src/backend/core/constants.ts.
// The frontend cannot import backend modules across the hexagonal boundary, so
// the value is duplicated here with the backend kept as the source of truth.
export const RELAY_MSG_PER_SECOND = 10;

// Signaling is paced below the relay limit on purpose: the remaining budget is
// headroom for interactive chat, which is sent immediately and never queued.
export const SIGNAL_SENDS_PER_SECOND = 6;

// Lower number drains first. Noise outranks everything because a dropped
// handshake frame corrupts the channel rather than merely delaying a feature;
// call ICE is last because a call may take longer to connect, but chat must not
// be the thing that waits.
export const SEND_PRIORITY = {
  NOISE: 0,
  CHAT: 1,
  MESH: 2,
  CALL: 3,
} as const;

export type SendPriority = (typeof SEND_PRIORITY)[keyof typeof SEND_PRIORITY];

const LANE_COUNT = 4;

export class PriorityQueue<T> {
  private readonly lanes: T[][] = Array.from({ length: LANE_COUNT }, () => []);

  enqueue(item: T, priority: SendPriority): void {
    this.lanes[priority].push(item);
  }

  dequeue(): T | undefined {
    for (const lane of this.lanes) {
      if (lane.length > 0) return lane.shift();
    }
    return undefined;
  }

  get size(): number {
    let total = 0;
    for (const lane of this.lanes) total += lane.length;
    return total;
  }

  clear(): void {
    for (const lane of this.lanes) lane.length = 0;
  }

  clearExcept(keep: SendPriority): void {
    for (let i = 0; i < this.lanes.length; i++) {
      if (i !== keep) this.lanes[i].length = 0;
    }
  }
}

// Classifies a parsed SIGNALING frame into a lane. Anything unrecognised is
// treated as mesh-priority: slower than a handshake, faster than call ICE.
export function classifySignalPriority(frame: { kind?: unknown; rtc?: unknown; call?: unknown }): SendPriority {
  if (frame.kind === 'noise') return SEND_PRIORITY.NOISE;
  if (frame.kind === 'call') {
    // Control verbs (invite/accept/decline/…) are user-visible and rare; only
    // the media-negotiation flood is deprioritised.
    return frame.call === 'ice' || frame.call === 'sdp' ? SEND_PRIORITY.CALL : SEND_PRIORITY.CHAT;
  }
  if (frame.kind === 'rtc') return SEND_PRIORITY.MESH;
  return SEND_PRIORITY.MESH;
}

interface PacedSenderOptions<T> {
  ratePerSecond: number;
  send: (item: T) => void;
  now?: () => number;
}

// Token-bucket pacer. Bursts up to one second's worth of budget (so a short
// negotiation is not artificially slowed), then settles to the configured rate.
export class PacedSender<T> {
  private readonly queue = new PriorityQueue<T>();
  private readonly opts: PacedSenderOptions<T>;
  private tokens: number;
  private lastRefill: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;

  constructor(opts: PacedSenderOptions<T>) {
    this.opts = opts;
    this.tokens = opts.ratePerSecond;
    this.lastRefill = this.now();
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private refill(): void {
    const t = this.now();
    const elapsed = t - this.lastRefill;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.opts.ratePerSecond, this.tokens + (elapsed * this.opts.ratePerSecond) / 1000);
    this.lastRefill = t;
  }

  enqueue(item: T, priority: SendPriority): void {
    this.queue.enqueue(item, priority);
    this.pump();
  }

  private pump(): void {
    if (this.paused) return;
    this.refill();
    while (this.tokens >= 1) {
      const next = this.queue.dequeue();
      if (next === undefined) return;
      this.tokens -= 1;
      this.opts.send(next);
    }
    if (this.queue.size > 0 && this.timer === null) {
      const waitMs = Math.ceil(((1 - this.tokens) / this.opts.ratePerSecond) * 1000);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
      }, Math.max(waitMs, 1));
    }
  }

  get pending(): number {
    return this.queue.size;
  }

  // Stops draining without discarding. The socket is gone but the queue's
  // contents are not yet stale, so nothing must be written into a closed
  // socket where sendRaw would silently swallow it.
  pause(): void {
    this.paused = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    // Budget accrued while paused is not owed to us; the relay's limiter kept
    // running and a full bucket would burst straight through it on reconnect.
    this.tokens = Math.min(this.tokens, this.opts.ratePerSecond);
    this.lastRefill = this.now();
    this.pump();
  }

  // Drops everything still queued. Used on disconnect: a stale candidate for a
  // torn-down connection is worthless and would only spend budget.
  clear(): void {
    this.queue.clear();
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // Drops the frames a dead connection invalidates while keeping handshake
  // frames. A Noise channel outlives the socket it was negotiated over, and a
  // handshake frame lost here has no retry anywhere: the channel stays
  // half-open, allReady() never goes true, and every message silently diverts
  // to the outbox with nothing shown to the user.
  clearTransient(): void {
    this.queue.clearExcept(SEND_PRIORITY.NOISE);
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Re-arm for whatever survived; the dropped lanes were holding the budget
    // the kept frames now need. A paused sender no-ops here and drains on
    // resume instead.
    this.pump();
  }
}
