import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { Provider } from 'urql';
import { fromValue, delay, pipe } from 'wonka';
import { useTags } from '../../src/hooks/useTags';

const mockTags = [
  { id: 'tag-1', name: 'ethics', createdAt: '2024-01-15T10:00:00Z' },
  { id: 'tag-2', name: 'safety', createdAt: '2024-01-15T10:00:00Z' },
];

function createMockClient(options: {
  tags?: typeof mockTags;
  createResult?: object;
  deleteResult?: object;
  error?: Error | null;
} = {}) {
  const {
    tags = mockTags,
    createResult = { id: 'new-tag', name: 'new-tag', createdAt: '2024-01-15T10:00:00Z' },
    deleteResult = { id: 'tag-1' },
    error = null,
  } = options;

  return {
    executeQuery: vi.fn(() =>
      pipe(
        fromValue({
          data: { tags },
          fetching: false,
          error: error ? { message: error.message } : undefined,
        }),
        delay(0)
      )
    ),
    executeMutation: vi.fn((args) => {
      const operationName = args.query?.definitions?.[0]?.name?.value || '';

      if (error) {
        return pipe(fromValue({ error: { message: error.message } }), delay(0));
      }

      if (operationName.includes('CreateTag')) {
        return pipe(fromValue({ data: { createTag: createResult } }), delay(0));
      }
      if (operationName.includes('DeleteTag')) {
        return pipe(fromValue({ data: { deleteTag: deleteResult } }), delay(0));
      }

      return pipe(fromValue({ data: null }), delay(0));
    }),
    executeSubscription: vi.fn(),
  };
}

function wrapper(client: ReturnType<typeof createMockClient>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(Provider, { value: client as never }, children);
  };
}

describe('useTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('query', () => {
    it('should return tags from query', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useTags(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.tags).toEqual(mockTags);
      });
    });

    it('should set loading state correctly', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useTags(), {
        wrapper: wrapper(client),
      });

      // After the query resolves
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should support search option', async () => {
      const client = createMockClient();
      renderHook(() => useTags({ search: 'eth' }), {
        wrapper: wrapper(client),
      });

      expect(client.executeQuery).toHaveBeenCalled();
    });

    it('should support limit option', async () => {
      const client = createMockClient();
      renderHook(() => useTags({ limit: 5 }), {
        wrapper: wrapper(client),
      });

      expect(client.executeQuery).toHaveBeenCalled();
    });
  });

  describe('createTag', () => {
    it('should call createTag mutation', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useTags(), {
        wrapper: wrapper(client),
      });

      await act(async () => {
        await result.current.createTag('new-tag');
      });

      expect(client.executeMutation).toHaveBeenCalled();
    });

    it('should return created tag', async () => {
      const client = createMockClient({
        createResult: { id: 'created-1', name: 'created', createdAt: '2024-01-15T10:00:00Z' },
      });
      const { result } = renderHook(() => useTags(), {
        wrapper: wrapper(client),
      });

      let created: object | undefined;
      await act(async () => {
        created = await result.current.createTag('created');
      });

      expect(created).toEqual({ id: 'created-1', name: 'created', createdAt: '2024-01-15T10:00:00Z' });
    });
  });

  describe('deleteTag', () => {
    it('should call deleteTag mutation', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useTags(), {
        wrapper: wrapper(client),
      });

      await act(async () => {
        await result.current.deleteTag('tag-1');
      });

      expect(client.executeMutation).toHaveBeenCalled();
    });
  });

  describe('refetch', () => {
    it('should provide refetch function', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useTags(), {
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
