import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('config', () => {
  const originalEnv = process.env;
  const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Always set JWT_SECRET for tests
    process.env.JWT_SECRET = TEST_JWT_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses default PORT when not set', async () => {
    delete process.env.PORT;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';

    const { config } = await import('../src/config.js');

    expect(config.PORT).toBe(4000);
  });

  it('parses PORT from environment', async () => {
    process.env.PORT = '5000';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';

    const { config } = await import('../src/config.js');

    expect(config.PORT).toBe(5000);
  });

  it('uses default NODE_ENV when not set', async () => {
    delete process.env.NODE_ENV;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';

    const { config } = await import('../src/config.js');

    expect(config.NODE_ENV).toBe('development');
  });

  it('reads DATABASE_URL from environment', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host/db';

    const { config } = await import('../src/config.js');

    expect(config.DATABASE_URL).toBe('postgresql://user:pass@host/db');
  });

  it('reads JWT_SECRET from environment', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    const { config } = await import('../src/config.js');

    expect(config.JWT_SECRET).toBe(TEST_JWT_SECRET);
  });

  it('throws if JWT_SECRET is too short', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
    process.env.JWT_SECRET = 'short';

    await expect(import('../src/config.js')).rejects.toThrow(
      'JWT_SECRET must be at least 32 characters'
    );
  });
});
