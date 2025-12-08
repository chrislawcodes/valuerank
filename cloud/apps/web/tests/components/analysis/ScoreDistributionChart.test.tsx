/**
 * ScoreDistributionChart Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScoreDistributionChart } from '../../../src/components/analysis/ScoreDistributionChart';
import type { PerModelStats } from '../../../src/api/operations/analysis';

function createMockPerModel(): Record<string, PerModelStats> {
  return {
    'gpt-4': {
      sampleSize: 50,
      values: {
        'Physical_Safety': {
          winRate: 0.8,
          confidenceInterval: { lower: 0.7, upper: 0.9, level: 0.95, method: 'wilson' },
          count: { prioritized: 40, deprioritized: 10, neutral: 0 },
        },
        'Compassion': {
          winRate: 0.6,
          confidenceInterval: { lower: 0.5, upper: 0.7, level: 0.95, method: 'wilson' },
          count: { prioritized: 30, deprioritized: 20, neutral: 0 },
        },
      },
      overall: { mean: 0.7, stdDev: 0.15, min: 0.4, max: 0.9 },
    },
    'claude-3': {
      sampleSize: 50,
      values: {
        'Physical_Safety': {
          winRate: 0.75,
          confidenceInterval: { lower: 0.65, upper: 0.85, level: 0.95, method: 'wilson' },
          count: { prioritized: 38, deprioritized: 12, neutral: 0 },
        },
        'Compassion': {
          winRate: 0.55,
          confidenceInterval: { lower: 0.45, upper: 0.65, level: 0.95, method: 'wilson' },
          count: { prioritized: 28, deprioritized: 22, neutral: 0 },
        },
      },
      overall: { mean: 0.65, stdDev: 0.12, min: 0.45, max: 0.85 },
    },
  };
}

describe('ScoreDistributionChart', () => {
  it('renders value selector with available values', () => {
    const perModel = createMockPerModel();
    render(<ScoreDistributionChart perModel={perModel} />);

    const select = screen.getByLabelText('Select Value:');
    expect(select).toBeInTheDocument();

    // Check that both values are in the select
    expect(screen.getByRole('option', { name: 'Compassion' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Physical Safety' })).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<ScoreDistributionChart perModel={{}} />);

    expect(screen.getByText('No value data available')).toBeInTheDocument();
  });

  it('allows changing selected value', () => {
    const perModel = createMockPerModel();
    render(<ScoreDistributionChart perModel={perModel} />);

    const select = screen.getByLabelText('Select Value:');
    fireEvent.change(select, { target: { value: 'Compassion' } });

    expect(select).toHaveValue('Compassion');
  });

  it('calls onValueChange when value changes in controlled mode', () => {
    const perModel = createMockPerModel();
    const onValueChange = vi.fn();

    render(
      <ScoreDistributionChart
        perModel={perModel}
        selectedValue="Physical_Safety"
        onValueChange={onValueChange}
      />
    );

    const select = screen.getByLabelText('Select Value:');
    fireEvent.change(select, { target: { value: 'Compassion' } });

    expect(onValueChange).toHaveBeenCalledWith('Compassion');
  });

  it('uses controlled value when provided', () => {
    const perModel = createMockPerModel();

    render(
      <ScoreDistributionChart
        perModel={perModel}
        selectedValue="Compassion"
      />
    );

    const select = screen.getByLabelText('Select Value:');
    expect(select).toHaveValue('Compassion');
  });

  it('renders chart legend', () => {
    const perModel = createMockPerModel();
    render(<ScoreDistributionChart perModel={perModel} />);

    expect(screen.getByText(/Win rate = prioritized/)).toBeInTheDocument();
  });

  it('handles single model data', () => {
    const perModel: Record<string, PerModelStats> = {
      'gpt-4': {
        sampleSize: 50,
        values: {
          'Physical_Safety': {
            winRate: 0.8,
            confidenceInterval: { lower: 0.7, upper: 0.9, level: 0.95, method: 'wilson' },
            count: { prioritized: 40, deprioritized: 10, neutral: 0 },
          },
        },
        overall: { mean: 0.8, stdDev: 0.1, min: 0.7, max: 0.9 },
      },
    };

    render(<ScoreDistributionChart perModel={perModel} />);

    const select = screen.getByLabelText('Select Value:');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Physical Safety' })).toBeInTheDocument();
  });

  it('shows no data message when selected value has no data for any model', () => {
    const perModel: Record<string, PerModelStats> = {
      'gpt-4': {
        sampleSize: 50,
        values: {},
        overall: { mean: 0.5, stdDev: 0.1, min: 0.4, max: 0.6 },
      },
    };

    render(<ScoreDistributionChart perModel={perModel} />);

    expect(screen.getByText('No value data available')).toBeInTheDocument();
  });
});
