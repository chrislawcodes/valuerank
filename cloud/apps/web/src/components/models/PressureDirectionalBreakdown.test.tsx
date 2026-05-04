import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PressureDirectionalBreakdown } from './PressureDirectionalBreakdown';
import { formatSignedPoints } from './pressureSensitivityFormatting';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';

function createModel(
  modelId: string,
  label: string,
  pushedForEffect: number | null,
  pushedAgainstEffect: number | null,
  pushedEffectPairsUsed = 1,
): PressureSensitivityModel {
  return {
    modelId,
    label,
    providerName: 'Provider',
    unscoredCount: 0,
    pushedForEffect,
    pushedAgainstEffect,
    pushedEffectPairsUsed,
    pressureResponseSummary: { mean: 0.1, rangeMin: 0.05, rangeMax: 0.15, pairsMeasured: 1 },
    valueRates: [],
    valuePairs: [],
  } as unknown as PressureSensitivityModel;
}

function renderBreakdown(models: PressureSensitivityModel[]) {
  render(<PressureDirectionalBreakdown models={models} />);
}

function getRowByLabel(label: string): HTMLTableRowElement {
  const row = screen.getByText(label).closest('tr');
  if (row == null) throw new Error(`Missing row for ${label}`);
  return row;
}

function getCells(row: HTMLTableRowElement) {
  return within(row).getAllByRole('cell');
}

describe('PressureDirectionalBreakdown', () => {
  it('renders heading and column headers', () => {
    renderBreakdown([createModel('alpha', 'Alpha', 0.2, 0.1)]);

    expect(screen.getByText('Does pressure work both ways?')).toBeDefined();
    expect(screen.getByText('Pushed for')).toBeDefined();
    expect(screen.getByText('Pushed against')).toBeDefined();
    expect(screen.getByText('Gap')).toBeDefined();
  });

  it('displays backend-provided pushed-for, pushed-against, and gap values', () => {
    renderBreakdown([createModel('alpha', 'Alpha', 0.2, 0.1)]);

    const row = getRowByLabel('Alpha');
    const cells = getCells(row);
    expect(cells[1]?.textContent ?? '').toBe(formatSignedPoints(0.2));
    expect(cells[2]?.textContent ?? '').toBe(formatSignedPoints(0.1));
    expect(cells[3]?.textContent ?? '').toBe(formatSignedPoints(0.1));
  });

  it('displays pairs count from backend', () => {
    renderBreakdown([createModel('alpha', 'Alpha', 0.2, 0.1, 5)]);

    const row = getRowByLabel('Alpha');
    const cells = getCells(row);
    expect(cells[4]?.textContent ?? '').toBe('5');
  });

  it('sorts by absolute gap descending', () => {
    renderBreakdown([
      createModel('model-b', 'ModelB', 0.55, 0.5),  // gap = 0.05
      createModel('model-a', 'ModelA', 0.7, 0.5),   // gap = 0.20
    ]);

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('ModelA');
    expect(rows[2]?.textContent ?? '').toContain('ModelB');
  });

  it('breaks ties alphabetically', () => {
    renderBreakdown([
      createModel('bravo', 'Bravo', 0.7, 0.5),  // gap = 0.2
      createModel('alpha', 'Alpha', 0.3, 0.5),  // gap = -0.2, same |gap|
    ]);

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('Alpha');
    expect(rows[2]?.textContent ?? '').toContain('Bravo');
  });

  it('excludes models where pushed effects are null', () => {
    renderBreakdown([
      createModel('invalid', 'Invalid', null, null),
      createModel('valid', 'Valid', 0.7, 0.4),
    ]);

    expect(screen.queryByText('Invalid')).toBeNull();
    expect(screen.getByText('Valid')).toBeDefined();
  });

  it('returns null when all models have null effects', () => {
    renderBreakdown([
      createModel('invalid-a', 'Invalid A', null, null),
      createModel('invalid-b', 'Invalid B', null, null),
    ]);

    expect(screen.queryByText('Does pressure work both ways?')).toBeNull();
  });

  it('returns null for an empty models array', () => {
    renderBreakdown([]);

    expect(screen.queryByText('Does pressure work both ways?')).toBeNull();
  });

  it('uses red text for a negative pushed-for effect', () => {
    renderBreakdown([createModel('alpha', 'Alpha', -0.1, 0.1)]);

    const row = getRowByLabel('Alpha');
    const cell = within(row).getByText(formatSignedPoints(-0.1)).closest('td');
    expect(cell?.className ?? '').toContain('text-red-700');
  });

  it('uses gray text for a positive pushed-for effect', () => {
    renderBreakdown([createModel('alpha', 'Alpha', 0.1, 0.05)]);

    const row = getRowByLabel('Alpha');
    const cell = getCells(row)[1];
    expect(cell?.className ?? '').toContain('text-gray-900');
    expect(cell?.className ?? '').not.toContain('text-red-700');
  });

  it('uses red text for a negative gap', () => {
    renderBreakdown([createModel('alpha', 'Alpha', 0.3, 0.5)]);  // gap = -0.2

    const row = getRowByLabel('Alpha');
    const cell = getCells(row)[3];
    expect(cell?.className ?? '').toContain('text-red-700');
  });

  it('sorts by absolute gap — negative gap same magnitude as positive', () => {
    renderBreakdown([
      createModel('model-b', 'ModelB', 0.6, 0.5),  // gap = 0.1
      createModel('model-a', 'ModelA', 0.3, 0.5),  // gap = -0.2
    ]);

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('ModelA');
    expect(rows[2]?.textContent ?? '').toContain('ModelB');
  });

  it('shows all four tooltip texts', () => {
    renderBreakdown([createModel('alpha', 'Alpha', 0.2, 0.1)]);

    const pushedForTrigger = screen.getByRole('button', { name: /show pushed for help/i });
    fireEvent.focus(pushedForTrigger);
    expect(screen.getByRole('tooltip').textContent ?? '').toContain('Win-rate lift above balanced baseline');
    fireEvent.blur(pushedForTrigger);

    const pushedAgainstTrigger = screen.getByRole('button', { name: /show pushed against help/i });
    fireEvent.focus(pushedAgainstTrigger);
    expect(screen.getByRole('tooltip').textContent ?? '').toContain('moves away from a value');
    fireEvent.blur(pushedAgainstTrigger);

    const gapTrigger = screen.getByRole('button', { name: /show gap help/i });
    fireEvent.focus(gapTrigger);
    expect(screen.getByRole('tooltip').textContent ?? '').toContain('Pushed-for effect minus pushed-against effect');
    fireEvent.blur(gapTrigger);

    const pairsTrigger = screen.getByRole('button', { name: /show pairs help/i });
    fireEvent.focus(pairsTrigger);
    expect(screen.getByRole('tooltip').textContent ?? '').toContain('sufficient data to compute the pushed-for effect');
  });
});
