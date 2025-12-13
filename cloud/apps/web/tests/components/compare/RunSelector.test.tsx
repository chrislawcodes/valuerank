/**
 * RunSelector Component Tests
 *
 * Tests for the run selection component in comparison feature.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunSelector } from '../../../src/components/compare/RunSelector';
import type { ComparisonRun } from '../../../src/api/operations/comparison';

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
    it('renders run list', () => {
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

      // Uses formatRunName which shows "Run: <definition name> on <date>"
      // Definition name appears in both run name and small text, so use getAllByText
      expect(screen.getAllByText(/Definition A/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Definition B/).length).toBeGreaterThan(0);
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

      expect(screen.getByText('No runs with analysis found.')).toBeInTheDocument();
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

      expect(screen.getByText('Loading runs...')).toBeInTheDocument();
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
  });

  describe('selection', () => {
    it('calls onSelectionChange when run is clicked', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const runs = [createMockRun({ id: 'run-1' })];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /Test Definition/i }));

      expect(onSelectionChange).toHaveBeenCalledWith(['run-1']);
    });

    it('removes run when already selected', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const runs = [createMockRun({ id: 'run-1' })];

      render(
        <RunSelector
          runs={runs}
          selectedIds={['run-1']}
          onSelectionChange={onSelectionChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /Test Definition/i }));

      expect(onSelectionChange).toHaveBeenCalledWith([]);
    });

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

      expect(screen.getByText(/Maximum 10 runs/)).toBeInTheDocument();
    });

    it('disables unselected runs at limit', async () => {
      const runs = [
        createMockRun({ id: 'run-new' }),
      ];
      const selectedIds = Array.from({ length: 10 }, (_, i) => `run-${i}`);

      render(
        <RunSelector
          runs={runs}
          selectedIds={selectedIds}
          onSelectionChange={vi.fn()}
        />
      );

      const button = screen.getByRole('button', { name: /Test Definition/i });
      expect(button).toBeDisabled();
    });
  });

  describe('search', () => {
    it('filters runs by search query', async () => {
      const user = userEvent.setup();
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Trolley Problem' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Medical Ethics' } }),
      ];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          onSelectionChange={vi.fn()}
        />
      );

      await user.type(screen.getByPlaceholderText('Search runs...'), 'Trolley');

      // Uses formatRunName - search by partial match
      // Definition name appears in both run name and small text, so use getAllByText
      expect(screen.getAllByText(/Trolley Problem/).length).toBeGreaterThan(0);
      expect(screen.queryAllByText(/Medical Ethics/).length).toBe(0);
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

      await user.type(screen.getByPlaceholderText('Search runs...'), 'nonexistent');

      expect(screen.getByText('No runs match your search.')).toBeInTheDocument();
    });

    it('searches by run ID', async () => {
      const user = userEvent.setup();
      const runs = [
        createMockRun({ id: 'abc123' }),
        createMockRun({ id: 'xyz789' }),
      ];

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          onSelectionChange={vi.fn()}
        />
      );

      await user.type(screen.getByPlaceholderText('Search runs...'), 'abc');

      // Only one run should be visible
      const buttons = screen.getAllByRole('button').filter(
        (btn) => btn.textContent?.includes('Test Definition')
      );
      expect(buttons).toHaveLength(1);
    });

    it('searches by tag name', async () => {
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

      render(
        <RunSelector
          runs={runs}
          selectedIds={[]}
          onSelectionChange={vi.fn()}
        />
      );

      await user.type(screen.getByPlaceholderText('Search runs...'), 'ethics');

      // Only the ethics-tagged run should be visible
      expect(screen.getAllByRole('button').filter(
        (btn) => btn.textContent?.includes('Test Definition')
      )).toHaveLength(1);
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

      await user.click(screen.getByTitle('Refresh runs'));

      expect(onRefresh).toHaveBeenCalled();
    });
  });
});
