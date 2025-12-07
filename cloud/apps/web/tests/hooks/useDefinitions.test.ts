import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { Provider } from 'urql';
import { fromValue, delay, pipe } from 'wonka';
import { useDefinitions } from '../../src/hooks/useDefinitions';

const mockDefinitions = [
  {
    id: 'def-1',
    name: 'Test Definition 1',
    parentId: null,
    runCount: 5,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    tags: [{ id: 'tag-1', name: 'ethics', createdAt: '2024-01-15T10:00:00Z' }],
    children: [],
  },
  {
    id: 'def-2',
    name: 'Test Definition 2',
    parentId: 'def-1',
    runCount: 0,
    createdAt: '2024-01-16T10:00:00Z',
    updatedAt: '2024-01-16T10:00:00Z',
    tags: [],
    children: [],
  },
];

function createMockClient(options: {
  definitions?: typeof mockDefinitions;
  error?: Error | null;
} = {}) {
  const { definitions = mockDefinitions, error = null } = options;

  return {
    executeQuery: vi.fn(() =>
      pipe(
        fromValue({
          data: { definitions },
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

describe('useDefinitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('query', () => {
    it('should return definitions from query', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useDefinitions(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.definitions).toHaveLength(2);
      });
    });

    it('should map definitions correctly', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useDefinitions(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        const firstDef = result.current.definitions[0];
        expect(firstDef?.id).toBe('def-1');
        expect(firstDef?.name).toBe('Test Definition 1');
        expect(firstDef?.runCount).toBe(5);
        expect(firstDef?.tags).toHaveLength(1);
      });
    });

    it('should handle empty definitions', async () => {
      const client = createMockClient({ definitions: [] });
      const { result } = renderHook(() => useDefinitions(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.definitions).toEqual([]);
      });
    });

    it('should set loading state correctly', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useDefinitions(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should handle null data', async () => {
      const client = createMockClient();
      // Override to return null data
      client.executeQuery = vi.fn(() =>
        pipe(
          fromValue({ data: null, fetching: false }),
          delay(0)
        )
      );

      const { result } = renderHook(() => useDefinitions(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.definitions).toEqual([]);
      });
    });

    it('should support search filter', async () => {
      const client = createMockClient();
      renderHook(() => useDefinitions({ search: 'test' }), {
        wrapper: wrapper(client),
      });

      expect(client.executeQuery).toHaveBeenCalled();
    });

    it('should support tagIds filter', async () => {
      const client = createMockClient();
      renderHook(() => useDefinitions({ tagIds: ['tag-1'] }), {
        wrapper: wrapper(client),
      });

      expect(client.executeQuery).toHaveBeenCalled();
    });

    it('should support rootOnly filter', async () => {
      const client = createMockClient();
      renderHook(() => useDefinitions({ rootOnly: true }), {
        wrapper: wrapper(client),
      });

      expect(client.executeQuery).toHaveBeenCalled();
    });

    it('should support hasRuns filter', async () => {
      const client = createMockClient();
      renderHook(() => useDefinitions({ hasRuns: true }), {
        wrapper: wrapper(client),
      });

      expect(client.executeQuery).toHaveBeenCalled();
    });
  });

  describe('refetch', () => {
    it('should provide refetch function', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useDefinitions(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.refetch).toBeDefined();
      });

      // Call refetch
      result.current.refetch();
    });
  });
});
