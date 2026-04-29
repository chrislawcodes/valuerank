import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PressureSensitivityCrossValueMap } from './PressureSensitivityCrossValueMap';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';

function createModel(): PressureSensitivityModel {
  return {
    modelId: 'model-a',
    label: 'Model A',
    providerName: 'Provider',
    unscoredCount: 0,
    winRateDeltaSummary: {
      mean: 0.1,
      ciLow: 0.05,
      ciHigh: 0.15,
      lowBandMean: 0.52,
      highBandMean: 0.62,
      pairsMeasured: 1,
      pairsPositive: 1,
    },
    valuePairs: [
      {
        pairKey: 'alpha::beta',
        ownToken: 'Alpha',
        opponentToken: 'Beta',
        n: 12,
        unscoredCount: 0,
        definitionsMeasured: 1,
        definitionsExcluded: 0,
        qualifyingTrials: 12,
        winRateDelta: {
          value: 0.4,
          lowBandMean: 0.45,
          highBandMean: 0.85,
          ciLow: 0.1,
          ciHigh: 0.7,
          reason: null,
        },
        grid: [],
      },
    ],
  };
}

describe('PressureSensitivityCrossValueMap', () => {
  it('uses winRateDelta for the cell title and label', () => {
    render(<PressureSensitivityCrossValueMap models={[createModel()]} />);

    expect(screen.getByText('Win rate sensitivity by value pair')).toBeDefined();
    expect(screen.getByTitle('Model A alpha::beta: |Win rate Δ| = 0.400')).toBeDefined();
    expect(screen.getByText('0.40')).toBeDefined();
  });
});
