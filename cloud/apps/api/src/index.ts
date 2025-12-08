import { createServer } from './server.js';
import { config } from './config.js';
import { createLogger } from '@valuerank/shared';
import { startOrchestrator, stopOrchestrator } from './queue/index.js';

const log = createLogger('api');

async function main() {
  const app = createServer();

  const server = app.listen(config.PORT, () => {
    log.info({ port: config.PORT }, 'API server started');
  });

  // Start queue orchestrator after server is listening
  try {
    await startOrchestrator();
    log.info('Queue orchestrator started');
  } catch (err) {
    log.error({ err }, 'Failed to start queue orchestrator');
    // Continue running - queue can be started later
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutdown signal received');

    // Stop the queue orchestrator first (gracefully completes in-flight jobs)
    try {
      await stopOrchestrator();
      log.info('Queue orchestrator stopped');
    } catch (err) {
      log.error({ err }, 'Error stopping queue orchestrator');
    }

    server.close(() => {
      log.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  log.error({ err }, 'Failed to start server');
  process.exit(1);
});
