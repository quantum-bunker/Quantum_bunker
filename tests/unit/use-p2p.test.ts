import { describe, it, expect } from 'vitest';
import {
  p2pReducer,
  meshStateToEvent,
  requiresDirectPath,
  P2P_FILE_THRESHOLD_BYTES,
  P2PPeerState,
  P2PSignalEvent,
} from '../../src/transport/p2p-policy';

// ─── Signaling state machine ────────────────────────────────────────────

describe('useP2P — signaling state machine', () => {
  it('ensure moves idle → connecting', () => {
    expect(p2pReducer('idle', 'ensure')).toBe('connecting');
  });

  it('walks the happy path idle → connecting → connected', () => {
    let s: P2PPeerState = 'idle';
    s = p2pReducer(s, 'ensure');
    expect(s).toBe('connecting');
    s = p2pReducer(s, 'offer');
    expect(s).toBe('connecting');
    s = p2pReducer(s, 'answer');
    expect(s).toBe('connecting');
    s = p2pReducer(s, 'candidate');
    expect(s).toBe('connecting');
    s = p2pReducer(s, 'open');
    expect(s).toBe('connected');
  });

  it('fail before open lands in failed', () => {
    const s = p2pReducer(p2pReducer('idle', 'ensure'), 'fail');
    expect(s).toBe('failed');
  });

  it('does NOT downgrade a connected link on a stray fail', () => {
    expect(p2pReducer('connected', 'fail')).toBe('connected');
  });

  it('close after connected goes to closed; close while connecting is inert', () => {
    expect(p2pReducer('connected', 'close')).toBe('closed');
    expect(p2pReducer('connecting', 'close')).toBe('connecting');
  });

  it('terminal states can be revived by a fresh ensure (re-join / renegotiation)', () => {
    expect(p2pReducer('failed', 'ensure')).toBe('connecting');
    expect(p2pReducer('closed', 'ensure')).toBe('connecting');
  });

  it('offer/answer/candidate never resurrect a failed peer on their own', () => {
    const events: P2PSignalEvent[] = ['offer', 'answer', 'candidate'];
    for (const e of events) expect(p2pReducer('failed', e)).toBe('failed');
  });

  it('open is terminal-success from any state (late data channel)', () => {
    const states: P2PPeerState[] = ['idle', 'connecting', 'failed', 'closed', 'connected'];
    for (const s of states) expect(p2pReducer(s, 'open')).toBe('connected');
  });
});

// ─── Mesh state → event mapping ─────────────────────────────────────────

describe('useP2P — mesh state reconciliation', () => {
  it('maps each raw mesh state to the event that resolves it correctly', () => {
    expect(p2pReducer('idle', meshStateToEvent('connecting'))).toBe('connecting');
    expect(p2pReducer('connecting', meshStateToEvent('connected'))).toBe('connected');
    expect(p2pReducer('connecting', meshStateToEvent('failed'))).toBe('failed');
    expect(p2pReducer('connected', meshStateToEvent('closed'))).toBe('closed');
  });
});

// ─── Routing threshold ──────────────────────────────────────────────────

describe('useP2P — direct-path threshold', () => {
  it('forces media at/above the threshold onto the direct path', () => {
    expect(requiresDirectPath(P2P_FILE_THRESHOLD_BYTES)).toBe(true);
    expect(requiresDirectPath(P2P_FILE_THRESHOLD_BYTES + 1)).toBe(true);
    expect(requiresDirectPath(5 * 1024 * 1024)).toBe(true);
  });

  it('keeps small text/receipts on the relay path', () => {
    expect(requiresDirectPath(0)).toBe(false);
    expect(requiresDirectPath(512)).toBe(false);
    expect(requiresDirectPath(P2P_FILE_THRESHOLD_BYTES - 1)).toBe(false);
  });

  it('treats non-finite sizes as relay-eligible (never forces a bad direct send)', () => {
    expect(requiresDirectPath(NaN)).toBe(false);
    expect(requiresDirectPath(Infinity)).toBe(false);
  });
});
