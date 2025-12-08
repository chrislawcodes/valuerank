import { Router } from 'express';
import type { RequestHandler } from 'express';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  getProviderHealth,
  getQueueHealth,
  getWorkerHealth,
} from './services/health/index.js';

const log = createLogger('health');

export const healthRouter = Router();

// Basic health check - database connectivity
healthRouter.get('/', ((_req, res) => {
  void (async () => {
  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
      },
    });
  } catch (err) {
    log.error({ err }, 'Health check failed');
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'disconnected',
      },
    });
  }
  })();
}) as RequestHandler);

// Provider health check - LLM API connectivity
healthRouter.get('/providers', ((_req, res) => {
  void (async () => {
    try {
      const refresh = _req.query.refresh === 'true';
      log.info({ refresh }, 'Provider health check requested');

      const result = await getProviderHealth(refresh);

      res.json({
        status: 'ok',
        ...result,
      });
    } catch (err) {
      log.error({ err }, 'Provider health check failed');
      res.status(500).json({
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  })();
}) as RequestHandler);

// Queue health check - job queue status
healthRouter.get('/queue', ((_req, res) => {
  void (async () => {
    try {
      log.info('Queue health check requested');

      const result = await getQueueHealth();

      res.json({
        status: result.isHealthy ? 'ok' : 'degraded',
        ...result,
      });
    } catch (err) {
      log.error({ err }, 'Queue health check failed');
      res.status(500).json({
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  })();
}) as RequestHandler);

// Worker health check - Python worker status
healthRouter.get('/workers', ((_req, res) => {
  void (async () => {
    try {
      const refresh = _req.query.refresh === 'true';
      log.info({ refresh }, 'Worker health check requested');

      const result = await getWorkerHealth(refresh);

      res.json({
        status: result.isHealthy ? 'ok' : 'unhealthy',
        ...result,
      });
    } catch (err) {
      log.error({ err }, 'Worker health check failed');
      res.status(500).json({
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  })();
}) as RequestHandler);

// Combined system health check
healthRouter.get('/system', ((_req, res) => {
  void (async () => {
    try {
      const refresh = _req.query.refresh === 'true';
      log.info({ refresh }, 'System health check requested');

      // Run all health checks in parallel
      const [providers, queue, worker, database] = await Promise.all([
        getProviderHealth(refresh),
        getQueueHealth(),
        getWorkerHealth(refresh),
        db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      ]);

      const isHealthy = database && queue.isHealthy && worker.isHealthy;

      res.json({
        status: isHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        database: database ? 'connected' : 'disconnected',
        providers,
        queue,
        worker,
      });
    } catch (err) {
      log.error({ err }, 'System health check failed');
      res.status(500).json({
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  })();
}) as RequestHandler);
