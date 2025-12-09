/**
 * DecisionDistributionChart Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DecisionDistributionChart } from '../../../src/components/analysis/DecisionDistributionChart';
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
    expect(screen.getByText(/Shows how each model distributes its decisions/)).toBeInTheDocument();
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

  it('displays legend text explaining the scale', () => {
    const visualizationData = createMockVisualizationData();
    render(<DecisionDistributionChart visualizationData={visualizationData} />);

    expect(screen.getByText(/1 = strongly agree with option A/)).toBeInTheDocument();
    expect(screen.getByText(/5 = strongly agree with option B/)).toBeInTheDocument();
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
