/**
 * PgBoss Queue Initialization
 *
 * Configures and exports the PgBoss instance for job queue management.
 */

import { PgBoss } from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import { queueConfig } from '../config.js';

const log = createLogger('queue:boss');

let bossInstance: PgBoss | null = null;

/**
 * Creates and configures the PgBoss instance.
 * Uses singleton pattern - returns existing instance if already created.
 */
export function createBoss(): PgBoss {
  if (bossInstance) {
    return bossInstance;
  }

  log.info('Initializing PgBoss queue');

  bossInstance = new PgBoss({
    connectionString: queueConfig.connectionString,
    // Maintenance settings
    maintenanceIntervalSeconds: queueConfig.maintenanceIntervalSeconds,
    // Monitoring interval
    monitorIntervalSeconds: queueConfig.monitorStateIntervalSeconds,
    // Use existing schema if available
    schema: 'pgboss',
  });

  // Event handlers
  bossInstance.on('error', (error) => {
    log.error({ err: error }, 'PgBoss error');
  });

  bossInstance.on('wip', (data) => {
    log.debug({ wip: data }, 'Queue work in progress');
  });

  return bossInstance;
}

/**
 * Gets the current PgBoss instance.
 * Throws if not initialized.
 */
export function getBoss(): PgBoss {
  if (!bossInstance) {
    throw new Error('PgBoss not initialized. Call createBoss() first.');
  }
  return bossInstance;
}

/**
 * Starts PgBoss queue processing.
 * Must be called after server initialization.
 */
export async function startBoss(): Promise<void> {
  const boss = createBoss();

  log.info('Starting PgBoss');
  await boss.start();
  log.info('PgBoss started successfully');
}

/**
 * Gracefully stops PgBoss queue processing.
 * Completes in-flight jobs before stopping.
 */
export async function stopBoss(): Promise<void> {
  if (!bossInstance) {
    log.warn('PgBoss not running, nothing to stop');
    return;
  }

  log.info('Stopping PgBoss gracefully');
  await bossInstance.stop({ graceful: true, timeout: 30000 });
  bossInstance = null;
  log.info('PgBoss stopped');
}

/**
 * Checks if PgBoss is currently running.
 */
export function isBossRunning(): boolean {
  return bossInstance !== null;
}
