import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi, beforeAll, afterAll } from 'vitest';

// Global mock for recharts — prevents loading the full recharts + d3
// dependency tree (~10MB) which causes OOM in CI when accumulated across
// 140+ test files. Chart tests verify data flow, not SVG rendering.
vi.mock('recharts', () => {
  const stub = (name: string) => {
    const Component = (props: Record<string, unknown>) => null;
    Component.displayName = name;
    return Component;
  };
  return {
    BarChart: stub('BarChart'),
    Bar: stub('Bar'),
    LineChart: stub('LineChart'),
    Line: stub('Line'),
    XAxis: stub('XAxis'),
    YAxis: stub('YAxis'),
    CartesianGrid: stub('CartesianGrid'),
    Tooltip: stub('Tooltip'),
    Legend: stub('Legend'),
    ResponsiveContainer: stub('ResponsiveContainer'),
    Cell: stub('Cell'),
    ReferenceLine: stub('ReferenceLine'),
    ErrorBar: stub('ErrorBar'),
  };
});

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
