import { getEnv } from '@valuerank/shared';

// Validate JWT_SECRET meets minimum requirements
function getJwtSecret(): string {
  const secret = getEnv('JWT_SECRET');
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return secret;
}

export const config = {
  PORT: parseInt(getEnv('PORT', '4000'), 10),
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  DATABASE_URL: getEnv('DATABASE_URL'),
  JWT_SECRET: getJwtSecret(),
  JWT_EXPIRES_IN: '24h',
} as const;

// Queue configuration (PgBoss)
export const queueConfig = {
  // Connection string (uses same database as app)
  connectionString: getEnv('DATABASE_URL'),
  // Maintenance interval in seconds
  maintenanceIntervalSeconds: parseInt(
    getEnv('PGBOSS_MAINTENANCE_INTERVAL', '30'),
    10
  ),
  // Monitor state interval in seconds
  monitorStateIntervalSeconds: 30,
  // Worker batch size per job type (jobs fetched at once)
  workerBatchSize: parseInt(getEnv('QUEUE_WORKER_BATCH_SIZE', '5'), 10),
  // Default job retention in seconds (24h)
  retentionSeconds: parseInt(getEnv('PGBOSS_RETENTION_SECONDS', '86400'), 10),
} as const;
