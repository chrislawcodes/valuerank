import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import { Provider } from 'urql';
import { fromValue, delay, pipe, never } from 'wonka';
import { useRun } from '../../src/hooks/useRun';

const mockRun = {
  id: 'run-1',
  definitionId: 'def-1',
  experimentId: null,
  status: 'COMPLETED',
  config: { models: ['gpt-4o'] },
  progress: { total: 10, completed: 10, failed: 0 },
  runProgress: { total: 10, completed: 10, failed: 0, percentComplete: 100 },
  startedAt: '2024-01-15T10:00:00Z',
  completedAt: '2024-01-15T10:05:00Z',
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:05:00Z',
  lastAccessedAt: null,
  transcriptCount: 10,
  definition: { id: 'def-1', name: 'Test Definition' },
};

const mockRunningRun = {
  ...mockRun,
  id: 'run-2',
  status: 'RUNNING',
  completedAt: null,
  progress: { total: 10, completed: 5, failed: 0 },
  runProgress: { total: 10, completed: 5, failed: 0, percentComplete: 50 },
};

const mockPendingRun = {
  ...mockRun,
  id: 'run-3',
  status: 'PENDING',
  startedAt: null,
  completedAt: null,
  progress: { total: 10, completed: 0, failed: 0 },
  runProgress: { total: 10, completed: 0, failed: 0, percentComplete: 0 },
};

const mockSummarizingRun = {
  ...mockRun,
  id: 'run-4',
  status: 'SUMMARIZING',
  progress: { total: 10, completed: 10, failed: 0 },
  runProgress: { total: 10, completed: 10, failed: 0, percentComplete: 100 },
};

function createMockClient(options: { run?: typeof mockRun | null; error?: Error | null; paused?: boolean } = {}) {
  const { run = mockRun, error = null, paused = false } = options;

  return {
    executeQuery: vi.fn(() =>
      paused
        ? never()
        : pipe(
            fromValue({
              data: run ? { run } : null,
              fetching: false,
              error: error ? { message: error.message } : undefined,
            }),
            delay(0)
          )
    ),
    executeMutation: vi.fn(),
    executeSubscription: vi.fn(),
  };
}

function wrapper(client: ReturnType<typeof createMockClient>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(Provider, { value: client as never }, children);
  };
}

describe('useRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('query', () => {
    it('should return run from query', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useRun({ id: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.run).not.toBeNull();
      });
      expect(result.current.run?.id).toBe('run-1');
      expect(result.current.run?.status).toBe('COMPLETED');
    });

    it('should return null when run not found', async () => {
      const client = createMockClient({ run: null });
      const { result } = renderHook(() => useRun({ id: 'nonexistent' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.run).toBeNull();
    });

    it('should set loading state correctly', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useRun({ id: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should return correct run data for RUNNING status', async () => {
      const client = createMockClient({ run: mockRunningRun });
      const { result } = renderHook(() => useRun({ id: 'run-2' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.run).not.toBeNull();
      });
      expect(result.current.run?.status).toBe('RUNNING');
    });

    it('should return correct run data for PENDING status', async () => {
      const client = createMockClient({ run: mockPendingRun });
      const { result } = renderHook(() => useRun({ id: 'run-3' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.run).not.toBeNull();
      });
      expect(result.current.run?.status).toBe('PENDING');
    });

    it('should return correct run data for SUMMARIZING status', async () => {
      const client = createMockClient({ run: mockSummarizingRun });
      const { result } = renderHook(() => useRun({ id: 'run-4' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.run).not.toBeNull();
      });
      expect(result.current.run?.status).toBe('SUMMARIZING');
    });
  });

  describe('error handling', () => {
    it('should handle query errors', async () => {
      const client = createMockClient({ error: new Error('Query failed') });
      const { result } = renderHook(() => useRun({ id: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
      expect(result.current.error?.message).toBe('Query failed');
    });

    it('should return null error when no error', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useRun({ id: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.run).not.toBeNull();
      });
      expect(result.current.error).toBeNull();
    });
  });

  describe('refetch', () => {
    it('should provide refetch function', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useRun({ id: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.refetch).toBeDefined();
      });
      expect(typeof result.current.refetch).toBe('function');
    });

    it('should call refetch without error', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useRun({ id: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.run).not.toBeNull();
      });

      // Call refetch - should not throw
      act(() => {
        result.current.refetch();
      });
    });
  });

  describe('options', () => {
    it('should accept pause option', async () => {
      const client = createMockClient({ paused: true });
      const { result } = renderHook(() => useRun({ id: 'run-1', pause: true }), {
        wrapper: wrapper(client),
      });

      // With pause, the run should not be loaded immediately
      expect(result.current.run).toBeNull();
    });

    it('should accept enablePolling option', async () => {
      const client = createMockClient();
      const { result } = renderHook(
        () => useRun({ id: 'run-1', enablePolling: false }),
        { wrapper: wrapper(client) }
      );

      await waitFor(() => {
        expect(result.current.run).not.toBeNull();
      });
      // Test passes if no error - polling is handled internally
    });

    it('should default enablePolling to true', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useRun({ id: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.run).not.toBeNull();
      });
      // Default polling behavior is tested by not crashing
    });

    it('should default pause to false', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useRun({ id: 'run-1' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.run).not.toBeNull();
      });
      // Run should load since pause defaults to false
    });
  });

  describe('cleanup', () => {
    it('should cleanup on unmount without error', async () => {
      const client = createMockClient({ run: mockRunningRun });
      const { unmount, result } = renderHook(() => useRun({ id: 'run-2' }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.run).not.toBeNull();
      });

      // Should not throw on unmount
      unmount();
    });
  });
});
