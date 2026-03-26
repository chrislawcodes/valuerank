import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DecisionDistributionChart,
  CustomLegend,
  CustomTooltip,
  buildDecisionDistributionChartData,
  formatDecisionDistributionScopeNote,
} from '../../../src/components/analysis/DecisionDistributionChart';
import type { VisualizationData } from '../../../src/api/operations/analysis';
import {
  buildDecisionDistributionBuckets,
  getDecisionDistributionEmptyState,
  getDecisionDistributionHelperText,
} from '../../../src/utils/decisionDistributionDisplay';

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
    expect(screen.getByText(getDecisionDistributionHelperText())).toBeInTheDocument();
    expect(screen.queryByText(/Decision 1/i)).not.toBeInTheDocument();
  });

  it('renders empty state when no decision distribution data', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {},
      modelScenarioMatrix: {},
    };
    render(<DecisionDistributionChart visualizationData={visualizationData} />);

    expect(screen.getByText(getDecisionDistributionEmptyState())).toBeInTheDocument();
  });

  it('renders empty state when decisionDistribution is undefined', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: undefined as unknown as Record<string, Record<string, number>>,
      modelScenarioMatrix: {},
    };
    render(<DecisionDistributionChart visualizationData={visualizationData} />);

    expect(screen.getByText(getDecisionDistributionEmptyState())).toBeInTheDocument();
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

  it('renders the legend in canonical bucket order', () => {
    const buckets = buildDecisionDistributionBuckets({
      '1': 'Strongly support the other value',
      '2': 'Somewhat support the other value',
      '3': 'Neutral',
      '4': 'Somewhat support this value',
      '5': 'Strongly support this value',
    });

    const { container } = render(<CustomLegend buckets={buckets} />);
    const labels = Array.from(container.querySelectorAll('span.text-gray-600')).map(
      (node) => node.textContent,
    );

    expect(labels).toEqual([
      'Strongly support the other value',
      'Somewhat support the other value',
      'Neutral',
      'Somewhat support this value',
      'Strongly support this value',
    ]);
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
    const buckets = buildDecisionDistributionBuckets({
      '1': 'Strongly support the other value',
      '2': 'Somewhat support the other value',
      '3': 'Neutral',
      '4': 'Somewhat support this value',
      '5': 'Strongly support this value',
    });

    render(
      <CustomTooltip
        active
        payload={[{ payload: chartData[0] }]}
        buckets={buckets}
      />,
    );

    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('Total decisions: n=60')).toBeInTheDocument();
    expect(screen.getByText('Strongly support the other value:')).toBeInTheDocument();
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
