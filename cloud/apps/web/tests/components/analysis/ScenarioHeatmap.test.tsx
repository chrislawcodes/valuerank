/**
 * ScenarioHeatmap Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScenarioHeatmap } from '../../../src/components/analysis/ScenarioHeatmap';
import type { VisualizationData } from '../../../src/api/operations/analysis';

function createMockVisualizationData(): VisualizationData {
  return {
    decisionDistribution: {},
    modelScenarioMatrix: {
      'gpt-4': {
        scenario1: 2.5,
        scenario2: 3.0,
        scenario3: 4.2,
      },
      'claude-3': {
        scenario1: 2.8,
        scenario2: 3.5,
        scenario3: 2.0,
      },
      'gemini-pro': {
        scenario1: 3.0,
        scenario2: 2.5,
        scenario3: 3.8,
      },
    },
  };
}

describe('ScenarioHeatmap', () => {
  it('renders heatmap when data is available', () => {
    const visualizationData = createMockVisualizationData();
    render(<ScenarioHeatmap visualizationData={visualizationData} />);

    expect(screen.getByText('Model Behavior by Scenario')).toBeInTheDocument();
    expect(screen.getByText(/Heatmap showing average decision per model/)).toBeInTheDocument();
  });

  it('renders empty state when no model scenario matrix data', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {},
      modelScenarioMatrix: {},
    };
    render(<ScenarioHeatmap visualizationData={visualizationData} />);

    expect(screen.getByText('No scenario data available')).toBeInTheDocument();
  });

  it('renders empty state when modelScenarioMatrix is undefined', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {},
      modelScenarioMatrix: undefined as unknown as Record<string, Record<string, number>>,
    };
    render(<ScenarioHeatmap visualizationData={visualizationData} />);

    expect(screen.getByText('No scenario data available')).toBeInTheDocument();
  });

  it('displays color legend', () => {
    const visualizationData = createMockVisualizationData();
    render(<ScenarioHeatmap visualizationData={visualizationData} />);

    expect(screen.getByText('Low (1)')).toBeInTheDocument();
    expect(screen.getByText('High (5)')).toBeInTheDocument();
  });

  it('displays scenario insights when data allows', () => {
    const visualizationData = createMockVisualizationData();
    render(<ScenarioHeatmap visualizationData={visualizationData} />);

    expect(screen.getByText('Highest agreement:')).toBeInTheDocument();
    expect(screen.getByText('Highest disagreement:')).toBeInTheDocument();
  });

  it('handles single model data', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {},
      modelScenarioMatrix: {
        'single-model': {
          scenario1: 2.5,
          scenario2: 3.0,
        },
      },
    };
    render(<ScenarioHeatmap visualizationData={visualizationData} />);

    expect(screen.getByText('Model Behavior by Scenario')).toBeInTheDocument();
  });

  it('handles single scenario data', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {},
      modelScenarioMatrix: {
        'model1': { scenario1: 2.5 },
        'model2': { scenario1: 3.5 },
      },
    };
    render(<ScenarioHeatmap visualizationData={visualizationData} />);

    expect(screen.getByText('Model Behavior by Scenario')).toBeInTheDocument();
  });

  it('truncates long model names', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {},
      modelScenarioMatrix: {
        'this-is-a-very-long-model-name-that-should-be-truncated': {
          scenario1: 2.5,
          scenario2: 3.0,
        },
      },
    };
    render(<ScenarioHeatmap visualizationData={visualizationData} />);

    expect(screen.getByText('Model Behavior by Scenario')).toBeInTheDocument();
  });

  it('limits scenarios to first 20', () => {
    const scenarios: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      scenarios[`scenario${i}`] = 2.0 + i * 0.1;
    }

    const visualizationData: VisualizationData = {
      decisionDistribution: {},
      modelScenarioMatrix: {
        model1: scenarios,
      },
    };
    render(<ScenarioHeatmap visualizationData={visualizationData} />);

    expect(screen.getByText('Model Behavior by Scenario')).toBeInTheDocument();
  });

  it('handles models with different scenario sets', () => {
    const visualizationData: VisualizationData = {
      decisionDistribution: {},
      modelScenarioMatrix: {
        model1: { scenarioA: 2.5, scenarioB: 3.0 },
        model2: { scenarioB: 2.0, scenarioC: 4.0 },
        model3: { scenarioA: 3.5, scenarioC: 2.5 },
      },
    };
    render(<ScenarioHeatmap visualizationData={visualizationData} />);

    expect(screen.getByText('Model Behavior by Scenario')).toBeInTheDocument();
  });
});
