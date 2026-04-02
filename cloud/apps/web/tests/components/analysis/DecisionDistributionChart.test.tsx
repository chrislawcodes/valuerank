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
      'gpt-4': {
        opponentStrongly: 10,
        opponentSomewhat: 15,
        neutral: 20,
        somewhat: 8,
        strongly: 7,
      },
      'claude-3': {
        opponentStrongly: 12,
        opponentSomewhat: 18,
        neutral: 15,
        somewhat: 10,
        strongly: 5,
      },
      'gemini-pro': {
        opponentStrongly: 8,
        opponentSomewhat: 12,
        neutral: 25,
        somewhat: 9,
        strongly: 6,
      },
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
        'single-model': {
          opponentStrongly: 5,
          opponentSomewhat: 10,
          neutral: 15,
          somewhat: 8,
          strongly: 2,
        },
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
      'model-a': {
        opponentStrongly: 5,
        opponentSomewhat: 5,
        neutral: 5,
        somewhat: 3,
        strongly: 2,
      },
      'model-b': {
        opponentStrongly: 5,
        opponentSomewhat: 5,
        neutral: 4,
        somewhat: 2,
        strongly: 2,
      },
    });

    expect(formatDecisionDistributionScopeNote(chartData)).toBe(
      'Each bar shows the share of transcript decisions for that model.'
    );
  });

  it('shows semantic bucket counts in the tooltip', () => {
    const chartData = buildDecisionDistributionChartData({
      'gpt-4': {
        opponentStrongly: 10,
        opponentSomewhat: 15,
        neutral: 20,
        somewhat: 8,
        strongly: 7,
      },
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
    expect(screen.getByText('Strongly support the other value:')).toBeInTheDocument();
    expect(screen.getByText('17%')).toBeInTheDocument();
    expect(screen.getByText('(10)')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('(20)')).toBeInTheDocument();
    expect(screen.queryByText(/Total decisions:/i)).not.toBeInTheDocument();
  });

  it('truncates long model names', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {
        'this-is-a-very-long-model-name-that-should-be-truncated': {
          opponentStrongly: 5,
          opponentSomewhat: 10,
          neutral: 15,
          somewhat: 8,
          strongly: 2,
        },
      },
      modelScenarioMatrix: {},
    };
    render(<DecisionDistributionChart visualizationData={visualizationData} />);

    expect(screen.getByText('Decision Distribution by Model')).toBeInTheDocument();
  });
});
