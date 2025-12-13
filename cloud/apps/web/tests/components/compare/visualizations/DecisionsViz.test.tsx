/**
 * DecisionsViz Component Tests
 *
 * Tests for the decision distribution comparison visualization.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecisionsViz } from '../../../../src/components/compare/visualizations/DecisionsViz';
import type { RunWithAnalysis, ComparisonFilters } from '../../../../src/components/compare/types';
import type { ComparisonRun } from '../../../../src/api/operations/comparison';

function createMockRun(overrides: Partial<ComparisonRun & { aggregateStats?: RunWithAnalysis['aggregateStats'] }> = {}): RunWithAnalysis {
  return {
    id: 'run-1',
    name: null, // Uses algorithmic name
    definitionId: 'def-1',
    status: 'COMPLETED',
    config: { models: ['openai:gpt-4o', 'anthropic:claude-3'] },
    progress: { total: 100, completed: 100, failed: 0 },
    startedAt: '2024-01-15T10:00:00Z',
    completedAt: '2024-01-15T10:30:00Z',
    createdAt: '2024-01-15T10:00:00Z',
    transcriptCount: 100,
    analysisStatus: 'CURRENT',
    analysis: {
      id: 'analysis-1',
      runId: 'run-1',
      analysisType: 'comprehensive',
      status: 'CURRENT',
      codeVersion: '1.0',
      inputHash: 'hash',
      createdAt: '2024-01-15T10:30:00Z',
      perModel: {
        'openai:gpt-4o': {
          sampleSize: 50,
          values: {},
          overall: { mean: 3.0, stdDev: 1.0, min: 1, max: 5 },
        },
      },
      modelAgreement: {
        pairwise: {},
        outlierModels: [],
        overallAgreement: 0.85,
      },
      dimensionAnalysis: null,
      visualizationData: {
        decisionDistribution: {
          'openai:gpt-4o': { '1': 10, '2': 15, '3': 20, '4': 12, '5': 8 },
          'anthropic:claude-3': { '1': 8, '2': 18, '3': 22, '4': 10, '5': 7 },
        },
        modelScenarioMatrix: {},
      },
      mostContestedScenarios: [],
      methodsUsed: {
        winRateCI: 'wilson',
        modelComparison: 'spearman',
        pValueCorrection: 'bonferroni',
        effectSize: 'cohens_d',
        dimensionTest: 'kruskal_wallis',
        alpha: 0.05,
        codeVersion: '1.0',
      },
      warnings: [],
      summary: '',
    },
    definition: {
      id: 'def-1',
      name: 'Test Definition',
      preamble: 'Test preamble',
      template: 'Test template',
      parentId: null,
      tags: [],
    },
    aggregateStats: {
      overallMean: 3.25,
      overallStdDev: 0.85,
      sampleCount: 100,
    },
    ...overrides,
  };
}

const defaultFilters: ComparisonFilters = {
  displayMode: 'overlay',
};

describe('DecisionsViz', () => {
  describe('rendering', () => {
    it('renders the component with data', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Run B' } }),
      ];

      render(
        <DecisionsViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Decision Distribution Comparison')).toBeInTheDocument();
    });

    it('shows empty state when no visualization data', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          analysis: {
            ...createMockRun().analysis!,
            visualizationData: null,
          },
        }),
      ];

      render(
        <DecisionsViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('No decision data available')).toBeInTheDocument();
    });

    it('shows empty state when analysis is null', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          analysis: null,
        }),
      ];

      render(
        <DecisionsViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('No decision data available')).toBeInTheDocument();
    });
  });

  describe('filters', () => {
    it('renders model filter dropdown', () => {
      const runs = [createMockRun()];

      render(
        <DecisionsViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText('Model:')).toBeInTheDocument();
    });

    it('renders display mode toggle', () => {
      const runs = [createMockRun()];

      render(
        <DecisionsViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Overlay')).toBeInTheDocument();
      expect(screen.getByText('Side-by-side')).toBeInTheDocument();
    });

    it('calls onFilterChange when display mode toggled', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      const runs = [createMockRun()];

      render(
        <DecisionsViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={onFilterChange}
        />
      );

      await user.click(screen.getByText('Side-by-side'));

      expect(onFilterChange).toHaveBeenCalledWith({ displayMode: 'side-by-side' });
    });
  });

  describe('overlay mode', () => {
    it('renders grouped bar chart in overlay mode', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Run B' } }),
      ];

      render(
        <DecisionsViz
          runs={runs}
          filters={{ displayMode: 'overlay' }}
          onFilterChange={vi.fn()}
        />
      );

      // Recharts should render (we can check for the container)
      expect(screen.getByText('Decision Distribution Comparison')).toBeInTheDocument();
    });
  });

  describe('side-by-side mode', () => {
    it('renders small multiples in side-by-side mode', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Run B' } }),
      ];

      render(
        <DecisionsViz
          runs={runs}
          filters={{ displayMode: 'side-by-side' }}
          onFilterChange={vi.fn()}
        />
      );

      // Should show run names in small multiples (may appear in multiple places)
      // Run names are now formatted as "Run: <def name> on <date>"
      expect(screen.getAllByText(/Run A/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Run B/).length).toBeGreaterThanOrEqual(1);
    });

    it('shows sample size and mean in side-by-side cards', () => {
      const runs = [createMockRun()];

      render(
        <DecisionsViz
          runs={runs}
          filters={{ displayMode: 'side-by-side' }}
          onFilterChange={vi.fn()}
        />
      );

      // Look for the stats pattern (n=XX, mean=X.XX)
      const statsText = screen.getByText(/n=\d+, mean=\d+\.\d+/);
      expect(statsText).toBeInTheDocument();
    });
  });

  describe('KS statistics', () => {
    it('shows KS statistics section with 2+ runs', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Run B' } }),
      ];

      render(
        <DecisionsViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Distribution Similarity (KS Statistic)')).toBeInTheDocument();
    });

    it('shows comparison labels between runs', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Run B' } }),
      ];

      render(
        <DecisionsViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // The KS section should show run names vs each other
      // Run names are now formatted as "Run: <def name> on <date>"
      expect(screen.getAllByText(/Run A/).length).toBeGreaterThan(0);
      expect(screen.getByText('vs')).toBeInTheDocument();
    });
  });

  describe('summary stats', () => {
    it('displays mean value for each run', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Run B' } }),
      ];

      render(
        <DecisionsViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should show "mean" labels
      expect(screen.getAllByText('mean').length).toBeGreaterThanOrEqual(1);
    });

    it('displays sample count for each run', () => {
      const runs = [createMockRun()];

      render(
        <DecisionsViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should show n=XXX pattern
      expect(screen.getByText(/n=\d+/)).toBeInTheDocument();
    });
  });

  describe('model filtering', () => {
    it('shows message when filtered model has no data', () => {
      const runs = [createMockRun()];

      render(
        <DecisionsViz
          runs={runs}
          filters={{ ...defaultFilters, model: 'nonexistent:model' }}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText(/No data for model/)).toBeInTheDocument();
    });
  });
});
