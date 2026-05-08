import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ModelGroupingSignificanceTable } from './ModelGroupingSignificanceTable';
import type { ModelGroupingSignificanceRow } from '../../api/operations/modelGroupingSignificance';

function createRow(overrides: Partial<ModelGroupingSignificanceRow> = {}): ModelGroupingSignificanceRow {
  return {
    __typename: 'ModelGroupingSignificanceRow',
    modelAId: 'model-a',
    modelALabel: 'Model A',
    modelBId: 'model-b',
    modelBLabel: 'Model B',
    n: 10,
    winRateA: 0.7,
    winRateB: 0.6,
    meanDifference: 0.1,
    effectSize: 0.5,
    maxOrderEffect: 0.2,
    rawPValue: 0.5,
    holmCorrectedPValue: 0.5,
    effectLabel: 'Weak',
    confidenceIntervalLow: null,
    confidenceIntervalHigh: null,
    verdict: 'Not significant',
    ...overrides,
  };
}

describe('ModelGroupingSignificanceTable', () => {
  it('sorts by model pair by default', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[
          createRow({ modelAId: 'b', modelALabel: 'Model B', modelBId: 'c', modelBLabel: 'Model C', rawPValue: 0.5, holmCorrectedPValue: 0.5 }),
          createRow({ modelAId: 'a', modelALabel: 'Model A', modelBId: 'c', modelBLabel: 'Model C', rawPValue: 0.01, holmCorrectedPValue: 0.03, effectSize: 2, effectLabel: 'Strong', verdict: 'Significant' }),
          createRow({ modelAId: 'a', modelALabel: 'Model A', modelBId: 'b', modelBLabel: 'Model B', rawPValue: 0.2, holmCorrectedPValue: 0.4 }),
        ]}
      />,
    );

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('Model A');
    expect(rows[1]?.textContent ?? '').toContain('Model B');
  });

  it('can sort by p-value and reverse on second click', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[
          createRow({ modelAId: 'b', modelALabel: 'Model B', modelBId: 'c', modelBLabel: 'Model C', rawPValue: 0.5, holmCorrectedPValue: 0.5 }),
          createRow({ modelAId: 'a', modelALabel: 'Model A', modelBId: 'c', modelBLabel: 'Model C', rawPValue: 0.01, holmCorrectedPValue: 0.03 }),
          createRow({ modelAId: 'a', modelALabel: 'Model A', modelBId: 'b', modelBLabel: 'Model B', rawPValue: 0.2, holmCorrectedPValue: 0.4 }),
        ]}
      />,
    );

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

  it('shows the win rate columns with percent format', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[createRow({ winRateA: 0.73, winRateB: 0.54 })]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /win rate a/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /win rate b/i })).toBeDefined();
    expect(screen.getByText('+73.0%')).toBeDefined();
    expect(screen.getByText('+54.0%')).toBeDefined();
  });

  it('shows the mean diff, effect size, and max order effect columns', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[createRow({ meanDifference: -0.125, effectSize: 0.456, maxOrderEffect: -0.05 })]}

      />,
    );

    expect(screen.getByRole('columnheader', { name: /mean diff/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /effect size/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /max order effect/i })).toBeDefined();
    expect(screen.getByText('-12.5%')).toBeDefined();
    expect(screen.getByText('+0.456')).toBeDefined();
    expect(screen.getByText('-5.0%')).toBeDefined();
  });

  it('shows verdict badges', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[
          createRow({ modelAId: 'a', modelALabel: 'Model A', modelBId: 'b', modelBLabel: 'Model B', verdict: 'Significant', effectLabel: 'Strong' }),
          createRow({ modelAId: 'b', modelALabel: 'Model B', modelBId: 'c', modelBLabel: 'Model C', verdict: 'Weak', effectLabel: 'Weak' }),
          createRow({ modelAId: 'c', modelALabel: 'Model C', modelBId: 'd', modelBLabel: 'Model D', verdict: 'Not significant', effectLabel: 'Weak' }),
        ]}
      />,
    );

    expect(screen.getByText('Significant')).toBeDefined();
    expect(screen.getByText('Strong')).toBeDefined();
    expect(screen.getAllByText('Weak').length).toBeGreaterThan(0);
    expect(screen.getByText('Not significant')).toBeDefined();
  });

  it('does not use the double-headed sort icon', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[createRow({ modelAId: 'a', modelALabel: 'Model A', modelBId: 'b', modelBLabel: 'Model B' })]}
      />,
    );

    expect(screen.queryByText('↕')).toBeNull();
  });

  it('shows the confidence interval column header', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[createRow({ confidenceIntervalLow: -0.1, confidenceIntervalHigh: 0.2 })]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /confidence interval/i })).toBeDefined();
    expect(screen.getByText('[-10.0%, +20.0%]')).toBeDefined();
  });
});
