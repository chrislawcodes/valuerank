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
    kappaByDomain: [],
    kappaSpread: null,
    domainCount: 1,
    ...overrides,
  };
}

describe('PairwiseAgreementMatrixReport', () => {
  it('renders table columns', () => {
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
    expect(screen.getByRole('columnheader', { name: /per-domain spread/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /domains/i })).toBeDefined();
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

    const companionTable = container.querySelectorAll('table')[0];
    expect(companionTable).toBeDefined();
    if (companionTable == null) {
      throw new Error('Expected the table to render');
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

  it('shows em-dash in spread column when domainCount is 1', () => {
    render(
      <PairwiseAgreementMatrixReport
        rows={[createRow({ domainCount: 1, kappaSpread: null })]}
        selectedPair={null}
        onPairSelect={vi.fn()}
      />,
    );

    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders spread value when domainCount >= 2', () => {
    render(
      <PairwiseAgreementMatrixReport
        rows={[createRow({ domainCount: 4, kappaSpread: 0.16 })]}
        selectedPair={null}
        onPairSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('0.16')).toBeDefined();
  });

  it('shows wide-spread warning when spread exceeds threshold', () => {
    render(
      <PairwiseAgreementMatrixReport
        rows={[createRow({ domainCount: 4, kappaSpread: 0.45 })]}
        selectedPair={null}
        onPairSelect={vi.fn()}
      />,
    );

    const warnings = screen.getAllByTitle('Wide spread — kappa varies significantly by domain');
    expect(warnings.length).toBeGreaterThan(0);
  });
});
