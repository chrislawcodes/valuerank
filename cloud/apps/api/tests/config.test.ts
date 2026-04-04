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
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test_test';

    const { config } = await import('../src/config.js');

    expect(config.PORT).toBe(4000);
  });

  it('parses PORT from environment', async () => {
    process.env.PORT = '5000';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test_test';

    const { config } = await import('../src/config.js');

    expect(config.PORT).toBe(5000);
  });

  it('uses default NODE_ENV when not set', async () => {
    delete process.env.NODE_ENV;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test_test';

    const { config } = await import('../src/config.js');

    expect(config.NODE_ENV).toBe('development');
  });

  it('reads DATABASE_URL from environment', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host/db_test';

    const { config } = await import('../src/config.js');

    expect(config.DATABASE_URL).toBe('postgresql://user:pass@host/db_test');
  });

  it('reads JWT_SECRET from environment', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test_test';
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    const { config } = await import('../src/config.js');

    expect(config.JWT_SECRET).toBe(TEST_JWT_SECRET);
  });

  it('throws if JWT_SECRET is too short', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test_test';
    process.env.JWT_SECRET = 'short';

    await expect(import('../src/config.js')).rejects.toThrow(
      'JWT_SECRET must be at least 32 characters'
    );
  });

  it('defaults DECISION_MODEL_V2 to false', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test_test';
    delete process.env.DECISION_MODEL_V2;

    const { config } = await import('../src/config.js');

    expect(config.DECISION_MODEL_V2).toBe(false);
  });

  it('reads DECISION_MODEL_V2 when enabled', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test_test';
    process.env.DECISION_MODEL_V2 = 'true';

    const { config } = await import('../src/config.js');

    expect(config.DECISION_MODEL_V2).toBe(true);
  });

  it('defaults SUMMARIZE_PARSER_VERSION to the current worker version', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test_test';
    delete process.env.SUMMARIZE_PARSER_VERSION;

    const { config } = await import('../src/config.js');

    expect(config.SUMMARIZE_PARSER_VERSION).toBe('paired-v2');
  });

  it('reads SUMMARIZE_PARSER_VERSION from environment', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test_test';
    process.env.SUMMARIZE_PARSER_VERSION = 'parser-override-1';

    const { config } = await import('../src/config.js');

    expect(config.SUMMARIZE_PARSER_VERSION).toBe('parser-override-1');
  });
});
