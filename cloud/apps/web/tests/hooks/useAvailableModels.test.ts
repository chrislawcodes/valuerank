import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { Provider } from 'urql';
import { fromValue, delay, pipe } from 'wonka';
import { useAvailableModels } from '../../src/hooks/useAvailableModels';

const mockModels = [
  {
    id: 'gpt-4o',
    providerId: 'openai',
    displayName: 'GPT-4o',
    versions: ['gpt-4o-2024-11-20', 'gpt-4o-2024-08-06'],
    defaultVersion: 'gpt-4o-2024-11-20',
    isAvailable: true,
  },
  {
    id: 'claude-3-5-sonnet',
    providerId: 'anthropic',
    displayName: 'Claude 3.5 Sonnet',
    versions: ['claude-3-5-sonnet-20241022'],
    defaultVersion: 'claude-3-5-sonnet-20241022',
    isAvailable: true,
  },
  {
    id: 'gemini-1.5-pro',
    providerId: 'google',
    displayName: 'Gemini 1.5 Pro',
    versions: ['gemini-1.5-pro-002'],
    defaultVersion: 'gemini-1.5-pro-002',
    isAvailable: false,
  },
];

function createMockClient(options: { models?: typeof mockModels; error?: Error | null } = {}) {
  const { models = mockModels, error = null } = options;

  return {
    executeQuery: vi.fn(() =>
      pipe(
        fromValue({
          data: { availableModels: models },
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

describe('useAvailableModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('query', () => {
    it('should return all models from query', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAvailableModels(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.models).toHaveLength(3);
      });
    });

    it('should map models correctly', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAvailableModels(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        const firstModel = result.current.models[0];
        expect(firstModel?.id).toBe('gpt-4o');
        expect(firstModel?.providerId).toBe('openai');
        expect(firstModel?.displayName).toBe('GPT-4o');
        expect(firstModel?.versions).toHaveLength(2);
        expect(firstModel?.isAvailable).toBe(true);
      });
    });

    it('should filter to only available models when onlyAvailable is true', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAvailableModels({ onlyAvailable: true }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.models).toHaveLength(2);
        expect(result.current.models.every((m) => m.isAvailable)).toBe(true);
      });
    });

    it('should handle empty models', async () => {
      const client = createMockClient({ models: [] });
      const { result } = renderHook(() => useAvailableModels(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.models).toEqual([]);
      });
    });

    it('should set loading state correctly', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAvailableModels(), {
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

      const { result } = renderHook(() => useAvailableModels(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.models).toEqual([]);
      });
    });
  });

  describe('refetch', () => {
    it('should provide refetch function', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useAvailableModels(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.refetch).toBeDefined();
      });

      result.current.refetch();
    });
  });

  describe('error handling', () => {
    it('should handle query errors', async () => {
      const client = createMockClient({ error: new Error('Query failed') });
      const { result } = renderHook(() => useAvailableModels(), {
        wrapper: wrapper(client),
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.error?.message).toBe('Query failed');
      });
    });
  });
});
