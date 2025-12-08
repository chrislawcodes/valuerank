import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // CRITICAL: Setup file forces test database - prevents production data loss
    setupFiles: ['tests/setup.ts'],
    reporters: ['default', 'json'],
    outputFile: {
      json: 'coverage/test-results.json',
    },
    // Run tests sequentially since integration tests share a database
    sequence: {
      concurrent: false,
    },
    // Run test files sequentially
    fileParallelism: false,
    // DO NOT load .env file - it contains production DATABASE_URL
    // Test database URL is set in tests/setup.ts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types.ts', 'src/queries/index.ts'],
    },
  },
});
