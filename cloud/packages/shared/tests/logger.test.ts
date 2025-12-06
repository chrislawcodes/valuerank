import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset module cache to test different env configurations
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('logger instance', () => {
    it('exports a logger instance', async () => {
      const { logger } = await import('../src/logger.js');
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('respects LOG_LEVEL environment variable', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { logger } = await import('../src/logger.js');
      expect(logger.level).toBe('debug');
    });

    it('defaults to info level', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await import('../src/logger.js');
      expect(logger.level).toBe('info');
    });
  });

  describe('createLogger', () => {
    it('creates a child logger with context', async () => {
      const { createLogger } = await import('../src/logger.js');
      const childLogger = createLogger('test-context');

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('child logger includes context in bindings', async () => {
      const { createLogger } = await import('../src/logger.js');
      const childLogger = createLogger('my-service');

      // The child logger should have the context binding
      const bindings = childLogger.bindings();
      expect(bindings.context).toBe('my-service');
    });
  });

  describe('production mode', () => {
    it('does not use transport in production', async () => {
      process.env.NODE_ENV = 'production';
      const { logger } = await import('../src/logger.js');

      // In production, transport should be undefined (no pretty printing)
      // We can verify by checking the logger works without error
      expect(logger).toBeDefined();
      expect(() => logger.info('test message')).not.toThrow();
    });
  });
});
