import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PairwiseAgreementMatrixReport } from './PairwiseAgreementMatrixReport';
import type { ModelAgreementOnTradeoffsQuery } from '../../generated/graphql';

type PairwiseAgreementRow = ModelAgreementOnTradeoffsQuery['modelAgreementOnTradeoffs']['pairwiseAgreementMatrix'][number];

function createRow(overrides: Partial<PairwiseAgreementRow> = {}): PairwiseAgreementRow {
  return {
    __typename: 'PairwiseAgreementRow',
    modelAId: 'alpha',
    modelALabel: 'Alpha',
    modelBId: 'beta',
    modelBLabel: 'Beta',
    totalCells: 12,
    percentAgreement: 0.75,
    cohensKappa: 0.5,
    kappaInterpretation: 'Moderate',
    meanAbsoluteDivergence: 0.125,
    ...overrides,
  };
}

describe('PairwiseAgreementMatrixReport', () => {
  it('renders the heatmap and table columns', () => {
    render(
      <PairwiseAgreementMatrixReport
        rows={[createRow()]}
        selectedPair={null}
        onPairSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /model a/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /model b/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /cells/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /kappa/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /interpretation/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /% agreement/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /mean abs divergence/i })).toBeDefined();
  });

  it('calls onPairSelect when a row is clicked', () => {
    const onPairSelect = vi.fn();
    const { container } = render(
      <PairwiseAgreementMatrixReport
        rows={[
          createRow({ modelAId: 'beta', modelALabel: 'Beta', modelBId: 'gamma', modelBLabel: 'Gamma' }),
          createRow({ modelAId: 'alpha', modelALabel: 'Alpha', modelBId: 'beta', modelBLabel: 'Beta' }),
        ]}
        selectedPair={null}
        onPairSelect={onPairSelect}
      />,
    );

    const companionTable = container.querySelectorAll('table')[1];
    expect(companionTable).toBeDefined();
    if (companionTable == null) {
      throw new Error('Expected the companion table to render');
    }
    const firstBodyRow = companionTable.querySelector('tbody tr');
    expect(firstBodyRow).not.toBeNull();

    if (firstBodyRow != null) {
      fireEvent.click(firstBodyRow);
    }

    expect(onPairSelect).toHaveBeenCalledWith({ modelAId: 'alpha', modelBId: 'beta' });
  });

  it('renders an empty state when there are no rows', () => {
    render(
      <PairwiseAgreementMatrixReport
        rows={[]}
        selectedPair={null}
        onPairSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('No pairwise agreement data available for the current selection.')).toBeDefined();
  });
});
