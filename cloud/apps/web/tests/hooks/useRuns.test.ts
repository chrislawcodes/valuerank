import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { Provider } from 'urql';
import { fromValue, delay, pipe } from 'wonka';
import { useRuns } from '../../src/hooks/useRuns';

const mockRuns = [
  {
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
  },
  {
    id: 'run-2',
    definitionId: 'def-1',
    experimentId: null,
    status: 'RUNNING',
    config: { models: ['claude-3-5-sonnet'] },
    progress: { total: 10, completed: 5, failed: 0 },
    runProgress: { total: 10, completed: 5, failed: 0, percentComplete: 50 },
    startedAt: '2024-01-16T10:00:00Z',
    completedAt: null,
    createdAt: '2024-01-16T10:00:00Z',
    updatedAt: '2024-01-16T10:02:00Z',
    lastAccessedAt: null,
    transcriptCount: 5,
    definition: { id: 'def-1', name: 'Test Definition' },
  },
];

function createMockClient(options: { runs?: typeof mockRuns; error?: Error | null } = {}) {
  const { runs = mockRuns, error = null } = options;

  return {
    executeQuery: vi.fn(() =>
      pipe(
        fromValue({
          data: { runs },
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

describe('useRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('query', () => {
    it('should return runs from query', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useRuns(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.runs).toHaveLength(2);
      });
    });

    it('should map runs correctly', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useRuns(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        const firstRun = result.current.runs[0];
        expect(firstRun?.id).toBe('run-1');
        expect(firstRun?.status).toBe('COMPLETED');
        expect(firstRun?.transcriptCount).toBe(10);
        expect(firstRun?.definition.name).toBe('Test Definition');
      });
    });

    it('should handle empty runs', async () => {
      const client = createMockClient({ runs: [] });
      const { result } = renderHook(() => useRuns(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.runs).toEqual([]);
      });
    });

    it('should set loading state correctly', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useRuns(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should handle null data', async () => {
      const client = createMockClient();
      client.executeQuery = vi.fn(() =>
        pipe(
          fromValue({ data: null, fetching: false }),
          delay(0)
        )
      );

      const { result } = renderHook(() => useRuns(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.runs).toEqual([]);
      });
    });

    it('should support definitionId filter', async () => {
      const client = createMockClient();
      renderHook(() => useRuns({ definitionId: 'def-1' }), {
        wrapper: wrapper(client),
      });

      expect(client.executeQuery).toHaveBeenCalled();
    });

    it('should support status filter', async () => {
      const client = createMockClient();
      renderHook(() => useRuns({ status: 'RUNNING' }), {
        wrapper: wrapper(client),
      });

      expect(client.executeQuery).toHaveBeenCalled();
    });

    it('should support pagination', async () => {
      const client = createMockClient();
      renderHook(() => useRuns({ limit: 10, offset: 20 }), {
        wrapper: wrapper(client),
      });

      expect(client.executeQuery).toHaveBeenCalled();
    });
  });

  describe('refetch', () => {
    it('should provide refetch function', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useRuns(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.refetch).toBeDefined();
      });

      // Call refetch
      result.current.refetch();
    });
  });

  describe('error handling', () => {
    it('should handle query errors', async () => {
      const client = createMockClient({ error: new Error('Query failed') });
      const { result } = renderHook(() => useRuns(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.error?.message).toBe('Query failed');
      });
    });
  });
});
