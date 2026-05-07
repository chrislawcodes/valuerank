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

function createRow(overrides: Partial<ModelGroupingSignificanceRow>): ModelGroupingSignificanceRow {
  return {
    __typename: 'ModelGroupingSignificanceRow',
    modelAId: 'alpha',
    modelALabel: 'Alpha',
    modelBId: 'beta',
    modelBLabel: 'Beta',
    n: 10,
    agreementRate: 0.8,
    discordantAtoB: 2,
    discordantBtoA: 1,
    oddsRatio: 2,
    meanDifference: 0.5,
    rawPValue: 0.01,
    holmCorrectedPValue: 0.03,
    effectSize: 0.8,
    effectLabel: 'Strong',
    confidenceIntervalLow: 0.2,
    confidenceIntervalHigh: 0.8,
    verdict: 'Significant',
    ...overrides,
  };
}

describe('ModelGroupingSignificanceHeatmap', () => {
  it('renders the diagonal placeholder and cell titles', () => {
    render(
      <ModelGroupingSignificanceHeatmap
        models={[createModel('alpha', 'Alpha'), createModel('beta', 'Beta'), createModel('gamma', 'Gamma')]}
        rows={[
          createRow({ modelBId: 'beta', modelBLabel: 'Beta', meanDifference: 0.5, effectSize: 0.8, verdict: 'Significant' }),
          createRow({ modelBId: 'gamma', modelBLabel: 'Gamma', meanDifference: -0.2, effectSize: 0.2, verdict: 'Weak' }),
          createRow({
            modelAId: 'beta',
            modelALabel: 'Beta',
            modelBId: 'gamma',
            modelBLabel: 'Gamma',
            agreementRate: 0.7,
            discordantAtoB: 1,
            discordantBtoA: 2,
            oddsRatio: 0.5,
            meanDifference: 0,
            effectSize: null,
            rawPValue: 0.5,
            holmCorrectedPValue: 0.5,
            effectLabel: 'Weak',
            verdict: 'Not significant',
            confidenceIntervalLow: -0.1,
            confidenceIntervalHigh: 0.1,
          }),
        ]}
      />,
    );

    expect(screen.getByTitle('Alpha compared with itself')).toBeDefined();
    expect(screen.getByTitle('Beta compared with itself')).toBeDefined();
    expect(screen.getByTitle('Gamma compared with itself')).toBeDefined();
    expect(
      screen.getByTitle(
        /Alpha vs Beta: mean difference \+0\.5 pp, effect size \+0\.80, verdict Significant/,
      ),
    ).toBeDefined();
    expect(
      screen.getByTitle(
        /Alpha vs Gamma: mean difference -0\.2 pp, effect size \+0\.20, verdict Weak/,
      ),
    ).toBeDefined();
    expect(screen.getAllByText('S')).toHaveLength(2);
    expect(screen.getAllByText('W')).toHaveLength(2);
  });

  it('renders an empty message when there are no models', () => {
    render(<ModelGroupingSignificanceHeatmap models={[]} rows={[]} />);

    expect(screen.getByText('No pairwise significance data available.')).toBeDefined();
  });
});
