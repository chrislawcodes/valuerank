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
    cohensKappaConfidenceLow: 0.32,
    cohensKappaConfidenceHigh: 0.68,
    cohensKappaConfidenceIsSymmetric: true,
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
    expect(screen.getByRole('columnheader', { name: /95% ci/i })).toBeDefined();
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

  it('renders the 95% CI column with bracketed values', () => {
    render(
      <PairwiseAgreementMatrixReport
        rows={[createRow({ cohensKappaConfidenceLow: 0.32, cohensKappaConfidenceHigh: 0.68, cohensKappaConfidenceIsSymmetric: true })]}
        selectedPair={null}
        onPairSelect={vi.fn()}
      />,
    );

    // Should render [+0.32, +0.68].
    expect(screen.getByText(/\+0\.32.*\+0\.68/)).toBeDefined();
  });

  it('shows em-dash in CI column when CI is null', () => {
    render(
      <PairwiseAgreementMatrixReport
        rows={[createRow({ cohensKappaConfidenceLow: null, cohensKappaConfidenceHigh: null, cohensKappaConfidenceIsSymmetric: true })]}
        selectedPair={null}
        onPairSelect={vi.fn()}
      />,
    );

    // The em-dash (—) should appear for the null CI.
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows wide-CI warning when CI width exceeds threshold', () => {
    // CI width = 0.90 - 0.10 = 0.80 > 0.30 → wide.
    render(
      <PairwiseAgreementMatrixReport
        rows={[createRow({ cohensKappaConfidenceLow: 0.10, cohensKappaConfidenceHigh: 0.90, cohensKappaConfidenceIsSymmetric: false })]}
        selectedPair={null}
        onPairSelect={vi.fn()}
      />,
    );

    // ⚠ indicator should appear.
    const warnings = screen.getAllByTitle('Wide CI — insufficient data to constrain estimate');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('shows wide-CI warning when CI crosses zero (low < 0)', () => {
    render(
      <PairwiseAgreementMatrixReport
        rows={[createRow({ cohensKappaConfidenceLow: -0.05, cohensKappaConfidenceHigh: 0.20, cohensKappaConfidenceIsSymmetric: false })]}
        selectedPair={null}
        onPairSelect={vi.fn()}
      />,
    );

    const warnings = screen.getAllByTitle('Wide CI — insufficient data to constrain estimate');
    expect(warnings.length).toBeGreaterThan(0);
  });
});
