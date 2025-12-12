/**
 * ValuesViz Component Tests
 *
 * Tests for the value win rate comparison visualization.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ValuesViz } from '../../../../src/components/compare/visualizations/ValuesViz';
import type { RunWithAnalysis, ComparisonFilters } from '../../../../src/components/compare/types';
import type { ComparisonRun } from '../../../../src/api/operations/comparison';

function createMockRun(overrides: Partial<ComparisonRun & { aggregateStats?: RunWithAnalysis['aggregateStats'] }> = {}): RunWithAnalysis {
  return {
    id: 'run-1',
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
      computedAt: null,
      durationMs: null,
      perModel: {
        'openai:gpt-4o': {
          sampleSize: 50,
          values: {
            Freedom: {
              winRate: 0.75,
              confidenceInterval: { lower: 0.65, upper: 0.85, level: 0.95, method: 'wilson' },
              count: { prioritized: 30, deprioritized: 10, neutral: 10 },
            },
            Compassion: {
              winRate: 0.60,
              confidenceInterval: { lower: 0.50, upper: 0.70, level: 0.95, method: 'wilson' },
              count: { prioritized: 24, deprioritized: 16, neutral: 10 },
            },
            Tradition: {
              winRate: 0.45,
              confidenceInterval: { lower: 0.35, upper: 0.55, level: 0.95, method: 'wilson' },
              count: { prioritized: 18, deprioritized: 22, neutral: 10 },
            },
          },
          overall: { mean: 3.0, stdDev: 1.0, min: 1, max: 5 },
        },
        'anthropic:claude-3': {
          sampleSize: 50,
          values: {
            Freedom: {
              winRate: 0.70,
              confidenceInterval: { lower: 0.60, upper: 0.80, level: 0.95, method: 'wilson' },
              count: { prioritized: 28, deprioritized: 12, neutral: 10 },
            },
            Compassion: {
              winRate: 0.55,
              confidenceInterval: { lower: 0.45, upper: 0.65, level: 0.95, method: 'wilson' },
              count: { prioritized: 22, deprioritized: 18, neutral: 10 },
            },
            Tradition: {
              winRate: 0.50,
              confidenceInterval: { lower: 0.40, upper: 0.60, level: 0.95, method: 'wilson' },
              count: { prioritized: 20, deprioritized: 20, neutral: 10 },
            },
          },
          overall: { mean: 3.2, stdDev: 1.1, min: 1, max: 5 },
        },
      },
      modelAgreement: {
        pairwise: {},
        outlierModels: [],
        overallAgreement: 0.85,
      },
      dimensionAnalysis: null,
      visualizationData: null,
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

function createMockRunWithDifferentValues(id: string, name: string): RunWithAnalysis {
  return createMockRun({
    id,
    definition: { ...createMockRun().definition, name },
    analysis: {
      ...createMockRun().analysis!,
      runId: id,
      perModel: {
        'openai:gpt-4o': {
          sampleSize: 50,
          values: {
            Freedom: {
              winRate: 0.55, // Much lower than Run A (0.75) - significant change
              confidenceInterval: { lower: 0.45, upper: 0.65, level: 0.95, method: 'wilson' },
              count: { prioritized: 22, deprioritized: 18, neutral: 10 },
            },
            Compassion: {
              winRate: 0.80, // Higher than Run A (0.60) - significant change
              confidenceInterval: { lower: 0.70, upper: 0.90, level: 0.95, method: 'wilson' },
              count: { prioritized: 32, deprioritized: 8, neutral: 10 },
            },
            Tradition: {
              winRate: 0.48, // Similar to Run A (0.45)
              confidenceInterval: { lower: 0.38, upper: 0.58, level: 0.95, method: 'wilson' },
              count: { prioritized: 19, deprioritized: 21, neutral: 10 },
            },
          },
          overall: { mean: 3.1, stdDev: 1.0, min: 1, max: 5 },
        },
      },
    },
  });
}

const defaultFilters: ComparisonFilters = {
  displayMode: 'overlay',
};

describe('ValuesViz', () => {
  describe('rendering', () => {
    it('renders the component with data', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Run B' } }),
      ];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Value Win Rate Comparison')).toBeInTheDocument();
    });

    it('shows empty state when no analysis data', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          analysis: null,
        }),
      ];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('No value data available')).toBeInTheDocument();
    });

    it('shows empty state when perModel has no values', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          analysis: {
            ...createMockRun().analysis!,
            perModel: {
              'openai:gpt-4o': {
                sampleSize: 50,
                values: {},
                overall: { mean: 3.0, stdDev: 1.0, min: 1, max: 5 },
              },
            },
          },
        }),
      ];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('No value data available')).toBeInTheDocument();
    });
  });

  describe('filters', () => {
    it('renders model filter dropdown', () => {
      const runs = [createMockRun()];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText('Model:')).toBeInTheDocument();
    });

    it('renders confidence intervals checkbox', () => {
      const runs = [createMockRun()];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Show confidence intervals')).toBeInTheDocument();
    });

    it('toggles confidence intervals checkbox', async () => {
      const user = userEvent.setup();
      const runs = [createMockRun()];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();

      await user.click(checkbox);
      expect(checkbox).toBeChecked();
    });
  });

  describe('significant changes', () => {
    it('shows significant changes section with 2+ runs', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRunWithDifferentValues('run-2', 'Run B'),
      ];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should show significant changes header
      expect(screen.getByText(/Significant Changes/)).toBeInTheDocument();
    });

    it('shows "no significant differences" when values are similar', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Run B' } }),
      ];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText(/No significant differences/)).toBeInTheDocument();
    });

    it('displays values with significant changes', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRunWithDifferentValues('run-2', 'Run B'),
      ];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Freedom and Compassion should show as significant changes (>10% difference)
      expect(screen.getByText('Freedom')).toBeInTheDocument();
      expect(screen.getByText('Compassion')).toBeInTheDocument();
    });
  });

  describe('summary stats', () => {
    it('displays average win rate for each run', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Run B' } }),
      ];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should show "avg win rate" labels
      expect(screen.getAllByText('avg win rate').length).toBeGreaterThanOrEqual(1);
    });

    it('displays value count for each run', () => {
      const runs = [createMockRun()];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should show "X values tracked"
      expect(screen.getByText(/values tracked/)).toBeInTheDocument();
    });
  });

  describe('model filtering', () => {
    it('shows message when filtered model has no data', () => {
      const runs = [createMockRun()];

      render(
        <ValuesViz
          runs={runs}
          filters={{ ...defaultFilters, model: 'nonexistent:model' }}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText(/No data for model/)).toBeInTheDocument();
    });

    it('filters data to specific model', () => {
      const runs = [createMockRun()];

      // Render with specific model filter
      const { rerender } = render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should show data (chart renders)
      expect(screen.getByText('Value Win Rate Comparison')).toBeInTheDocument();

      // Now filter to a specific model
      rerender(
        <ValuesViz
          runs={runs}
          filters={{ ...defaultFilters, model: 'openai:gpt-4o' }}
          onFilterChange={vi.fn()}
        />
      );

      // Should still show data for that model
      expect(screen.getByText('Value Win Rate Comparison')).toBeInTheDocument();
    });
  });

  describe('chart rendering', () => {
    it('renders grouped bar chart', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Run B' } }),
      ];

      render(
        <ValuesViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Chart title should be present
      expect(screen.getByText('Value Win Rate Comparison')).toBeInTheDocument();
    });
  });
});
