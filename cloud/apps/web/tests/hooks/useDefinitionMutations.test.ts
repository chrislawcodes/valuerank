import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { Provider } from 'urql';
import { fromValue, delay, pipe } from 'wonka';
import { useDefinitionMutations } from '../../src/hooks/useDefinitionMutations';

function createMockClient(options: {
  createResult?: object;
  updateResult?: object;
  forkResult?: object;
  deleteResult?: object;
  error?: Error | null;
} = {}) {
  const {
    createResult = { id: 'new-def-1', name: 'New Definition' },
    updateResult = { id: 'def-1', name: 'Updated Definition' },
    forkResult = { id: 'fork-def-1', name: 'Forked Definition' },
    deleteResult = { id: 'def-1' },
    error = null,
  } = options;

  return {
    executeQuery: vi.fn(() => pipe(fromValue({ data: null }), delay(0))),
    executeMutation: vi.fn((args) => {
      const operationName = args.query?.definitions?.[0]?.name?.value || '';

      if (error) {
        return pipe(fromValue({ error: { message: error.message } }), delay(0));
      }

      if (operationName.includes('Create')) {
        return pipe(fromValue({ data: { createDefinition: createResult } }), delay(0));
      }
      if (operationName.includes('Update')) {
        return pipe(fromValue({ data: { updateDefinition: updateResult } }), delay(0));
      }
      if (operationName.includes('Fork')) {
        return pipe(fromValue({ data: { forkDefinition: forkResult } }), delay(0));
      }
      if (operationName.includes('Delete')) {
        return pipe(fromValue({ data: { deleteDefinition: deleteResult } }), delay(0));
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

describe('useDefinitionMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDefinition', () => {
    it('should call createDefinition mutation with correct params', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useDefinitionMutations(), {
        wrapper: wrapper(client),
      });

      const content = {
        schema_version: 1,
        preamble: 'Test preamble',
        template: 'Test template',
        dimensions: [],
      };

      await act(async () => {
        await result.current.createDefinition({ name: 'Test Definition', content });
      });

      expect(client.executeMutation).toHaveBeenCalled();
    });

    it('should return the created definition', async () => {
      const client = createMockClient({
        createResult: { id: 'created-1', name: 'Created Definition' },
      });
      const { result } = renderHook(() => useDefinitionMutations(), {
        wrapper: wrapper(client),
      });

      const content = {
        schema_version: 1,
        preamble: '',
        template: 'Test',
        dimensions: [],
      };

      let created: object | undefined;
      await act(async () => {
        created = await result.current.createDefinition({ name: 'Test', content });
      });

      expect(created).toEqual({ id: 'created-1', name: 'Created Definition' });
    });

  });

  describe('updateDefinition', () => {
    it('should call updateDefinition mutation with correct params', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useDefinitionMutations(), {
        wrapper: wrapper(client),
      });

      const content = {
        schema_version: 1,
        preamble: 'Updated preamble',
        template: 'Updated template',
        dimensions: [],
      };

      await act(async () => {
        await result.current.updateDefinition('def-1', { name: 'Updated', content });
      });

      expect(client.executeMutation).toHaveBeenCalled();
    });
  });

  describe('forkDefinition', () => {
    it('should call forkDefinition mutation with correct params', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useDefinitionMutations(), {
        wrapper: wrapper(client),
      });

      await act(async () => {
        await result.current.forkDefinition('parent-1', 'Forked Version');
      });

      expect(client.executeMutation).toHaveBeenCalled();
    });

    it('should return the forked definition', async () => {
      const client = createMockClient({
        forkResult: { id: 'forked-1', name: 'Forked Definition' },
      });
      const { result } = renderHook(() => useDefinitionMutations(), {
        wrapper: wrapper(client),
      });

      let forked: object | undefined;
      await act(async () => {
        forked = await result.current.forkDefinition('parent-1', 'Fork');
      });

      expect(forked).toEqual({ id: 'forked-1', name: 'Forked Definition' });
    });
  });

  describe('deleteDefinition', () => {
    it('should call deleteDefinition mutation with correct id', async () => {
      const client = createMockClient();
      const { result } = renderHook(() => useDefinitionMutations(), {
        wrapper: wrapper(client),
      });

      await act(async () => {
        await result.current.deleteDefinition('def-to-delete');
      });

      expect(client.executeMutation).toHaveBeenCalled();
    });

  });
});
