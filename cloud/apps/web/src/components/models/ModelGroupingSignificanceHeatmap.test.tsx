import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelGroupingSignificanceHeatmap } from './ModelGroupingSignificanceHeatmap';
import type {
  ModelGroupingSignificanceModel,
  ModelGroupingSignificanceRow,
} from '../../api/operations/modelGroupingSignificance';

function createModel(modelId: string, label: string): ModelGroupingSignificanceModel {
  return {
    __typename: 'ModelGroupingSignificanceModel',
    modelId,
    label,
  };
}

function createRow(overrides: Partial<ModelGroupingSignificanceRow> = {}): ModelGroupingSignificanceRow {
  return {
    __typename: 'ModelGroupingSignificanceRow',
    modelAId: 'alpha',
    modelALabel: 'Alpha',
    modelBId: 'beta',
    modelBLabel: 'Beta',
    n: 10,
    winRateA: 0.8,
    winRateB: 0.7,
    meanDifference: 0.1,
    effectSize: 1,
    maxOrderEffect: 0.05,
    rawPValue: 0.5,
    holmCorrectedPValue: 0.5,
    effectLabel: 'Weak',
    confidenceIntervalLow: null,
    confidenceIntervalHigh: null,
    verdict: 'Not significant',
    ...overrides,
  };
}

describe('ModelGroupingSignificanceHeatmap', () => {
  it('renders the diagonal placeholder', () => {
    render(
      <ModelGroupingSignificanceHeatmap
        models={[createModel('alpha', 'Alpha'), createModel('beta', 'Beta')]}
        rows={[createRow()]}
      />,
    );

    expect(screen.getByTitle('Alpha compared with itself')).toBeDefined();
    expect(screen.getByTitle('Beta compared with itself')).toBeDefined();
  });

  it('renders hover title with mean diff', () => {
    render(
      <ModelGroupingSignificanceHeatmap
        models={[createModel('alpha', 'Alpha'), createModel('beta', 'Beta')]}
        rows={[
          createRow({
            meanDifference: 0.08,
            verdict: 'Weak',
          }),
        ]}
      />,
    );

    expect(screen.getByTitle('Alpha vs Beta: mean diff +8.0%, verdict Weak')).toBeDefined();
    expect(screen.getByTitle('Beta vs Alpha: mean diff +8.0%, verdict Weak')).toBeDefined();
  });

  it('shows S badge for Significant rows and W badge for Weak rows', () => {
    render(
      <ModelGroupingSignificanceHeatmap
        models={[createModel('alpha', 'Alpha'), createModel('beta', 'Beta'), createModel('gamma', 'Gamma')]}
        rows={[
          createRow({
            modelAId: 'alpha',
            modelALabel: 'Alpha',
            modelBId: 'beta',
            modelBLabel: 'Beta',
            verdict: 'Significant',
            effectLabel: 'Strong',
          }),
          createRow({
            modelAId: 'alpha',
            modelALabel: 'Alpha',
            modelBId: 'gamma',
            modelBLabel: 'Gamma',
            verdict: 'Weak',
          }),
          createRow({
            modelAId: 'beta',
            modelALabel: 'Beta',
            modelBId: 'gamma',
            modelBLabel: 'Gamma',
            verdict: 'Not significant',
          }),
        ]}
      />,
    );

    expect(screen.getAllByText('S')).toHaveLength(2);
    expect(screen.getAllByText('W')).toHaveLength(2);
  });

  it('renders an empty message when there are no models', () => {
    render(<ModelGroupingSignificanceHeatmap models={[]} rows={[]} />);

    expect(screen.getByText('No pairwise significance data available.')).toBeDefined();
  });
});
