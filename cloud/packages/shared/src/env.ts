/**
 * Get environment variable with optional default.
 * Returns default if not set, throws if required and not set.
 */
export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined) {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Required environment variable ${key} is not set`);
}

/**
 * Get required environment variable. Throws if not set.
 */
export function getEnvRequired(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Get optional environment variable. Returns undefined if not set.
 */
export function getEnvOptional(key: string): string | undefined {
  return process.env[key];
}
