/**
 * ModelConsistencyChart Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelConsistencyChart } from '../../../src/components/analysis/ModelConsistencyChart';
import type { PerModelStats } from '../../../src/api/operations/analysis';

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
});
