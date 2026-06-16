import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { createRateLimiter } from '../../src/backend/adapters/http/rate-limit.middleware';

function makeReq(ip = '1.2.3.4'): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}

// Returns { res, ctx } where ctx.status / ctx.body update when the middleware
// calls res.status(code).json(body).
function makeRes() {
  const ctx = { status: null as number | null, body: undefined as unknown };
  const res = {
    status(code: number) { ctx.status = code; return res; },
    json(data: unknown) { ctx.body = data; return res; },
  } as unknown as Response;
  return { res, ctx };
}

describe('createRateLimiter', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn() as unknown as NextFunction;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const mw = createRateLimiter({ windowMs: 1000, max: 3 });
    const req = makeReq();
    for (let i = 0; i < 3; i++) {
      const { res } = makeRes();
      mw(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('blocks requests that exceed the limit', () => {
    const mw = createRateLimiter({ windowMs: 1000, max: 2 });
    const req = makeReq();
    const ctxRecords: ReturnType<typeof makeRes>['ctx'][] = [];

    for (let i = 0; i < 3; i++) {
      const { res, ctx } = makeRes();
      mw(req, res, next);
      ctxRecords.push(ctx);
    }

    expect(next).toHaveBeenCalledTimes(2);
    expect(ctxRecords[2].status).toBe(429);
  });

  it('resets the counter after the window expires', () => {
    const mw = createRateLimiter({ windowMs: 1000, max: 1 });
    const req = makeReq();

    const { res: res1 } = makeRes();
    mw(req, res1, next);
    expect(next).toHaveBeenCalledTimes(1);

    const { res: res2, ctx: ctx2 } = makeRes();
    mw(req, res2, next);
    expect(ctx2.status).toBe(429);
    expect(next).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1001);

    const { res: res3 } = makeRes();
    mw(req, res3, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('tracks different IPs independently', () => {
    const mw = createRateLimiter({ windowMs: 1000, max: 1 });

    const { res: resA } = makeRes();
    mw(makeReq('10.0.0.1'), resA, next);
    expect(next).toHaveBeenCalledTimes(1);

    const { res: resB } = makeRes();
    mw(makeReq('10.0.0.2'), resB, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('skip function bypasses counting entirely', () => {
    const mw = createRateLimiter({ windowMs: 1000, max: 1, skip: () => true });
    const req = makeReq();
    for (let i = 0; i < 10; i++) {
      const { res } = makeRes();
      mw(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(10);
  });

  it('skip predicate is per-request: trusted IPs bypass, others are limited', () => {
    const mw = createRateLimiter({
      windowMs: 1000,
      max: 1,
      skip: (req) => req.ip === 'trusted',
    });

    // trusted IP: no limit enforced
    const { res: t1 } = makeRes();
    mw(makeReq('trusted'), t1, next);
    const { res: t2 } = makeRes();
    mw(makeReq('trusted'), t2, next);
    expect(next).toHaveBeenCalledTimes(2);

    // regular IP: limited to 1
    const { res: r1 } = makeRes();
    mw(makeReq('regular'), r1, next);
    expect(next).toHaveBeenCalledTimes(3);

    const { res: r2, ctx: ctx4 } = makeRes();
    mw(makeReq('regular'), r2, next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(ctx4.status).toBe(429);
  });

  it('429 response body contains error field', () => {
    const mw = createRateLimiter({ windowMs: 1000, max: 0 });
    const { res, ctx } = makeRes();
    mw(makeReq(), res, next);
    expect(ctx.body).toMatchObject({ error: expect.any(String) });
  });

  it('falls back to socket.remoteAddress when req.ip is absent', () => {
    const mw = createRateLimiter({ windowMs: 1000, max: 1 });
    const req = { socket: { remoteAddress: '9.9.9.9' } } as unknown as Request;

    const { res: res1 } = makeRes();
    mw(req, res1, next);
    expect(next).toHaveBeenCalledTimes(1);

    const { res: res2, ctx: ctx2 } = makeRes();
    mw(req, res2, next);
    expect(ctx2.status).toBe(429);
  });
});
