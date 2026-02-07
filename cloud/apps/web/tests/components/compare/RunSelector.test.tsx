/**
 * RunSelector Component Tests
 *
 * Tests for the run selection component in comparison feature.
 * Note: RunSelector uses virtualization, so JSDOM may not render all items.
 * Tests focus on functionality that doesn't depend on item rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunSelector } from '../../../src/components/compare/RunSelector';
import type { ComparisonRun } from '../../../src/api/operations/comparison';

// Mock useTags hook to avoid urql Provider requirement
vi.mock('../../../src/hooks/useTags', () => ({
  useTags: vi.fn(() => ({
    tags: [
      { id: 'tag-1', name: 'safety' },
      { id: 'tag-2', name: 'ethics' },
      { id: 't1', name: 'ethics' },
      { id: 't2', name: 'safety' },
    ],
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

function createMockRun(overrides: Partial<ComparisonRun> = {}): ComparisonRun {
  return {
    id: 'run-1',
    name: null, // Uses algorithmic name by default
    definitionId: 'def-1',
    status: 'COMPLETED',
    config: { models: ['gpt-4o', 'claude-3'] },
    progress: { total: 100, completed: 100, failed: 0 },
    startedAt: '2024-01-15T10:00:00Z',
    completedAt: '2024-01-15T10:30:00Z',
    createdAt: '2024-01-15T10:00:00Z',
    transcriptCount: 100,
    analysisStatus: 'CURRENT',
    analysis: null,
    definition: {
      id: 'def-1',
      name: 'Test Definition',
      preamble: 'Test preamble',
      template: 'Test template',
      parentId: null,
      tags: [{ id: 'tag-1', name: 'test-tag' }],
    },
    ...overrides,
  };
}

describe('RunSelector', () => {
  describe('rendering', () => {
    it('renders run count', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Definition A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Definition B' } }),
      ];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          onSelectionChange={vi.fn()}
        />
      );

      // Virtualized list shows count
      expect(screen.getByText('2 trials')).toBeInTheDocument();
    });

    it('shows selection count', () => {
      const runs = [createMockRun()];

      render(
        <RunSelector
          runs={runs}
          selectedIds={['run-1']}
          onSelectionChange={vi.fn()}
        />
      );

      expect(screen.getByText('1/10 selected')).toBeInTheDocument();
    });

    it('shows empty state when no runs', () => {
      render(
        <RunSelector
          runs={[]}
          selectedIds={[]}
          onSelectionChange={vi.fn()}
        />
      );

      expect(screen.getByText('No trials with analysis found.')).toBeInTheDocument();
    });

    it('shows loading state', () => {
      render(
        <RunSelector
          runs={[]}
          selectedIds={[]}
          loading={true}
          onSelectionChange={vi.fn()}
        />
      );

      expect(screen.getByText('Loading trials...')).toBeInTheDocument();
    });

    it('shows error message', () => {
      render(
        <RunSelector
          runs={[]}
          selectedIds={[]}
          error="Failed to load runs"
          onSelectionChange={vi.fn()}
        />
      );

      expect(screen.getByText('Failed to load runs')).toBeInTheDocument();
    });

    it('shows total count when provided', () => {
      const runs = [createMockRun()];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          totalCount={50}
          onSelectionChange={vi.fn()}
        />
      );

      expect(screen.getByText(/1 of 50 trials/)).toBeInTheDocument();
    });

    it('shows loading more indicator', () => {
      const runs = [createMockRun()];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          loadingMore={true}
          hasNextPage={true}
          onSelectionChange={vi.fn()}
        />
      );

      expect(screen.getByText('Loading more trials...')).toBeInTheDocument();
    });

    it('shows all runs loaded indicator', () => {
      const runs = [createMockRun()];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          hasNextPage={false}
          onSelectionChange={vi.fn()}
        />
      );

      expect(screen.getByText('All trials loaded')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('shows limit warning at 10 runs', () => {
      const runs = Array.from({ length: 5 }, (_, i) =>
        createMockRun({ id: `run-${i}` })
      );
      const selectedIds = Array.from({ length: 10 }, (_, i) => `run-${i}`);

      render(
        <RunSelector
          runs={runs}
          selectedIds={selectedIds}
          onSelectionChange={vi.fn()}
        />
      );

      expect(screen.getByText(/Maximum 10 trials/)).toBeInTheDocument();
    });
  });

  describe('search', () => {
    // Helper to find the run count span with flexible text matching
    function getRunCountText(container: HTMLElement): string {
      const spans = container.querySelectorAll('span.text-xs.text-gray-500');
      for (const span of spans) {
        if (span.textContent?.includes('trials')) {
          // Normalize whitespace
          return span.textContent.replace(/\s+/g, ' ').trim();
        }
      }
      return '';
    }

    it('filters runs by search query and updates count', async () => {
      const user = userEvent.setup();
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Trolley Problem' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Medical Ethics' } }),
      ];

      const { container } = render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          onSelectionChange={vi.fn()}
        />
      );

      // Initially shows 2 runs
      expect(screen.getByText('2 trials')).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText('Search trials...'), 'Trolley');

      // After filtering, shows 1 of 2 trials (filtered count)
      await waitFor(() => {
        const countText = getRunCountText(container);
        expect(countText).toMatch(/1 of 2 trials/);
      });
    });

    it('shows empty search results state', async () => {
      const user = userEvent.setup();
      const runs = [createMockRun()];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          onSelectionChange={vi.fn()}
        />
      );

      await user.type(screen.getByPlaceholderText('Search trials...'), 'nonexistent');

      // Note: When filtering is active (search or tags), the empty state shows "No trials match your filters."
      expect(screen.getByText('No trials match your filters.')).toBeInTheDocument();
    });

    it('searches by run ID and updates count', async () => {
      const user = userEvent.setup();
      const runs = [
        createMockRun({ id: 'abc123' }),
        createMockRun({ id: 'xyz789' }),
      ];

      const { container } = render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          onSelectionChange={vi.fn()}
        />
      );

      // Initially shows 2 runs
      expect(screen.getByText('2 trials')).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText('Search trials...'), 'abc');

      // After filtering, shows 1 of 2 trials
      await waitFor(() => {
        const countText = getRunCountText(container);
        expect(countText).toMatch(/1 of 2 trials/);
      });
    });

    it('searches by tag name and updates count', async () => {
      const user = userEvent.setup();
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: { ...createMockRun().definition, tags: [{ id: 't1', name: 'ethics' }] },
        }),
        createMockRun({
          id: 'run-2',
          definition: { ...createMockRun().definition, tags: [{ id: 't2', name: 'safety' }] },
        }),
      ];

      const { container } = render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          onSelectionChange={vi.fn()}
        />
      );

      // Initially shows 2 runs
      expect(screen.getByText('2 trials')).toBeInTheDocument();

      await user.type(screen.getByPlaceholderText('Search trials...'), 'ethics');

      // After filtering, shows 1 of 2 trials
      await waitFor(() => {
        const countText = getRunCountText(container);
        expect(countText).toMatch(/1 of 2 trials/);
      });
    });
  });

  describe('quick actions', () => {
    it('select all adds all visible runs', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const runs = [
        createMockRun({ id: 'run-1' }),
        createMockRun({ id: 'run-2' }),
      ];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      await user.click(screen.getByText('Select all'));

      expect(onSelectionChange).toHaveBeenCalledWith(['run-1', 'run-2']);
    });

    it('clear selection removes all', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const runs = [createMockRun({ id: 'run-1' })];

      render(
        <RunSelector
          runs={runs}
          selectedIds={['run-1', 'run-2']}
          onSelectionChange={onSelectionChange}
        />
      );

      await user.click(screen.getByText('Clear selection'));

      expect(onSelectionChange).toHaveBeenCalledWith([]);
    });
  });

  describe('refresh', () => {
    it('calls onRefresh when refresh button clicked', async () => {
      const user = userEvent.setup();
      const onRefresh = vi.fn();

      render(
        <RunSelector
          runs={[createMockRun()]}
          selectedIds={[]}
          onSelectionChange={vi.fn()}
          onRefresh={onRefresh}
        />
      );

      await user.click(screen.getByTitle('Refresh trials'));

      expect(onRefresh).toHaveBeenCalled();
    });
  });

  describe('tag filtering', () => {
    // Note: Tests pass selectedTagIds without onTagIdsChange to avoid TagFilterDropdown
    // rendering which requires urql Provider. Filtering logic is still fully tested.

    // Helper to find the run count span with flexible text matching
    function getRunCountText(container: HTMLElement): string {
      const spans = container.querySelectorAll('span.text-xs.text-gray-500');
      for (const span of spans) {
        if (span.textContent?.includes('trials')) {
          // Normalize whitespace
          return span.textContent.replace(/\s+/g, ' ').trim();
        }
      }
      return '';
    }

    it('filters runs by single tag and updates count', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: { ...createMockRun().definition, tags: [{ id: 'tag-1', name: 'safety' }] },
        }),
        createMockRun({
          id: 'run-2',
          definition: { ...createMockRun().definition, tags: [{ id: 'tag-2', name: 'ethics' }] },
        }),
        createMockRun({
          id: 'run-3',
          definition: { ...createMockRun().definition, tags: [{ id: 'tag-1', name: 'safety' }] },
        }),
      ];

      const { container } = render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={['tag-1']}
          onSelectionChange={vi.fn()}
        />
      );

      // Should show 2 of 3 trials (filtered count)
      const countText = getRunCountText(container);
      expect(countText).toMatch(/2 of 3 trials/);
    });

    it('filters runs by multiple tags with AND logic', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: {
            ...createMockRun().definition,
            tags: [
              { id: 'tag-1', name: 'safety' },
              { id: 'tag-2', name: 'production' },
            ],
          },
        }),
        createMockRun({
          id: 'run-2',
          definition: { ...createMockRun().definition, tags: [{ id: 'tag-1', name: 'safety' }] },
        }),
        createMockRun({
          id: 'run-3',
          definition: { ...createMockRun().definition, tags: [{ id: 'tag-2', name: 'production' }] },
        }),
      ];

      const { container } = render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={['tag-1', 'tag-2']}
          onSelectionChange={vi.fn()}
        />
      );

      // Only run-1 has BOTH tags, so should show 1 of 3 trials
      const countText = getRunCountText(container);
      expect(countText).toMatch(/1 of 3 trials/);
    });

    it('shows all runs when no tags selected', () => {
      const runs = [
        createMockRun({ id: 'run-1' }),
        createMockRun({ id: 'run-2' }),
      ];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={[]}
          onSelectionChange={vi.fn()}
        />
      );

      expect(screen.getByText('2 trials')).toBeInTheDocument();
    });

    it('shows empty state when no runs match tag filter', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: { ...createMockRun().definition, tags: [{ id: 'tag-1', name: 'safety' }] },
        }),
      ];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={['tag-2']}
          onSelectionChange={vi.fn()}
        />
      );

      expect(screen.getByText('No trials match your filters.')).toBeInTheDocument();
    });

    it('combines tag filter with text search', async () => {
      const user = userEvent.setup();
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: {
            ...createMockRun().definition,
            name: 'Trolley Problem',
            tags: [{ id: 'tag-1', name: 'safety' }],
          },
        }),
        createMockRun({
          id: 'run-2',
          definition: {
            ...createMockRun().definition,
            name: 'Medical Ethics',
            tags: [{ id: 'tag-1', name: 'safety' }],
          },
        }),
        createMockRun({
          id: 'run-3',
          definition: {
            ...createMockRun().definition,
            name: 'Trolley Variant',
            tags: [{ id: 'tag-2', name: 'ethics' }],
          },
        }),
      ];

      const { container } = render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={['tag-1']}
          onSelectionChange={vi.fn()}
        />
      );

      // Initially 2 runs match tag-1
      let countText = getRunCountText(container);
      expect(countText).toMatch(/2 of 3 trials/);

      // Search for "Trolley" - should filter to just run-1 (has tag-1 AND matches search)
      await user.type(screen.getByPlaceholderText('Search trials...'), 'Trolley');

      await waitFor(() => {
        countText = getRunCountText(container);
        expect(countText).toMatch(/1 of 3 trials/);
      });
    });
  });

  describe('combined text and tag filtering', () => {
    // Helper to find the run count span with flexible text matching
    function getRunCountText(container: HTMLElement): string {
      const spans = container.querySelectorAll('span.text-xs.text-gray-500');
      for (const span of spans) {
        if (span.textContent?.includes('trials')) {
          // Normalize whitespace
          return span.textContent.replace(/\s+/g, ' ').trim();
        }
      }
      return '';
    }

    it('clear text search preserves tag filter', async () => {
      const user = userEvent.setup();
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: {
            ...createMockRun().definition,
            name: 'Trolley Problem',
            tags: [{ id: 'tag-1', name: 'safety' }],
          },
        }),
        createMockRun({
          id: 'run-2',
          definition: {
            ...createMockRun().definition,
            name: 'Medical Ethics',
            tags: [{ id: 'tag-1', name: 'safety' }],
          },
        }),
        createMockRun({
          id: 'run-3',
          definition: {
            ...createMockRun().definition,
            name: 'Another Run',
            tags: [{ id: 'tag-2', name: 'ethics' }],
          },
        }),
      ];

      const { container } = render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={['tag-1']}
          onSelectionChange={vi.fn()}
        />
      );

      // Initially 2 runs match tag-1
      let countText = getRunCountText(container);
      expect(countText).toMatch(/2 of 3 trials/);

      // Type search text
      const searchInput = screen.getByPlaceholderText('Search trials...');
      await user.type(searchInput, 'Trolley');

      await waitFor(() => {
        countText = getRunCountText(container);
        expect(countText).toMatch(/1 of 3 trials/);
      });

      // Clear search text
      await user.clear(searchInput);

      // Should return to showing 2 runs (tag filter still active)
      await waitFor(() => {
        countText = getRunCountText(container);
        expect(countText).toMatch(/2 of 3 trials/);
      });
    });

    it('clear tag filter preserves text search', async () => {
      const user = userEvent.setup();
      const onTagIdsChange = vi.fn();
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: {
            ...createMockRun().definition,
            name: 'Trolley Problem',
            tags: [{ id: 'tag-1', name: 'safety' }],
          },
        }),
        createMockRun({
          id: 'run-2',
          definition: {
            ...createMockRun().definition,
            name: 'Medical Ethics',
            tags: [{ id: 'tag-1', name: 'safety' }],
          },
        }),
        createMockRun({
          id: 'run-3',
          definition: {
            ...createMockRun().definition,
            name: 'Trolley Variant',
            tags: [{ id: 'tag-2', name: 'ethics' }],
          },
        }),
      ];

      const { container, rerender } = render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={['tag-1']}
          onTagIdsChange={onTagIdsChange}
          onSelectionChange={vi.fn()}
        />
      );

      // Initially 2 runs match tag-1
      let countText = getRunCountText(container);
      expect(countText).toMatch(/2 of 3 trials/);

      // Type search text
      const searchInput = screen.getByPlaceholderText('Search trials...');
      await user.type(searchInput, 'Trolley');

      await waitFor(() => {
        countText = getRunCountText(container);
        expect(countText).toMatch(/1 of 3 trials/);
      });

      // Simulate clearing tags (rerender with empty tags)
      rerender(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={[]}
          onTagIdsChange={onTagIdsChange}
          onSelectionChange={vi.fn()}
        />
      );

      // Should now show 2 runs (both Trolley runs, no tag filter)
      await waitFor(() => {
        countText = getRunCountText(container);
        expect(countText).toMatch(/2 of 3 trials/);
      });

      // Verify search text is still present
      expect(searchInput).toHaveValue('Trolley');
    });

    it('both filters apply as AND logic', async () => {
      const user = userEvent.setup();
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: {
            ...createMockRun().definition,
            name: 'Trolley Problem',
            tags: [{ id: 'tag-1', name: 'safety' }],
          },
        }),
        createMockRun({
          id: 'run-2',
          definition: {
            ...createMockRun().definition,
            name: 'Trolley Variant',
            tags: [{ id: 'tag-2', name: 'ethics' }],
          },
        }),
        createMockRun({
          id: 'run-3',
          definition: {
            ...createMockRun().definition,
            name: 'Medical Problem',
            tags: [{ id: 'tag-1', name: 'safety' }],
          },
        }),
      ];

      const { container } = render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={['tag-1']}
          onSelectionChange={vi.fn()}
        />
      );

      // Search for "Trolley" with tag-1 filter
      await user.type(screen.getByPlaceholderText('Search trials...'), 'Trolley');

      // Only run-1 matches both conditions (has tag-1 AND name contains Trolley)
      await waitFor(() => {
        const countText = getRunCountText(container);
        expect(countText).toMatch(/1 of 3 trials/);
      });
    });
  });

  describe('tag chips', () => {
    it('displays selected tag chips when tags are selected', () => {
      const runs = [createMockRun()];
      const onTagIdsChange = vi.fn();

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={['tag-1', 'tag-2']}
          onTagIdsChange={onTagIdsChange}
          onSelectionChange={vi.fn()}
        />
      );

      // Tag chips should be displayed with tag names
      expect(screen.getByText('safety')).toBeInTheDocument();
      expect(screen.getByText('ethics')).toBeInTheDocument();
    });

    it('removes individual tag when chip X button is clicked', async () => {
      const user = userEvent.setup();
      const onTagIdsChange = vi.fn();
      const runs = [createMockRun()];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={['tag-1', 'tag-2']}
          onTagIdsChange={onTagIdsChange}
          onSelectionChange={vi.fn()}
        />
      );

      // Click the X button on the 'safety' tag chip
      const removeButton = screen.getByRole('button', { name: /remove safety filter/i });
      await user.click(removeButton);

      // Should call onTagIdsChange with tag-2 only (tag-1 removed)
      expect(onTagIdsChange).toHaveBeenCalledWith(['tag-2']);
    });

    it('does not display tag chips when onTagIdsChange is not provided', () => {
      const runs = [createMockRun()];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          selectedTagIds={['tag-1']}
          onSelectionChange={vi.fn()}
        />
      );

      // Tag chips should not be displayed since onTagIdsChange is not provided
      expect(screen.queryByText('safety')).not.toBeInTheDocument();
    });
  });
});
