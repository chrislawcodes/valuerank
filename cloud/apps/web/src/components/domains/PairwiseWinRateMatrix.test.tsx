import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PairwiseWinRateMatrix, type PairwiseMatrixModel } from './PairwiseWinRateMatrix';

function buildModel(overrides?: Partial<NonNullable<PairwiseMatrixModel['pairwiseWinRateModel']>>): PairwiseMatrixModel {
  const valueOrder = ['Self_Direction_Action', 'Universalism_Nature'];
  const winRateMatrix = [
    [null, 0.3],
    [0.7, null],
  ];
  const trialCountMatrix = [
    [0, 10],
    [10, 0],
  ];

  return {
    model: 'model-a',
    label: 'Model A',
    pairwiseWinRateModel: {
      valueOrder,
      winRateMatrix,
      trialCountMatrix,
      ...overrides,
    },
  };
}

describe('PairwiseWinRateMatrix', () => {
  it('uses the exc-neutral matrix when exc-neutral mode is enabled', () => {
    render(
      <PairwiseWinRateMatrix
        models={[
          buildModel({
            winRateExcNeutralMatrix: [
              [null, 0.6],
              [0.4, null],
            ],
          }),
        ]}
        selectedModelId={null}
        domainId={null}
        signature={null}
        onCellClick={vi.fn()}
        winRateMode="exc-neutral"
      />,
    );

    expect(screen.getByText('60.0%')).toBeTruthy();
    expect(screen.getByText('40.0%')).toBeTruthy();
  });

  it('falls back to the standard matrix when exc-neutral data is missing', () => {
    render(
      <PairwiseWinRateMatrix
        models={[buildModel()]}
        selectedModelId={null}
        domainId={null}
        signature={null}
        onCellClick={vi.fn()}
        winRateMode="exc-neutral"
      />,
    );

    expect(screen.getByText('30.0%')).toBeTruthy();
    expect(screen.getByText('70.0%')).toBeTruthy();
  });
});
