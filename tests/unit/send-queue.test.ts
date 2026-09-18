import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PacedSender,
  PriorityQueue,
  SEND_PRIORITY,
  SIGNAL_SENDS_PER_SECOND,
  classifySignalPriority,
} from '../../src/transport/send-queue';

describe('PriorityQueue', () => {
  it('drains strictly by lane, FIFO within a lane', () => {
    const q = new PriorityQueue<string>();
    q.enqueue('call-1', SEND_PRIORITY.CALL);
    q.enqueue('mesh-1', SEND_PRIORITY.MESH);
    q.enqueue('noise-1', SEND_PRIORITY.NOISE);
    q.enqueue('call-2', SEND_PRIORITY.CALL);
    q.enqueue('noise-2', SEND_PRIORITY.NOISE);
    q.enqueue('chat-1', SEND_PRIORITY.CHAT);

    const drained: string[] = [];
    for (let next = q.dequeue(); next !== undefined; next = q.dequeue()) drained.push(next);
    expect(drained).toEqual(['noise-1', 'noise-2', 'chat-1', 'mesh-1', 'call-1', 'call-2']);
  });

  it('reports size and clears', () => {
    const q = new PriorityQueue<number>();
    expect(q.size).toBe(0);
    q.enqueue(1, SEND_PRIORITY.CHAT);
    q.enqueue(2, SEND_PRIORITY.CALL);
    expect(q.size).toBe(2);
    q.clear();
    expect(q.size).toBe(0);
    expect(q.dequeue()).toBeUndefined();
  });
});

describe('classifySignalPriority', () => {
  it('puts a Noise handshake ahead of everything else', () => {
    expect(classifySignalPriority({ kind: 'noise' })).toBe(SEND_PRIORITY.NOISE);
  });

  it('deprioritises call media negotiation below mesh signaling', () => {
    expect(classifySignalPriority({ kind: 'call', call: 'ice' })).toBe(SEND_PRIORITY.CALL);
    expect(classifySignalPriority({ kind: 'call', call: 'sdp' })).toBe(SEND_PRIORITY.CALL);
    expect(classifySignalPriority({ kind: 'rtc', rtc: 'candidates' })).toBe(SEND_PRIORITY.MESH);
    expect(SEND_PRIORITY.MESH).toBeLessThan(SEND_PRIORITY.CALL);
  });

  it('keeps user-visible call verbs responsive', () => {
    expect(classifySignalPriority({ kind: 'call', call: 'invite' })).toBe(SEND_PRIORITY.CHAT);
    expect(classifySignalPriority({ kind: 'call', call: 'end' })).toBe(SEND_PRIORITY.CHAT);
  });

  it('treats an unknown frame as mesh priority', () => {
    expect(classifySignalPriority({ kind: 'typing' })).toBe(SEND_PRIORITY.MESH);
    expect(classifySignalPriority({})).toBe(SEND_PRIORITY.MESH);
  });
});

describe('PacedSender', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const build = (rate: number) => {
    const sent: string[] = [];
    const sender = new PacedSender<string>({ ratePerSecond: rate, send: (i) => sent.push(i) });
    return { sent, sender };
  };

  it('sends immediately while budget remains', () => {
    const { sent, sender } = build(4);
    for (let i = 0; i < 4; i++) sender.enqueue(`c${i}`, SEND_PRIORITY.CALL);
    expect(sent).toEqual(['c0', 'c1', 'c2', 'c3']);
    expect(sender.pending).toBe(0);
  });

  it('holds back everything past the rate instead of flooding the relay', () => {
    const { sent, sender } = build(4);
    for (let i = 0; i < 10; i++) sender.enqueue(`c${i}`, SEND_PRIORITY.CALL);
    expect(sent).toHaveLength(4);
    expect(sender.pending).toBe(6);
  });

  it('drains the backlog as the bucket refills', () => {
    const { sent, sender } = build(4);
    for (let i = 0; i < 10; i++) sender.enqueue(`c${i}`, SEND_PRIORITY.CALL);
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(8);
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(10);
    expect(sender.pending).toBe(0);
  });

  it('never starves a handshake behind a call ICE burst', () => {
    const { sent, sender } = build(2);
    // Exhaust the budget with call traffic, then queue a handshake behind it.
    for (let i = 0; i < 8; i++) sender.enqueue(`ice${i}`, SEND_PRIORITY.CALL);
    sender.enqueue('noise', SEND_PRIORITY.NOISE);
    sender.enqueue('mesh', SEND_PRIORITY.MESH);
    expect(sent).toEqual(['ice0', 'ice1']);

    vi.advanceTimersByTime(500);
    // The handshake jumps the six queued candidates it arrived after.
    expect(sent[2]).toBe('noise');
    vi.advanceTimersByTime(500);
    expect(sent[3]).toBe('mesh');
  });

  it('drops queued work on clear so a dead connection spends no budget', () => {
    const { sent, sender } = build(1);
    for (let i = 0; i < 5; i++) sender.enqueue(`c${i}`, SEND_PRIORITY.CALL);
    expect(sender.pending).toBe(4);
    sender.clear();
    vi.advanceTimersByTime(10_000);
    expect(sent).toHaveLength(1);
    expect(sender.pending).toBe(0);
  });

  it('keeps handshake frames on clearTransient and drops the rest', () => {
    const { sent, sender } = build(1);
    sender.enqueue('spent', SEND_PRIORITY.CALL);
    sender.enqueue('noise', SEND_PRIORITY.NOISE);
    sender.enqueue('mesh', SEND_PRIORITY.MESH);
    sender.enqueue('call', SEND_PRIORITY.CALL);
    expect(sent).toEqual(['spent']);

    sender.clearTransient();
    expect(sender.pending).toBe(1);

    vi.advanceTimersByTime(10_000);
    expect(sent).toEqual(['spent', 'noise']);
  });

  it('holds queued frames while paused and flushes them on resume', () => {
    const { sent, sender } = build(1);
    sender.enqueue('spent', SEND_PRIORITY.NOISE);
    sender.pause();
    sender.enqueue('held', SEND_PRIORITY.NOISE);

    // A paused sender must not write into a socket that is gone: sendRaw
    // swallows writes to a closed socket, so a drained frame is a lost frame.
    vi.advanceTimersByTime(10_000);
    expect(sent).toEqual(['spent']);
    expect(sender.pending).toBe(1);

    sender.resume();
    vi.advanceTimersByTime(1_000);
    expect(sent).toEqual(['spent', 'held']);
  });

  it('paces signaling below the relay per-peer message limit', () => {
    // The relay drops anything past MSG_PER_SECOND_LIMIT (10); the remainder is
    // deliberate headroom for chat, which is never queued here.
    expect(SIGNAL_SENDS_PER_SECOND).toBeLessThan(10);
  });
});
