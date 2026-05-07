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
    agreementRate: 0.7,
    discordantAtoB: 2,
    discordantBtoA: 1,
    oddsRatio: 0.5,
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
          createRow({ modelAId: 'a', modelALabel: 'Model A', modelBId: 'c', modelBLabel: 'Model C', rawPValue: 0.01, holmCorrectedPValue: 0.03, oddsRatio: 2, effectLabel: 'Strong', verdict: 'Significant' }),
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

  it('shows the agreement rate column with percent format', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[createRow({ agreementRate: 0.73 })]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /agreement rate/i })).toBeDefined();
    expect(screen.getByText('73%')).toBeDefined();
  });

  it('shows the discordant A→B and B→A columns as integers', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[createRow({ discordantAtoB: 4, discordantBtoA: 7 })]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /discordant A→B/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /discordant B→A/i })).toBeDefined();
    expect(screen.getByText('4')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();
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

  it('shows the odds ratio column header', () => {
    render(
      <ModelGroupingSignificanceTable
        rows={[createRow({ oddsRatio: 1.25 })]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /odds ratio/i })).toBeDefined();
    expect(screen.queryByRole('columnheader', { name: /effect size/i })).toBeNull();
  });
});
