import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PressureSensitivityCrossValueMap } from './PressureSensitivityCrossValueMap';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';

function createModel(value: number | null = 0.4): PressureSensitivityModel {
  return {
    modelId: 'model-a',
    label: 'Model A',
    providerName: 'Provider',
    unscoredCount: 0,
    pushedEffectPairsUsed: 0,
    pressureResponseSummary: { mean: 0.1, rangeMin: 0.05, rangeMax: 0.15, pairsMeasured: 1 },
    valueRates: [],
    valuePairs: [
      {
        pairKey: 'alpha::beta',
        firstValueToken: 'alpha',
        firstValueLabel: 'Alpha',
        secondValueToken: 'beta',
        secondValueLabel: 'Beta',
        n: 12,
        unscoredCount: 0,
        definitionsMeasured: 1,
        pressureResponse: {
          value,
          baselineRate: 0.5,
          pushTowardFirstRate: value != null ? 0.5 + value / 2 : null,
          pushTowardSecondRate: value != null ? 0.5 - value / 2 : null,
          qualifyingTrials: 12,
          ciLow: value != null ? value - 0.3 : null,
          ciHigh: value != null ? value + 0.3 : null,
          reason: value == null ? 'directional-thin' : null,
        },
        grid: [],
      },
    ],
  };
}

describe('PressureSensitivityCrossValueMap', () => {
  it('uses pressureResponse for the cell title and label', () => {
    render(<PressureSensitivityCrossValueMap models={[createModel(0.4)]} />);

    expect(screen.getByText('Pressure response by value pair')).toBeDefined();
    expect(screen.getByTitle('Model A alpha::beta: Pressure response = 0.400')).toBeDefined();
    expect(screen.getByText('0.40')).toBeDefined();
  });

  it('shows negative value with minus sign in cell', () => {
    render(<PressureSensitivityCrossValueMap models={[createModel(-0.4)]} />);

    expect(screen.getByTitle('Model A alpha::beta: Pressure response = -0.400')).toBeDefined();
    expect(screen.getByText('-0.40')).toBeDefined();
  });

  it('shows no-data placeholder when pressureResponse value is null', () => {
    render(<PressureSensitivityCrossValueMap models={[createModel(null)]} />);

    expect(screen.getByTitle('Model A alpha::beta: no data')).toBeDefined();
  });
});
