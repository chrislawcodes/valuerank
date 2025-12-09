import crypto from 'crypto';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { healthRouter } from './health.js';
import { authRouter } from './routes/auth.js';
import { exportRouter } from './routes/export.js';
import { importRouter } from './routes/import.js';
import { authMiddleware, graphqlAuthMiddleware } from './auth/index.js';
import { yoga } from './graphql/index.js';
import { createMcpRouter } from './mcp/index.js';
import { createOAuthRouter, authorizationServerMetadata, startAuthCodeCleanup } from './mcp/oauth/index.js';
import { createLogger, AppError } from '@valuerank/shared';

// Extend Express Request to include logger
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      log: ReturnType<typeof createLogger>;
      requestId: string;
    }
  }
}

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request ID and logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) ?? crypto.randomUUID();
    req.requestId = requestId;
    req.log = createLogger('request').child({ requestId, method: req.method, path: req.path });

    const start = Date.now();
    req.log.info('Request started');

    res.on('finish', () => {
      req.log.info({ status: res.statusCode, duration: Date.now() - start }, 'Request completed');
    });

    next();
  });

  // Auth middleware - extracts JWT/API key and populates req.user
  // Applied globally so auth info is available everywhere
  app.use(authMiddleware);

  // Routes
  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/import', importRouter);

  // OAuth 2.1 endpoints for MCP authentication (RFC 8414, 7591)
  // - Authorization Server Metadata at /.well-known/oauth-authorization-server
  // - Dynamic Client Registration at /oauth/register
  // - Authorization at /oauth/authorize
  // - Token at /oauth/token
  app.get('/.well-known/oauth-authorization-server', authorizationServerMetadata);
  app.use('/oauth', createOAuthRouter());

  // Start auth code cleanup interval
  startAuthCodeCleanup();

  // GraphQL endpoint with auth check
  // - Allows introspection queries without auth
  // - Requires auth for all other operations
  app.all('/graphql', graphqlAuthMiddleware, (req, res) => {
    void yoga.handle(req, res);
  });

  // MCP endpoint for AI agent access
  // - Supports OAuth 2.1 Bearer tokens (for Claude.ai)
  // - Also supports API key authentication (legacy)
  // - Rate limited to 120 req/min per key
  app.use('/mcp', createMcpRouter());

  // Root
  app.get('/', (_req, res) => {
    res.json({ name: 'Cloud ValueRank API', version: '0.1.0' });
  });

  // Global error handler (per CLAUDE.md)
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    req.log.error({ err }, 'Request failed');

    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' });
    }
  });

  return app;
}
