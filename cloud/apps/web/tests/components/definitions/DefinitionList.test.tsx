import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'urql';
import { fromValue, delay, pipe } from 'wonka';
import { DefinitionList } from '../../../src/components/definitions/DefinitionList';
import type { Definition } from '../../../src/api/operations/definitions';

function createMockDefinition(overrides: Partial<Definition> = {}): Definition {
  return {
    id: 'def-1',
    name: 'Test Definition',
    parentId: null,
    runCount: 0,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    tags: [],
    children: [],
    ...overrides,
  };
}

// Mock urql client for DefinitionFilters which uses useTags
function createMockClient() {
  return {
    executeQuery: vi.fn(() =>
      pipe(
        fromValue({
          data: { tags: [] },
        }),
        delay(0)
      )
    ),
    executeMutation: vi.fn(),
    executeSubscription: vi.fn(),
  };
}

function renderDefinitionList(props: {
  definitions: Definition[];
  loading: boolean;
  error: Error | null;
  onCreateNew?: () => void;
}) {
  const client = createMockClient();
  return render(
    <Provider value={client as never}>
      <BrowserRouter>
        <DefinitionList {...props} />
      </BrowserRouter>
    </Provider>
  );
}

describe('DefinitionList', () => {
  describe('loading state', () => {
    it('should render loading skeleton when loading and no definitions', () => {
      const { container } = renderDefinitionList({
        definitions: [],
        loading: true,
        error: null,
      });
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('should show "Loading more..." when loading with existing definitions', async () => {
      const user = userEvent.setup();
      const definitions = [createMockDefinition()];
      renderDefinitionList({
        definitions,
        loading: true,
        error: null,
      });
      // Switch to flat view to see loading indicator with definitions
      await user.click(screen.getByRole('button', { name: /list view/i }));
      expect(screen.getByText('Loading more...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should render error message when error exists', () => {
      renderDefinitionList({
        definitions: [],
        loading: false,
        error: new Error('Network error'),
      });
      expect(
        screen.getByText('Failed to load definitions: Network error')
      ).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should render empty state when no definitions', () => {
      renderDefinitionList({
        definitions: [],
        loading: false,
        error: null,
      });
      expect(screen.getByText('No vignettes yet')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Create your first vignette to get started with AI moral values evaluation.'
        )
      ).toBeInTheDocument();
    });

    it('should render create button in empty state when onCreateNew provided', () => {
      const onCreateNew = vi.fn();
      renderDefinitionList({
        definitions: [],
        loading: false,
        error: null,
        onCreateNew,
      });
      expect(
        screen.getByRole('button', { name: /create vignette/i })
      ).toBeInTheDocument();
    });

    it('should call onCreateNew when empty state create button clicked', async () => {
      const user = userEvent.setup();
      const onCreateNew = vi.fn();
      renderDefinitionList({
        definitions: [],
        loading: false,
        error: null,
        onCreateNew,
      });

      await user.click(
        screen.getByRole('button', { name: /create vignette/i })
      );
      expect(onCreateNew).toHaveBeenCalledTimes(1);
    });
  });

  describe('with definitions', () => {
    it('should render definition count', () => {
      const definitions = [
        createMockDefinition({ id: 'def-1', name: 'Definition 1' }),
        createMockDefinition({ id: 'def-2', name: 'Definition 2' }),
      ];
      renderDefinitionList({
        definitions,
        loading: false,
        error: null,
      });
      expect(screen.getByText('2 vignettes')).toBeInTheDocument();
    });

    it('should render singular "definition" when count is 1', () => {
      const definitions = [createMockDefinition()];
      renderDefinitionList({
        definitions,
        loading: false,
        error: null,
      });
      expect(screen.getByText('1 vignette')).toBeInTheDocument();
    });

    it('should render each definition card in flat view', async () => {
      const user = userEvent.setup();
      const definitions = [
        createMockDefinition({ id: 'def-1', name: 'First Definition' }),
        createMockDefinition({ id: 'def-2', name: 'Second Definition' }),
        createMockDefinition({ id: 'def-3', name: 'Third Definition' }),
      ];
      renderDefinitionList({
        definitions,
        loading: false,
        error: null,
      });
      // Switch to flat view to see definition cards directly
      await user.click(screen.getByRole('button', { name: /list view/i }));
      expect(screen.getByText('First Definition')).toBeInTheDocument();
      expect(screen.getByText('Second Definition')).toBeInTheDocument();
      expect(screen.getByText('Third Definition')).toBeInTheDocument();
    });

    it('should render "New Vignette" button when onCreateNew provided', () => {
      const definitions = [createMockDefinition()];
      const onCreateNew = vi.fn();
      renderDefinitionList({
        definitions,
        loading: false,
        error: null,
        onCreateNew,
      });
      expect(
        screen.getByRole('button', { name: /new vignette/i })
      ).toBeInTheDocument();
    });

    it('should call onCreateNew when "New Vignette" button clicked', async () => {
      const user = userEvent.setup();
      const definitions = [createMockDefinition()];
      const onCreateNew = vi.fn();
      renderDefinitionList({
        definitions,
        loading: false,
        error: null,
        onCreateNew,
      });

      await user.click(screen.getByRole('button', { name: /new vignette/i }));
      expect(onCreateNew).toHaveBeenCalledTimes(1);
    });

    it('should not render "New Vignette" button when onCreateNew not provided', () => {
      const definitions = [createMockDefinition()];
      renderDefinitionList({
        definitions,
        loading: false,
        error: null,
      });
      expect(
        screen.queryByRole('button', { name: /new vignette/i })
      ).not.toBeInTheDocument();
    });
  });
});
