/**
 * DefinitionViz Component Tests
 *
 * Tests for the definition visualization orchestrator that routes
 * to appropriate sub-components based on run count.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DefinitionViz } from '../../../../src/components/compare/visualizations/DefinitionViz';
import type { RunWithAnalysis, ComparisonFilters } from '../../../../src/components/compare/types';
import type { ComparisonRun } from '../../../../src/api/operations/comparison';

// Mock Monaco DiffEditor
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: ({ original, modified }: { original: string; modified: string }) => (
    <div data-testid="mock-diff-editor">
      <div data-testid="diff-original">{original}</div>
      <div data-testid="diff-modified">{modified}</div>
    </div>
  ),
}));

function createMockRun(overrides: Partial<ComparisonRun & RunWithAnalysis> = {}): RunWithAnalysis {
  return {
    id: 'run-1',
    name: 'Test Run',
    definitionId: 'def-1',
    status: 'COMPLETED',
    config: { models: ['openai:gpt-4o'] },
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
      tags: [],
    },
    definitionContent: {
      template: 'Test template content',
      preamble: 'Test preamble content',
    },
    ...overrides,
  };
}

const defaultFilters: ComparisonFilters = {
  displayMode: 'overlay',
};

describe('DefinitionViz', () => {
  describe('insufficient runs', () => {
    it('shows message when no runs selected', () => {
      render(
        <DefinitionViz
          runs={[]}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Select at least 2 runs')).toBeInTheDocument();
      expect(screen.getByText('Definition comparison requires 2 or more runs')).toBeInTheDocument();
    });

    it('shows message when only 1 run selected', () => {
      render(
        <DefinitionViz
          runs={[createMockRun()]}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Select at least 2 runs')).toBeInTheDocument();
    });
  });

  describe('two runs - diff view', () => {
    it('renders DefinitionDiff component for exactly 2 runs', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          name: 'Run One',
          definitionContent: { template: 'Template 1', preamble: '' },
        }),
        createMockRun({
          id: 'run-2',
          name: 'Run Two',
          definitionContent: { template: 'Template 2', preamble: '' },
        }),
      ];

      render(
        <DefinitionViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should render the Monaco diff editor
      expect(screen.getByTestId('mock-diff-editor')).toBeInTheDocument();
      expect(screen.getByTestId('diff-original')).toHaveTextContent('Template 1');
      expect(screen.getByTestId('diff-modified')).toHaveTextContent('Template 2');
    });

    it('shows run names in diff view', () => {
      const runs = [
        createMockRun({ id: 'run-1', name: 'Alpha Run' }),
        createMockRun({ id: 'run-2', name: 'Beta Run' }),
      ];

      render(
        <DefinitionViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Alpha Run')).toBeInTheDocument();
      expect(screen.getByText('Beta Run')).toBeInTheDocument();
    });
  });

  describe('three or more runs - groups view', () => {
    it('renders DefinitionGroups component for 3 runs', () => {
      const runs = [
        createMockRun({ id: 'run-1', name: 'Run One' }),
        createMockRun({ id: 'run-2', name: 'Run Two' }),
        createMockRun({ id: 'run-3', name: 'Run Three' }),
      ];

      render(
        <DefinitionViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should show the groups summary
      expect(screen.getByText(/definition.* across 3 runs/i)).toBeInTheDocument();
    });

    it('renders DefinitionGroups component for 5 runs', () => {
      const runs = [
        createMockRun({ id: 'run-1', name: 'Run 1' }),
        createMockRun({ id: 'run-2', name: 'Run 2' }),
        createMockRun({ id: 'run-3', name: 'Run 3' }),
        createMockRun({ id: 'run-4', name: 'Run 4' }),
        createMockRun({ id: 'run-5', name: 'Run 5' }),
      ];

      render(
        <DefinitionViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should show the groups summary for 5 runs
      expect(screen.getByText(/definition.* across 5 runs/i)).toBeInTheDocument();
    });

    it('groups runs by definition ID', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          name: 'Run One',
          definition: { ...createMockRun().definition!, id: 'def-A', name: 'Definition A' },
        }),
        createMockRun({
          id: 'run-2',
          name: 'Run Two',
          definition: { ...createMockRun().definition!, id: 'def-A', name: 'Definition A' },
        }),
        createMockRun({
          id: 'run-3',
          name: 'Run Three',
          definition: { ...createMockRun().definition!, id: 'def-B', name: 'Definition B' },
        }),
      ];

      render(
        <DefinitionViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should show 2 definitions across 3 runs
      expect(screen.getByText(/2 definitions across 3 runs/i)).toBeInTheDocument();
      expect(screen.getByText('Definition A')).toBeInTheDocument();
      expect(screen.getByText('Definition B')).toBeInTheDocument();
    });

    it('shows run count per definition group', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: { ...createMockRun().definition!, id: 'def-A', name: 'Definition A' },
        }),
        createMockRun({
          id: 'run-2',
          definition: { ...createMockRun().definition!, id: 'def-A', name: 'Definition A' },
        }),
        createMockRun({
          id: 'run-3',
          definition: { ...createMockRun().definition!, id: 'def-B', name: 'Definition B' },
        }),
      ];

      render(
        <DefinitionViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Definition A should show 2 runs, Definition B should show 1 run
      expect(screen.getByText('2 runs')).toBeInTheDocument();
      expect(screen.getByText('1 run')).toBeInTheDocument();
    });

    it('shows message about selecting 2 runs for diff when multiple definitions', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          definition: { ...createMockRun().definition!, id: 'def-A', name: 'Definition A' },
        }),
        createMockRun({
          id: 'run-2',
          definition: { ...createMockRun().definition!, id: 'def-B', name: 'Definition B' },
        }),
        createMockRun({
          id: 'run-3',
          definition: { ...createMockRun().definition!, id: 'def-C', name: 'Definition C' },
        }),
      ];

      render(
        <DefinitionViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Select exactly 2 runs to see a detailed diff view')).toBeInTheDocument();
    });

    it('shows single definition message when all runs use same definition', () => {
      const sharedDef = { ...createMockRun().definition!, id: 'shared-def', name: 'Shared Definition' };
      const runs = [
        createMockRun({ id: 'run-1', definition: sharedDef }),
        createMockRun({ id: 'run-2', definition: sharedDef }),
        createMockRun({ id: 'run-3', definition: sharedDef }),
      ];

      render(
        <DefinitionViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('1 definition across 3 runs')).toBeInTheDocument();
      expect(screen.getByText('All selected runs use the same definition')).toBeInTheDocument();
    });
  });
});
