import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import { createContainer } from './src/backend/entrypoints/container';
import { CreateSessionRequestSchema } from './src/shared/contracts/v1/schemas';
import { PublicSessionInfo } from './src/shared/contracts/v1/session';
import { CLEANUP_INTERVAL_MS, RELAY_LIMITS, REST_LIMITS, SESSION_LIMITS } from './src/backend/core/constants';
import { safeEqual, trustProxy, torMode, onionAddress } from './src/backend/core/security';
import { DomainError } from './src/backend/core/errors';
import { createRateLimiter } from './src/backend/adapters/http/rate-limit.middleware';

export async function setupApp() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: RELAY_LIMITS.WS_MAX_FRAME_BYTES,
  });
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (trustProxy()) {
    app.set('trust proxy', 1);
  }

  const container = createContainer(wss);

  // Background Tasks
  const cleanupInterval = setInterval(() => {
    container.transport.pruneStaleCounters();
    container.cleanupSessions.execute()
      .then(expiredIds => {
        // The store removal and socket teardown happen in the same tick, so a
        // lingering peer cannot relay through (and thereby resurrect via save)
        // a session the cleanup pass already reaped.
        for (const id of expiredIds) container.transport.disconnectSession(id);
      })
      .catch(err => {
        console.error('Cleanup task failed:', err);
      });
  }, CLEANUP_INTERVAL_MS);

  const onion = onionAddress();

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  // When an onion address is configured, automatically allow its HTTP origin
  // so Tor Browser can reach the API without requiring manual ALLOWED_ORIGINS.
  if (onion) {
    const onionOrigin = `http://${onion}`;
    if (!allowedOrigins.includes(onionOrigin)) allowedOrigins.push(onionOrigin);
  }
  if (allowedOrigins.length > 0) {
    app.use(cors({ origin: allowedOrigins }));
  }
  // The app is served same-origin; without ALLOWED_ORIGINS no CORS headers are
  // emitted, so browsers on other origins cannot call the API.

  const connectSrc: string[] = ["'self'", 'ws:', 'wss:'];
  // Allow the WebSocket upgrade from the hidden service origin so the browser
  // does not block the connection when loaded over the .onion address.
  if (onion) connectSrc.push(`ws://${onion}`, `wss://${onion}`);

  app.use(helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            'connect-src': connectSrc,
          },
        }
      : false, // Vite dev middleware needs inline scripts
  }));
  app.use(express.json());

  const generalLimiter = createRateLimiter({ windowMs: REST_LIMITS.WINDOW_MS, max: REST_LIMITS.GENERAL_PER_WINDOW, skip: torMode });
  const createLimiter = createRateLimiter({ windowMs: REST_LIMITS.WINDOW_MS, max: REST_LIMITS.SESSION_CREATE_PER_WINDOW, skip: torMode });
  app.use('/api', generalLimiter);

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.post('/api/sessions', createLimiter, async (req, res) => {
    try {
      const result = CreateSessionRequestSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues });
      }

      const session = await container.createSession.execute(result.data.expiresInSeconds, result.data.name, result.data.hostPublicKey);
      console.log(`[API] Created session: ${session.id}`);
      res.status(201).json({
        sessionId: session.id,
        name: session.name,
        expiresAt: session.expiresAt,
        publicKey: 'placeholder-phase-2',
        hostId: session.hostId,
        hostRecoveryToken: session.hostRecoveryToken
      });
    } catch (err) {
      if (err instanceof DomainError && err.code === 'SESSION_CAPACITY_REACHED') {
        return res.status(503).json({ error: 'Relay is at capacity, try again later' });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/sessions/:id', async (req, res) => {
    const id = req.params.id.trim();
    const session = await container.store.get(id);
    if (!session) {
      console.warn(`[API] Session not found: ${id}`);
      return res.status(404).json({ error: 'Session not found' });
    }
    console.log(`[API] Fetched session: ${id}`);
    // Public metadata only — never the peer map, host identity, or any token.
    const info: PublicSessionInfo = {
      id: session.id,
      name: session.name,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      status: session.status,
      participantCount: session.participantCount,
      maxPeers: session.maxPeers,
    };
    res.json(info);
  });

  app.post('/api/sessions/:id/refresh', async (req, res) => {
    const session = await container.store.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.participantCount <= 0) {
      return res.status(409).json({ error: 'Session has no active participants' });
    }

    const newExpiresAt = Math.min(
      Date.now() + SESSION_LIMITS.DEFAULT_TTL_MS,
      session.createdAt + SESSION_LIMITS.MAX_TTL_MS
    );
    session.expiresAt = newExpiresAt;
    session.lastActivityAt = Date.now();

    await container.store.save(session);

    res.json({
      sessionId: session.id,
      expiresAt: session.expiresAt
    });
  });

  app.delete('/api/sessions/:id', async (req, res) => {
    const id = req.params.id;
    const session = await container.store.get(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const hostToken = req.headers['x-host-token'];
    if (!safeEqual(hostToken, session.hostRecoveryToken)) {
      return res.status(403).json({ error: 'Only the host can destroy the session' });
    }
    await container.store.delete(id);
    container.transport.disconnectSession(id);
    console.log(`[API] Destroyed session: ${id}`);
    res.status(204).send();
  });

  // Vite middleware for development
  if (!isProd && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return { app, server, wss, container, PORT, cleanupInterval };
}

async function startServer() {
  const { server, wss, cleanupInterval, PORT } = await setupApp();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Quantum Bunker running on http://0.0.0.0:${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, draining connections...`);
    clearInterval(cleanupInterval);
    // Ephemerality is the design: closing sockets discards all in-memory
    // sessions. We close the WS layer first so peers get a clean close frame,
    // then stop accepting HTTP and exit once the listener is released.
    for (const client of wss.clients) client.close(1001, 'Server shutting down');
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
