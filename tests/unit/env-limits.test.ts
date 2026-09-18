import { describe, it, expect, afterEach, vi } from 'vitest';

// A malformed limit used to parse to NaN, and every `count <= NaN` comparison
// is false — so RELAY_CONN_PER_IP_LIMIT=abc silently rejected every connection
// with no error anywhere. A deploy typo became a total outage.
describe('env-configured limits', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const loadConstants = async () => {
    vi.resetModules();
    return import('../../src/backend/core/constants');
  };

  it('uses the documented defaults when unset', async () => {
    vi.stubEnv('RELAY_CONN_PER_IP_LIMIT', '');
    const { RELAY_LIMITS } = await loadConstants();
    expect(RELAY_LIMITS.CONN_PER_IP_LIMIT).toBe(50);
  });

  it('accepts a valid override', async () => {
    vi.stubEnv('RELAY_CONN_PER_IP_LIMIT', '5');
    const { RELAY_LIMITS } = await loadConstants();
    expect(RELAY_LIMITS.CONN_PER_IP_LIMIT).toBe(5);
  });

  it('refuses a non-numeric limit instead of serving with NaN', async () => {
    vi.stubEnv('RELAY_CONN_PER_IP_LIMIT', 'abc');
    await expect(loadConstants()).rejects.toThrow(/RELAY_CONN_PER_IP_LIMIT/);
  });

  it('refuses a zero or negative limit', async () => {
    vi.stubEnv('MAX_ACTIVE_SESSIONS', '0');
    await expect(loadConstants()).rejects.toThrow(/MAX_ACTIVE_SESSIONS/);
  });
});
