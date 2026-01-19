/**
 * ModelConsistencyChart Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelConsistencyChart } from '../../../src/components/analysis/ModelConsistencyChart';
import type { PerModelStats, VarianceAnalysis } from '../../../src/api/operations/analysis';

function createMockPerModel(): Record<string, PerModelStats> {
  return {
    'gpt-4': {
      sampleSize: 50,
      values: {
        Physical_Safety: {
          winRate: 0.8,
          confidenceInterval: { lower: 0.7, upper: 0.9, level: 0.95, method: 'wilson' },
          count: { prioritized: 40, deprioritized: 10, neutral: 0 },
        },
      },
      overall: { mean: 2.5, stdDev: 0.8, min: 1.5, max: 3.5 },
    },
    'claude-3': {
      sampleSize: 50,
      values: {
        Physical_Safety: {
          winRate: 0.75,
          confidenceInterval: { lower: 0.65, upper: 0.85, level: 0.95, method: 'wilson' },
          count: { prioritized: 38, deprioritized: 12, neutral: 0 },
        },
      },
      overall: { mean: 3.0, stdDev: 1.2, min: 1.8, max: 4.2 },
    },
    'gemini-pro': {
      sampleSize: 50,
      values: {},
      overall: { mean: 3.5, stdDev: 0.5, min: 3.0, max: 4.0 },
    },
  };
}

describe('ModelConsistencyChart', () => {
  it('renders chart when data is available', () => {
    const perModel = createMockPerModel();
    render(<ModelConsistencyChart perModel={perModel} />);

    expect(screen.getByText('Model Decision Consistency')).toBeInTheDocument();
    expect(
      screen.getByText(/Average decision.*and standard deviation/i)
    ).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<ModelConsistencyChart perModel={{}} />);

    expect(screen.getByText('No model data available')).toBeInTheDocument();
  });

  it('renders empty state when perModel is undefined', () => {
    render(
      <ModelConsistencyChart
        perModel={undefined as unknown as Record<string, PerModelStats>}
      />
    );

    expect(screen.getByText('No model data available')).toBeInTheDocument();
  });

  it('displays most consistent models section', () => {
    const perModel = createMockPerModel();
    render(<ModelConsistencyChart perModel={perModel} />);

    expect(screen.getByText('Most Consistent')).toBeInTheDocument();
  });

  it('displays most variable models section', () => {
    const perModel = createMockPerModel();
    render(<ModelConsistencyChart perModel={perModel} />);

    expect(screen.getByText('Most Variable')).toBeInTheDocument();
  });

  it('handles single model data', () => {
    const perModel: Record<string, PerModelStats> = {
      'single-model': {
        sampleSize: 30,
        values: {},
        overall: { mean: 2.8, stdDev: 0.6, min: 2.2, max: 3.4 },
      },
    };
    render(<ModelConsistencyChart perModel={perModel} />);

    expect(screen.getByText('Model Decision Consistency')).toBeInTheDocument();
  });

  it('handles many models correctly', () => {
    const perModel: Record<string, PerModelStats> = {};
    for (let i = 0; i < 10; i++) {
      perModel[`model-${i}`] = {
        sampleSize: 30,
        values: {},
        overall: { mean: 2 + i * 0.3, stdDev: 0.5 + i * 0.1, min: 1.5, max: 4.5 },
      };
    }
    render(<ModelConsistencyChart perModel={perModel} />);

    expect(screen.getByText('Model Decision Consistency')).toBeInTheDocument();
    expect(screen.getByText('Most Consistent')).toBeInTheDocument();
    expect(screen.getByText('Most Variable')).toBeInTheDocument();
  });

  it('truncates long model names in chart', () => {
    const perModel: Record<string, PerModelStats> = {
      'this-is-a-very-long-model-name-that-needs-truncation': {
        sampleSize: 30,
        values: {},
        overall: { mean: 3.0, stdDev: 0.8, min: 2.2, max: 3.8 },
      },
    };
    render(<ModelConsistencyChart perModel={perModel} />);

    expect(screen.getByText('Model Decision Consistency')).toBeInTheDocument();
  });

  describe('multi-sample variance', () => {
    function createMockVarianceAnalysis(): VarianceAnalysis {
      return {
        isMultiSample: true,
        samplesPerScenario: 5,
        perModel: {
          'gpt-4': {
            totalSamples: 50,
            uniqueScenarios: 10,
            samplesPerScenario: 5,
            avgWithinScenarioVariance: 0.0225, // stdDev = 0.15
            maxWithinScenarioVariance: 0.04,
            consistencyScore: 0.92,
            perScenario: {},
          },
          'claude-3': {
            totalSamples: 50,
            uniqueScenarios: 10,
            samplesPerScenario: 5,
            avgWithinScenarioVariance: 0.0625, // stdDev = 0.25
            maxWithinScenarioVariance: 0.09,
            consistencyScore: 0.85,
            perScenario: {},
          },
        },
        mostVariableScenarios: [
          {
            scenarioId: 'scenario-1',
            scenarioName: 'High Variance Scenario',
            mean: 2.5,
            stdDev: 0.8,
            variance: 0.64,
            range: 3.0,
            sampleCount: 5,
          },
        ],
        leastVariableScenarios: [
          {
            scenarioId: 'scenario-2',
            scenarioName: 'Low Variance Scenario',
            mean: 3.0,
            stdDev: 0.1,
            variance: 0.01,
            range: 0.5,
            sampleCount: 5,
          },
        ],
      };
    }

    it('shows multi-sample indicator when variance data is provided', () => {
      const perModel = createMockPerModel();
      const varianceAnalysis = createMockVarianceAnalysis();
      render(<ModelConsistencyChart perModel={perModel} varianceAnalysis={varianceAnalysis} />);

      expect(screen.getByText(/Multi-sample run: 5 samples per scenario/)).toBeInTheDocument();
    });

    it('displays variance analysis section for multi-sample runs', () => {
      const perModel = createMockPerModel();
      const varianceAnalysis = createMockVarianceAnalysis();
      render(<ModelConsistencyChart perModel={perModel} varianceAnalysis={varianceAnalysis} />);

      expect(screen.getByText('Multi-Sample Variance Analysis')).toBeInTheDocument();
    });

    it('shows most variable scenarios section', () => {
      const perModel = createMockPerModel();
      const varianceAnalysis = createMockVarianceAnalysis();
      render(<ModelConsistencyChart perModel={perModel} varianceAnalysis={varianceAnalysis} />);

      expect(screen.getByText('Most Variable Scenarios')).toBeInTheDocument();
      expect(screen.getByText('High Variance Scenario')).toBeInTheDocument();
    });

    it('shows most stable scenarios section', () => {
      const perModel = createMockPerModel();
      const varianceAnalysis = createMockVarianceAnalysis();
      render(<ModelConsistencyChart perModel={perModel} varianceAnalysis={varianceAnalysis} />);

      expect(screen.getByText('Most Stable Scenarios')).toBeInTheDocument();
      expect(screen.getByText('Low Variance Scenario')).toBeInTheDocument();
    });

    it('does not show multi-sample section when varianceAnalysis is null', () => {
      const perModel = createMockPerModel();
      render(<ModelConsistencyChart perModel={perModel} varianceAnalysis={null} />);

      expect(screen.queryByText('Multi-Sample Variance Analysis')).not.toBeInTheDocument();
    });

    it('does not show multi-sample section when isMultiSample is false', () => {
      const perModel = createMockPerModel();
      const varianceAnalysis: VarianceAnalysis = {
        isMultiSample: false,
        samplesPerScenario: 1,
        perModel: {},
        mostVariableScenarios: [],
        leastVariableScenarios: [],
      };
      render(<ModelConsistencyChart perModel={perModel} varianceAnalysis={varianceAnalysis} />);

      expect(screen.queryByText('Multi-Sample Variance Analysis')).not.toBeInTheDocument();
    });
  });
});
