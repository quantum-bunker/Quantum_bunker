import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Application } from 'express';

// Regression guard for a bug that was invisible in development: CSP is only
// emitted when NODE_ENV=production (dev needs Vite's inline scripts), and the
// production policy shipped with no media-src. Decrypted attachments are handed
// to the DOM as data:/blob: URLs, so they silently fell back to default-src
// 'self' and every <audio>/<video> was blocked in the browser with no error
// anywhere in the app. These assertions fail if the directives are dropped.
describe('Production CSP headers', () => {
  let app: Application;
  let server: { close: () => void };
  let cleanupInterval: ReturnType<typeof setInterval>;
  let prevEnv: string | undefined;

  beforeAll(async () => {
    prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    // Imported after NODE_ENV is set: isProd is read inside setupApp, so the
    // module itself is safe to import once, but the app must be built here.
    const { setupApp } = await import('../../server');
    const setup = await setupApp();
    app = setup.app;
    server = setup.server;
    cleanupInterval = setup.cleanupInterval;
  });

  afterAll(() => {
    if (cleanupInterval) clearInterval(cleanupInterval);
    server.close();
    process.env.NODE_ENV = prevEnv;
  });

  const policy = async (): Promise<string> => {
    const res = await request(app).get('/api/health');
    return String(res.headers['content-security-policy'] ?? '');
  };

  it('emits a content-security-policy in production', async () => {
    expect(await policy()).not.toBe('');
  });

  it('allows data: and blob: media so decrypted audio/video can play', async () => {
    const csp = await policy();
    const mediaSrc = csp.split(';').map(d => d.trim()).find(d => d.startsWith('media-src'));
    expect(mediaSrc).toBeDefined();
    expect(mediaSrc).toContain('data:');
    expect(mediaSrc).toContain('blob:');
  });

  it('allows data: and blob: images so streamed images render from object URLs', async () => {
    const csp = await policy();
    const imgSrc = csp.split(';').map(d => d.trim()).find(d => d.startsWith('img-src'));
    expect(imgSrc).toBeDefined();
    expect(imgSrc).toContain('data:');
    expect(imgSrc).toContain('blob:');
  });

  it('still allows the websocket upgrade', async () => {
    const csp = await policy();
    const connectSrc = csp.split(';').map(d => d.trim()).find(d => d.startsWith('connect-src'));
    expect(connectSrc).toContain('wss:');
  });
});
