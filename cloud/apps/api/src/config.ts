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
  PORT: parseInt(getEnv('PORT', '3001'), 10),
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  DATABASE_URL: getEnv('DATABASE_URL'),
  JWT_SECRET: getJwtSecret(),
  JWT_EXPIRES_IN: '24h',
} as const;
