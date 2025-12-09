import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    reporters: ['default', 'json'],
    outputFile: {
      json: 'coverage/test-results.json',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts'],
      all: true,
      reportOnFailure: true,
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 65, // Lower threshold for UI components (many callback functions)
      },
    },
  },
});
