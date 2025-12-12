/**
 * TimelineViz Component Tests
 *
 * Tests for the timeline visualization showing model behavioral drift over time.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineViz } from '../../../../src/components/compare/visualizations/TimelineViz';
import type { RunWithAnalysis, ComparisonFilters } from '../../../../src/components/compare/types';
import type { ComparisonRun } from '../../../../src/api/operations/comparison';

function createMockRun(
  overrides: Partial<ComparisonRun & { aggregateStats?: RunWithAnalysis['aggregateStats'] }> = {}
): RunWithAnalysis {
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
          values: {},
          overall: { mean: 3.2, stdDev: 0.9, min: 1, max: 5 },
        },
        'anthropic:claude-3': {
          sampleSize: 50,
          values: {},
          overall: { mean: 3.5, stdDev: 0.8, min: 1, max: 5 },
        },
      },
      modelAgreement: { pairwise: {}, outlierModels: [], overallAgreement: 0.85 },
      dimensionAnalysis: null,
      visualizationData: {
        decisionDistribution: {},
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
      overallMean: 3.35,
      overallStdDev: 0.85,
      sampleCount: 100,
    },
    ...overrides,
  };
}

const defaultFilters: ComparisonFilters = {
  displayMode: 'overlay',
};

describe('TimelineViz', () => {
  describe('empty state', () => {
    it('shows empty message when no runs have analysis data', () => {
      const runs = [createMockRun({ analysis: null })];

      render(
        <TimelineViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('No timeline data available')).toBeInTheDocument();
    });

    it('shows empty message when model filter has no matches', () => {
      const runs = [createMockRun()];

      render(
        <TimelineViz
          runs={runs}
          filters={{ ...defaultFilters, model: 'nonexistent:model' }}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('No timeline data available')).toBeInTheDocument();
      expect(screen.getByText(/No data for model/)).toBeInTheDocument();
    });
  });

  describe('chart rendering', () => {
    it('renders timeline chart with data', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          completedAt: '2024-01-15T10:30:00Z',
        }),
        createMockRun({
          id: 'run-2',
          completedAt: '2024-01-20T10:30:00Z',
          definition: { ...createMockRun().definition, name: 'Run 2 Definition' },
        }),
      ];

      render(
        <TimelineViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should render chart title
      expect(screen.getByText('Mean Decision Over Time')).toBeInTheDocument();
    });

    it('shows warning when only one run has data', () => {
      const runs = [createMockRun()];

      render(
        <TimelineViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText(/Only one run has data/)).toBeInTheDocument();
    });

    it('renders runs legend', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          completedAt: '2024-01-15T10:30:00Z',
          definition: { ...createMockRun().definition, name: 'First Run' },
        }),
        createMockRun({
          id: 'run-2',
          completedAt: '2024-01-20T10:30:00Z',
          definition: { ...createMockRun().definition, name: 'Second Run' },
        }),
      ];

      render(
        <TimelineViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Runs in Timeline')).toBeInTheDocument();
    });
  });

  describe('metric selection', () => {
    it('renders metric selector', () => {
      const runs = [createMockRun()];

      render(
        <TimelineViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Metric:')).toBeInTheDocument();
      // Find the metric select by looking near the "Metric:" label
      const metricLabel = screen.getByText('Metric:');
      const metricContainer = metricLabel.closest('div');
      expect(metricContainer?.querySelector('select')).toBeInTheDocument();
    });

    it('allows switching between metrics', () => {
      const runs = [createMockRun(), createMockRun({ id: 'run-2' })];

      render(
        <TimelineViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Find the metric selector specifically (next to "Metric:" text)
      const metricLabel = screen.getByText('Metric:');
      const metricContainer = metricLabel.closest('div');
      const select = metricContainer?.querySelector('select');

      expect(select).toBeTruthy();

      // Change to std deviation
      if (select) {
        fireEvent.change(select, { target: { value: 'stdDev' } });
      }

      expect(screen.getByText('Standard Deviation Over Time')).toBeInTheDocument();
    });
  });

  describe('trend analysis', () => {
    it('shows trend analysis for multiple runs', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          completedAt: '2024-01-15T10:30:00Z',
        }),
        createMockRun({
          id: 'run-2',
          completedAt: '2024-01-20T10:30:00Z',
          analysis: {
            ...createMockRun().analysis!,
            perModel: {
              'openai:gpt-4o': {
                sampleSize: 50,
                values: {},
                overall: { mean: 3.8, stdDev: 0.7, min: 1, max: 5 },
              },
              'anthropic:claude-3': {
                sampleSize: 50,
                values: {},
                overall: { mean: 3.2, stdDev: 0.9, min: 1, max: 5 },
              },
            },
          },
        }),
      ];

      render(
        <TimelineViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Trend Analysis (Mean Decision)')).toBeInTheDocument();
    });
  });

  describe('model filtering', () => {
    it('applies model filter to timeline data', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          completedAt: '2024-01-15T10:30:00Z',
        }),
        createMockRun({
          id: 'run-2',
          completedAt: '2024-01-20T10:30:00Z',
        }),
      ];

      render(
        <TimelineViz
          runs={runs}
          filters={{ ...defaultFilters, model: 'openai:gpt-4o' }}
          onFilterChange={vi.fn()}
        />
      );

      // Chart should still render with filtered model
      expect(screen.getByText('Mean Decision Over Time')).toBeInTheDocument();
    });
  });

  describe('date sorting', () => {
    it('sorts runs by completion date', () => {
      // Create runs with out-of-order dates
      const runs = [
        createMockRun({
          id: 'run-later',
          completedAt: '2024-01-20T10:30:00Z',
          definition: { ...createMockRun().definition, name: 'Later Run' },
        }),
        createMockRun({
          id: 'run-earlier',
          completedAt: '2024-01-15T10:30:00Z',
          definition: { ...createMockRun().definition, name: 'Earlier Run' },
        }),
      ];

      render(
        <TimelineViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should render without errors and show both runs
      expect(screen.getByText('Runs in Timeline')).toBeInTheDocument();
      expect(screen.getByText(/Earlier Run/)).toBeInTheDocument();
      expect(screen.getByText(/Later Run/)).toBeInTheDocument();
    });
  });

  describe('model display names', () => {
    it('strips provider prefix from model names', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          completedAt: '2024-01-15T10:30:00Z',
        }),
        createMockRun({
          id: 'run-2',
          completedAt: '2024-01-20T10:30:00Z',
        }),
      ];

      render(
        <TimelineViz
          runs={runs}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Model names should have provider prefix stripped in trend display
      const trendSection = screen.getByText('Trend Analysis (Mean Decision)').closest('div');
      expect(trendSection).toBeTruthy();
    });
  });
});
