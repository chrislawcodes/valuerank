import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PairwiseWinRateMatrix, type PairwiseMatrixModel } from './PairwiseWinRateMatrix';

function buildModel(): PairwiseMatrixModel {
  const valueOrder = [
    'Universalism_Nature',
    'Benevolence_Dependability',
    'Tradition',
    'Conformity_Interpersonal',
    'Security_Personal',
    'Power_Dominance',
    'Achievement',
    'Hedonism',
    'Stimulation',
    'Self_Direction_Action',
  ];

  const winRateMatrix = valueOrder.map((_rowKey, rowIndex) =>
    valueOrder.map((_colKey, colIndex) => (rowIndex === colIndex ? null : 0.5))
  );

  const trialCountMatrix = valueOrder.map((_rowKey, rowIndex) =>
    valueOrder.map((_colKey, colIndex) => (rowIndex === colIndex ? 0 : 12))
  );

  return {
    model: 'model-a',
    label: 'Model A',
    pairwiseWinRateModel: {
      valueOrder,
      winRateMatrix,
      trialCountMatrix,
    },
  };
}

describe('PairwiseWinRateMatrix', () => {
  it('renders win rates with one decimal place', () => {
    render(
      <PairwiseWinRateMatrix
        models={[buildModel()]}
        selectedModelId={null}
        domainId={null}
        signature={null}
        onCellClick={vi.fn()}
      />,
    );

    const table = screen.getByRole('table');
    expect(within(table).getAllByText('50.0%').length).toBeGreaterThan(0);
    expect(within(table).queryByText('50%')).toBeNull();
  });
});
