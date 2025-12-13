/**
 * OverviewViz Component Tests
 *
 * Tests for the overview visualization in comparison feature.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { OverviewViz } from '../../../../src/components/compare/visualizations/OverviewViz';
import type { RunWithAnalysis, ComparisonStatistics, ComparisonFilters } from '../../../../src/components/compare/types';
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
    analysis: null,
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

function createMockStatistics(overrides: Partial<ComparisonStatistics> = {}): ComparisonStatistics {
  return {
    runPairs: [
      {
        run1Id: 'run-1',
        run2Id: 'run-2',
        meanDifference: 0.45,
        effectSize: 0.52,
        effectInterpretation: 'medium',
        significantValueChanges: ['Compassion', 'Freedom'],
      },
    ],
    commonModels: ['openai:gpt-4o'],
    uniqueModels: {
      'run-1': ['anthropic:claude-3'],
      'run-2': ['google:gemini'],
    },
    summary: {
      totalRuns: 2,
      totalSamples: 200,
      meanDecisionRange: [2.85, 3.30],
    },
    ...overrides,
  };
}

const defaultFilters: ComparisonFilters = {
  displayMode: 'overlay',
};

describe('OverviewViz', () => {
  describe('loading state', () => {
    it('shows loading message when statistics is null', () => {
      const runs = [createMockRun()];

      render(
        <OverviewViz
          runs={runs}
          statistics={undefined}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Computing statistics...')).toBeInTheDocument();
    });
  });

  describe('run summary table', () => {
    it('renders run summary section', () => {
      const runs = [
        createMockRun({ id: 'run-1' }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Another Definition' } }),
      ];
      const statistics = createMockStatistics();

      render(
        <OverviewViz
          runs={runs}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Run Summary')).toBeInTheDocument();
      expect(screen.getByText('(2 runs, 200 total samples)')).toBeInTheDocument();
    });

    it('displays run definition names', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Trolley Problem' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Medical Ethics' } }),
      ];

      render(
        <OverviewViz
          runs={runs}
          statistics={createMockStatistics()}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Names may appear multiple times (in summary table and effect sizes)
      expect(screen.getAllByText('Trolley Problem').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Medical Ethics').length).toBeGreaterThanOrEqual(1);
    });

    it('displays model tags for each run', () => {
      const runs = [
        createMockRun({
          id: 'run-1',
          config: { models: ['openai:gpt-4o', 'anthropic:claude-3'] },
        }),
      ];

      render(
        <OverviewViz
          runs={runs}
          statistics={createMockStatistics()}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Model names may appear in multiple sections (run table and model coverage)
      expect(screen.getAllByText('gpt-4o').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('claude-3').length).toBeGreaterThanOrEqual(1);
    });

    it('displays aggregate statistics', () => {
      const runs = [
        createMockRun({
          aggregateStats: {
            overallMean: 3.25,
            overallStdDev: 0.85,
            sampleCount: 150,
          },
        }),
      ];

      render(
        <OverviewViz
          runs={runs}
          statistics={createMockStatistics()}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('3.25')).toBeInTheDocument();
      expect(screen.getByText('0.85')).toBeInTheDocument();
    });

    it('shows dash for missing aggregate stats', () => {
      const runs = [
        createMockRun({
          aggregateStats: undefined,
        }),
      ];

      render(
        <OverviewViz
          runs={runs}
          statistics={createMockStatistics()}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      // Should show dashes for samples, mean, and std dev
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('effect sizes section', () => {
    it('renders effect sizes table when run pairs exist', () => {
      const runs = [
        createMockRun({ id: 'run-1', definition: { ...createMockRun().definition, name: 'Run A' } }),
        createMockRun({ id: 'run-2', definition: { ...createMockRun().definition, name: 'Run B' } }),
      ];
      const statistics = createMockStatistics();

      render(
        <OverviewViz
          runs={runs}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText("Effect Sizes (Cohen's d)")).toBeInTheDocument();
      // Names appear in both summary table and effect sizes, so use getAllByText
      // Run names are now formatted as "Run: <def name> on <date>"
      expect(screen.getAllByText(/Run A/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('vs').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Run B/).length).toBeGreaterThanOrEqual(1);
    });

    it('displays effect size value and interpretation', () => {
      const runs = [
        createMockRun({ id: 'run-1' }),
        createMockRun({ id: 'run-2' }),
      ];
      const statistics = createMockStatistics({
        runPairs: [
          {
            run1Id: 'run-1',
            run2Id: 'run-2',
            meanDifference: 0.45,
            effectSize: 0.52,
            effectInterpretation: 'medium',
            significantValueChanges: [],
          },
        ],
      });

      render(
        <OverviewViz
          runs={runs}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('0.52')).toBeInTheDocument();
      expect(screen.getByText('medium')).toBeInTheDocument();
    });

    it('displays positive mean difference with plus sign', () => {
      const runs = [createMockRun({ id: 'run-1' }), createMockRun({ id: 'run-2' })];
      const statistics = createMockStatistics({
        runPairs: [
          {
            run1Id: 'run-1',
            run2Id: 'run-2',
            meanDifference: 0.45,
            effectSize: 0.52,
            effectInterpretation: 'medium',
            significantValueChanges: [],
          },
        ],
      });

      render(
        <OverviewViz
          runs={runs}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('+0.45')).toBeInTheDocument();
    });

    it('displays significant value changes', () => {
      const runs = [createMockRun({ id: 'run-1' }), createMockRun({ id: 'run-2' })];
      const statistics = createMockStatistics({
        runPairs: [
          {
            run1Id: 'run-1',
            run2Id: 'run-2',
            meanDifference: 0.45,
            effectSize: 0.52,
            effectInterpretation: 'medium',
            significantValueChanges: ['Compassion', 'Freedom'],
          },
        ],
      });

      render(
        <OverviewViz
          runs={runs}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Compassion')).toBeInTheDocument();
      expect(screen.getByText('Freedom')).toBeInTheDocument();
    });

    it('shows "None" when no significant value changes', () => {
      const runs = [createMockRun({ id: 'run-1' }), createMockRun({ id: 'run-2' })];
      const statistics = createMockStatistics({
        runPairs: [
          {
            run1Id: 'run-1',
            run2Id: 'run-2',
            meanDifference: 0.05,
            effectSize: 0.08,
            effectInterpretation: 'negligible',
            significantValueChanges: [],
          },
        ],
      });

      render(
        <OverviewViz
          runs={runs}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('None')).toBeInTheDocument();
    });

    it('limits displayed value changes to 3', () => {
      const runs = [createMockRun({ id: 'run-1' }), createMockRun({ id: 'run-2' })];
      const statistics = createMockStatistics({
        runPairs: [
          {
            run1Id: 'run-1',
            run2Id: 'run-2',
            meanDifference: 0.8,
            effectSize: 1.2,
            effectInterpretation: 'large',
            significantValueChanges: ['Compassion', 'Freedom', 'Loyalty', 'Tradition', 'Economics'],
          },
        ],
      });

      render(
        <OverviewViz
          runs={runs}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Compassion')).toBeInTheDocument();
      expect(screen.getByText('Freedom')).toBeInTheDocument();
      expect(screen.getByText('Loyalty')).toBeInTheDocument();
      expect(screen.getByText('+2 more')).toBeInTheDocument();
    });

    it('does not render effect sizes section when no run pairs', () => {
      const runs = [createMockRun()];
      const statistics = createMockStatistics({
        runPairs: [],
      });

      render(
        <OverviewViz
          runs={runs}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.queryByText("Effect Sizes (Cohen's d)")).not.toBeInTheDocument();
    });
  });

  describe('model coverage section', () => {
    it('renders model coverage section', () => {
      render(
        <OverviewViz
          runs={[createMockRun()]}
          statistics={createMockStatistics()}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Model Coverage')).toBeInTheDocument();
    });

    it('displays common models count', () => {
      const statistics = createMockStatistics({
        commonModels: ['openai:gpt-4o', 'anthropic:claude-3'],
      });

      render(
        <OverviewViz
          runs={[createMockRun()]}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Common Models (2)')).toBeInTheDocument();
    });

    it('displays common model names', () => {
      const statistics = createMockStatistics({
        commonModels: ['openai:gpt-4o', 'anthropic:claude-3'],
      });

      render(
        <OverviewViz
          runs={[createMockRun()]}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      const modelCoverageSection = screen.getByText('Common Models (2)').closest('div');
      expect(modelCoverageSection).toBeInTheDocument();
    });

    it('shows message when no common models', () => {
      const statistics = createMockStatistics({
        commonModels: [],
      });

      render(
        <OverviewViz
          runs={[createMockRun()]}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('No common models across all runs')).toBeInTheDocument();
    });

    it('displays unique models per run', () => {
      const runs = [
        createMockRun({ id: 'run-1' }),
        createMockRun({ id: 'run-2' }),
      ];
      const statistics = createMockStatistics({
        uniqueModels: {
          'run-1': ['anthropic:claude-3'],
          'run-2': ['google:gemini'],
        },
      });

      render(
        <OverviewViz
          runs={runs}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Unique Models')).toBeInTheDocument();
    });

    it('shows message when all models are common', () => {
      const runs = [createMockRun({ id: 'run-1' })];
      const statistics = createMockStatistics({
        uniqueModels: {
          'run-1': [],
        },
      });

      render(
        <OverviewViz
          runs={runs}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('All models are common across runs')).toBeInTheDocument();
    });
  });

  describe('decision range section', () => {
    it('displays min and max mean decision values', () => {
      const statistics = createMockStatistics({
        summary: {
          totalRuns: 2,
          totalSamples: 200,
          meanDecisionRange: [2.50, 3.80],
        },
      });

      render(
        <OverviewViz
          runs={[createMockRun()]}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      expect(screen.getByText('Decision Range')).toBeInTheDocument();
      expect(screen.getByText('2.50')).toBeInTheDocument();
      expect(screen.getByText('3.80')).toBeInTheDocument();
    });
  });

  describe('effect size coloring', () => {
    it.each([
      { interpretation: 'negligible' as const, expectedClass: 'text-gray-500' },
      { interpretation: 'small' as const, expectedClass: 'text-blue-600' },
      { interpretation: 'medium' as const, expectedClass: 'text-yellow-600' },
      { interpretation: 'large' as const, expectedClass: 'text-red-600' },
    ])('applies $expectedClass for $interpretation effect size', ({ interpretation, expectedClass }) => {
      const runs = [createMockRun({ id: 'run-1' }), createMockRun({ id: 'run-2' })];
      const statistics = createMockStatistics({
        runPairs: [
          {
            run1Id: 'run-1',
            run2Id: 'run-2',
            meanDifference: 0.5,
            effectSize: 0.5,
            effectInterpretation: interpretation,
            significantValueChanges: [],
          },
        ],
      });

      render(
        <OverviewViz
          runs={runs}
          statistics={statistics}
          filters={defaultFilters}
          onFilterChange={vi.fn()}
        />
      );

      const interpretationElement = screen.getByText(interpretation);
      expect(interpretationElement).toHaveClass(expectedClass);
    });
  });
});
