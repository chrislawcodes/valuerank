import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ModelGroupingSignificanceTable } from './ModelGroupingSignificanceTable';
import type { ModelGroupingSignificanceRow } from '../../api/operations/modelGroupingSignificance';

function createRow(overrides: Partial<ModelGroupingSignificanceRow>): ModelGroupingSignificanceRow {
  return {
    __typename: 'ModelGroupingSignificanceRow',
    modelAId: 'model-a',
    modelALabel: 'Model A',
    modelBId: 'model-b',
    modelBLabel: 'Model B',
    n: 10,
    meanDifference: 0,
    rawPValue: 0.5,
    holmCorrectedPValue: 0.5,
    effectSize: 0,
    effectLabel: 'Weak',
    confidenceIntervalLow: -1,
    confidenceIntervalHigh: 1,
    verdict: 'Not significant',
    ...overrides,
  };
}

describe('ModelGroupingSignificanceTable', () => {
  it('sorts by model pair by default and can sort by p-value', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[
          createRow({ modelAId: 'b', modelALabel: 'Model B', modelBId: 'c', modelBLabel: 'Model C', rawPValue: 0.5, holmCorrectedPValue: 0.5 }),
          createRow({ modelAId: 'a', modelALabel: 'Model A', modelBId: 'c', modelBLabel: 'Model C', rawPValue: 0.01, holmCorrectedPValue: 0.03, effectSize: 0.9, effectLabel: 'Strong', verdict: 'Significant' }),
          createRow({ modelAId: 'a', modelALabel: 'Model A', modelBId: 'b', modelBLabel: 'Model B', rawPValue: 0.2, holmCorrectedPValue: 0.4, effectSize: 0.2, effectLabel: 'Weak', verdict: 'Not significant' }),
        ]}
      />,
    );

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('Model A');
    expect(rows[1]?.textContent ?? '').toContain('Model B');

    fireEvent.click(screen.getByRole('button', { name: /sort by raw p-value/i }));

    const resortedRows = screen.getAllByRole('row');
    expect(resortedRows[1]?.textContent ?? '').toContain('Model B');
    expect(resortedRows[1]?.textContent ?? '').toContain('Model C');
    expect(resortedRows[1]?.textContent ?? '').toContain('0.500');

    fireEvent.click(screen.getByRole('button', { name: /sort by raw p-value ascending/i }));

    const ascendingRows = screen.getAllByRole('row');
    expect(ascendingRows[1]?.textContent ?? '').toContain('Model A');
    expect(ascendingRows[1]?.textContent ?? '').toContain('Model C');
    expect(ascendingRows[1]?.textContent ?? '').toContain('0.010');

    const rawPValueHeader = screen.getByRole('columnheader', { name: /raw p-value/i });
    expect(rawPValueHeader.getAttribute('aria-sort')).toBe('ascending');
  });

  it('shows verdict badges in the table', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[
          createRow({ modelAId: 'a', modelALabel: 'Model A', modelBId: 'b', modelBLabel: 'Model B', verdict: 'Significant', effectLabel: 'Strong' }),
        ]}
      />,
    );

    expect(screen.getByText('Significant')).toBeDefined();
    expect(screen.getByText('Strong')).toBeDefined();
  });

  it('does not use the double-headed sort icon', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[createRow({ modelAId: 'a', modelALabel: 'Model A', modelBId: 'b', modelBLabel: 'Model B' })]}
      />,
    );

    expect(screen.queryByText('↕')).toBeNull();
  });
});
