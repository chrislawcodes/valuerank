/**
 * DecisionDistributionChart Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DecisionDistributionChart,
  CustomTooltip,
  buildDecisionDistributionChartData,
  formatDecisionDistributionScopeNote,
} from '../../../src/components/analysis/DecisionDistributionChart';
import type { VisualizationData } from '../../../src/api/operations/analysis';

function createMockVisualizationData(): VisualizationData {
  return {
    decisionDistribution: {
      'gpt-4': { '1': 10, '2': 15, '3': 20, '4': 8, '5': 7 },
      'claude-3': { '1': 12, '2': 18, '3': 15, '4': 10, '5': 5 },
      'gemini-pro': { '1': 8, '2': 12, '3': 25, '4': 9, '5': 6 },
    },
    modelScenarioMatrix: {},
  };
}

describe('DecisionDistributionChart', () => {
  it('renders chart when data is available', () => {
    const visualizationData = createMockVisualizationData();
    render(<DecisionDistributionChart visualizationData={visualizationData} />);

    expect(screen.getByText('Decision Distribution by Model')).toBeInTheDocument();
    expect(screen.queryByText(/Shows how each model distributes its decisions.*percentages/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Total decisions in scope:/)).not.toBeInTheDocument();
  });

  it('renders empty state when no decision distribution data', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {},
      modelScenarioMatrix: {},
    };
    render(<DecisionDistributionChart visualizationData={visualizationData} />);

    expect(screen.getByText('No decision distribution data available')).toBeInTheDocument();
  });

  it('renders empty state when decisionDistribution is undefined', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: undefined as unknown as Record<string, Record<string, number>>,
      modelScenarioMatrix: {},
    };
    render(<DecisionDistributionChart visualizationData={visualizationData} />);

    expect(screen.getByText('No decision distribution data available')).toBeInTheDocument();
  });

  it('does not render the old scale explainer footer', () => {
    const visualizationData = createMockVisualizationData();
    render(<DecisionDistributionChart visualizationData={visualizationData} />);

    expect(screen.queryByText(/1 = strongly agree with option A/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/5 = strongly agree with option B/i)).not.toBeInTheDocument();
  });

  it('handles single model data', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {
        'single-model': { '1': 5, '2': 10, '3': 15, '4': 8, '5': 2 },
      },
      modelScenarioMatrix: {},
    };
    render(<DecisionDistributionChart visualizationData={visualizationData} />);

    expect(screen.getByText('Decision Distribution by Model')).toBeInTheDocument();
  });

  it('handles models with missing decision counts', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {
        'model-with-gaps': { '1': 5, '3': 10, '5': 3 }, // Missing '2' and '4'
      },
      modelScenarioMatrix: {},
    };
    render(<DecisionDistributionChart visualizationData={visualizationData} />);

    expect(screen.getByText('Decision Distribution by Model')).toBeInTheDocument();
  });

  it('formats the scope note when model totals vary', () => {
    const chartData = buildDecisionDistributionChartData({
      'model-a': { '1': 5, '2': 5, '3': 5, '4': 3, '5': 2 },
      'model-b': { '1': 5, '2': 5, '3': 4, '4': 2, '5': 2 },
    });

    expect(formatDecisionDistributionScopeNote(chartData)).toBe(
      'Total decisions in scope varies by model: n=18-20. Hover bars for raw counts.'
    );
  });
  it('shows percentages and raw counts in the tooltip', () => {
    const chartData = buildDecisionDistributionChartData({
      'gpt-4': { '1': 10, '2': 15, '3': 20, '4': 8, '5': 7 },
    });

    render(
      <CustomTooltip
        active
        payload={[{ payload: chartData[0] }]}
        dimensionLabels={{ '1': 'Strongly support A' }}
      />
    );

    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('Total decisions: n=60')).toBeInTheDocument();
    expect(screen.getByText('Strongly support A:')).toBeInTheDocument();
    expect(screen.getByText('17% (10)')).toBeInTheDocument();
    expect(screen.getByText('33% (20)')).toBeInTheDocument();
  });

  it('truncates long model names', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {
        'this-is-a-very-long-model-name-that-should-be-truncated': {
          '1': 5,
          '2': 10,
          '3': 15,
          '4': 8,
          '5': 2,
        },
      },
      modelScenarioMatrix: {},
    };
    render(<DecisionDistributionChart visualizationData={visualizationData} />);

    expect(screen.getByText('Decision Distribution by Model')).toBeInTheDocument();
  });
});
