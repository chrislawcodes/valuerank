import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DefinitionFilters, type DefinitionFilterState } from '../../../src/components/definitions/DefinitionFilters';
import type { Tag } from '../../../src/api/operations/tags';
import { Provider } from 'urql';
import { fromValue } from 'wonka';

// Mock tags
const mockTags: Tag[] = [
  { id: 'tag-1', name: 'ethics', createdAt: '2024-01-15T10:00:00Z' },
  { id: 'tag-2', name: 'safety', createdAt: '2024-01-15T10:00:00Z' },
];

function createMockClient(tags: Tag[] = mockTags) {
  return {
    executeQuery: vi.fn(() =>
      fromValue({
        data: { tags },
      })
    ),
    executeMutation: vi.fn(),
    executeSubscription: vi.fn(),
  };
}

function renderWithUrql(
  ui: React.ReactElement,
  { client = createMockClient() } = {}
) {
  return {
    ...render(
      <Provider value={client as never}>{ui}</Provider>
    ),
    client,
  };
}

describe('DefinitionFilters', () => {
  const defaultFilters: DefinitionFilterState = {
    search: '',
    rootOnly: false,
    hasRuns: false,
    tagIds: [],
  };

  const mockOnFiltersChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render search input', () => {
    renderWithUrql(
      <DefinitionFilters
        filters={defaultFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    expect(screen.getByPlaceholderText('Search definitions...')).toBeInTheDocument();
  });

  it('should render filter toggle buttons', () => {
    renderWithUrql(
      <DefinitionFilters
        filters={defaultFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    expect(screen.getByText('Root only')).toBeInTheDocument();
    expect(screen.getByText('Has runs')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });

  it('should update search input value', async () => {
    const user = userEvent.setup();

    renderWithUrql(
      <DefinitionFilters
        filters={defaultFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search definitions...') as HTMLInputElement;
    await user.type(searchInput, 'test');

    expect(searchInput.value).toBe('test');
  });

  it('should toggle rootOnly filter when clicked', async () => {
    const user = userEvent.setup();

    renderWithUrql(
      <DefinitionFilters
        filters={defaultFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    await user.click(screen.getByText('Root only'));

    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ rootOnly: true })
    );
  });

  it('should toggle hasRuns filter when clicked', async () => {
    const user = userEvent.setup();

    renderWithUrql(
      <DefinitionFilters
        filters={defaultFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    await user.click(screen.getByText('Has runs'));

    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasRuns: true })
    );
  });

  it('should show active styling for enabled filters', () => {
    renderWithUrql(
      <DefinitionFilters
        filters={{ ...defaultFilters, rootOnly: true, hasRuns: true }}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    const rootOnlyButton = screen.getByText('Root only');
    const hasRunsButton = screen.getByText('Has runs');

    expect(rootOnlyButton.className).toContain('bg-teal-50');
    expect(hasRunsButton.className).toContain('bg-teal-50');
  });

  it('should open tag dropdown when Tags button is clicked', async () => {
    const user = userEvent.setup();

    renderWithUrql(
      <DefinitionFilters
        filters={defaultFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    await user.click(screen.getByText('Tags'));

    await waitFor(() => {
      expect(screen.getByText('ethics')).toBeInTheDocument();
      expect(screen.getByText('safety')).toBeInTheDocument();
    });
  });

  it('should add tag to filter when selected in dropdown', async () => {
    const user = userEvent.setup();

    renderWithUrql(
      <DefinitionFilters
        filters={defaultFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    await user.click(screen.getByText('Tags'));

    await waitFor(() => {
      expect(screen.getByText('ethics')).toBeInTheDocument();
    });

    await user.click(screen.getByText('ethics'));

    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ tagIds: ['tag-1'] })
    );
  });

  it('should show selected tags count badge', () => {
    renderWithUrql(
      <DefinitionFilters
        filters={{ ...defaultFilters, tagIds: ['tag-1', 'tag-2'] }}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    // Count badge appears in both CollapsibleFilters (mobile) and Tags button
    const countBadges = screen.getAllByText('2');
    expect(countBadges.length).toBeGreaterThan(0);
  });

  it('should show Clear filters button when filters are active', () => {
    renderWithUrql(
      <DefinitionFilters
        filters={{ ...defaultFilters, search: 'test' }}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('should not show Clear filters button when no filters are active', () => {
    renderWithUrql(
      <DefinitionFilters
        filters={defaultFilters}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('should clear all filters when Clear filters is clicked', async () => {
    const user = userEvent.setup();

    renderWithUrql(
      <DefinitionFilters
        filters={{
          search: 'test',
          rootOnly: true,
          hasRuns: true,
          tagIds: ['tag-1'],
        }}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    await user.click(screen.getByText('Clear filters'));

    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      search: '',
      rootOnly: false,
      hasRuns: false,
      tagIds: [],
    });
  });

  it('should show clear button in search input when search has value', async () => {
    const user = userEvent.setup();

    renderWithUrql(
      <DefinitionFilters
        filters={{ ...defaultFilters, search: 'test' }}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    // Input should show the search value
    const searchInput = screen.getByPlaceholderText('Search definitions...') as HTMLInputElement;
    expect(searchInput.value).toBe('test');

    // Clear button should be visible
    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    expect(clearButton).toBeInTheDocument();
  });

  it('should display selected tags as removable chips', async () => {
    const user = userEvent.setup();

    renderWithUrql(
      <DefinitionFilters
        filters={{ ...defaultFilters, tagIds: ['tag-1'] }}
        onFiltersChange={mockOnFiltersChange}
      />
    );

    await waitFor(() => {
      // Should show selected tag as chip (outside dropdown)
      const ethicsChips = screen.getAllByText('ethics');
      expect(ethicsChips.length).toBeGreaterThan(0);
    });

    // Click remove on the chip
    const removeButton = screen.getByRole('button', { name: /Remove ethics filter/i });
    await user.click(removeButton);

    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ tagIds: [] })
    );
  });
});
