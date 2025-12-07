import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
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

function renderDefinitionList(props: {
  definitions: Definition[];
  loading: boolean;
  error: Error | null;
  onCreateNew?: () => void;
}) {
  return render(
    <BrowserRouter>
      <DefinitionList {...props} />
    </BrowserRouter>
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

    it('should show "Loading more..." when loading with existing definitions', () => {
      const definitions = [createMockDefinition()];
      renderDefinitionList({
        definitions,
        loading: true,
        error: null,
      });
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
      expect(screen.getByText('No definitions yet')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Create your first scenario definition to get started with AI moral values evaluation.'
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
        screen.getByRole('button', { name: /create definition/i })
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
        screen.getByRole('button', { name: /create definition/i })
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
      expect(screen.getByText('2 definitions')).toBeInTheDocument();
    });

    it('should render singular "definition" when count is 1', () => {
      const definitions = [createMockDefinition()];
      renderDefinitionList({
        definitions,
        loading: false,
        error: null,
      });
      expect(screen.getByText('1 definition')).toBeInTheDocument();
    });

    it('should render each definition card', () => {
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
      expect(screen.getByText('First Definition')).toBeInTheDocument();
      expect(screen.getByText('Second Definition')).toBeInTheDocument();
      expect(screen.getByText('Third Definition')).toBeInTheDocument();
    });

    it('should render "New Definition" button when onCreateNew provided', () => {
      const definitions = [createMockDefinition()];
      const onCreateNew = vi.fn();
      renderDefinitionList({
        definitions,
        loading: false,
        error: null,
        onCreateNew,
      });
      expect(
        screen.getByRole('button', { name: /new definition/i })
      ).toBeInTheDocument();
    });

    it('should call onCreateNew when "New Definition" button clicked', async () => {
      const user = userEvent.setup();
      const definitions = [createMockDefinition()];
      const onCreateNew = vi.fn();
      renderDefinitionList({
        definitions,
        loading: false,
        error: null,
        onCreateNew,
      });

      await user.click(screen.getByRole('button', { name: /new definition/i }));
      expect(onCreateNew).toHaveBeenCalledTimes(1);
    });

    it('should not render "New Definition" button when onCreateNew not provided', () => {
      const definitions = [createMockDefinition()];
      renderDefinitionList({
        definitions,
        loading: false,
        error: null,
      });
      expect(
        screen.queryByRole('button', { name: /new definition/i })
      ).not.toBeInTheDocument();
    });
  });
});
