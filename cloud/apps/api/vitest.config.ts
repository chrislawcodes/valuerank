import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Run test files sequentially to avoid database conflicts
    // (multiple test files clean and create the same LLM tables)
    fileParallelism: false,
    // Also run tests within each file sequentially for database isolation
    sequence: { concurrent: false },
    // Force single-threaded execution for database tests
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    reporters: ['default', 'json'],
    outputFile: {
      json: 'coverage/test-results.json',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
      },
    },
  },
});
