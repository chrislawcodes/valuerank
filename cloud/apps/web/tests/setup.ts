import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi, beforeAll, afterAll } from 'vitest';

// Suppress React's console.error noise from intentional throw tests.
// On Linux/jsdom, React logs expected errors to stderr before the throw
// propagates, causing vitest to exit non-zero even when all tests pass.
// Individual tests that need to assert on console.error can override this.
const originalConsoleError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    // Let through real errors; suppress React's error boundary re-throws.
    if (
      msg.includes('Error: Uncaught [') ||
      msg.includes('The above error occurred in') ||
      msg.includes('Consider adding an error boundary')
    ) {
      return;
    }
    originalConsoleError(...args);
  });
});
afterAll(() => {
  vi.restoreAllMocks();
});

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: function (key: string) {
    return this.store[key] || null;
  },
  setItem: function (key: string, value: string) {
    this.store[key] = value;
  },
  removeItem: function (key: string) {
    delete this.store[key];
  },
  clear: function () {
    this.store = {};
  },
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Reset localStorage before each test
afterEach(() => {
  localStorageMock.clear();
});
