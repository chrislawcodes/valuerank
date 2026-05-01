import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PressureDirectionalBreakdown } from './PressureDirectionalBreakdown';
import { formatSignedPoints } from './pressureSensitivityFormatting';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';

type TestPair = {
  pressureResponse: {
    baselineRate: number | null;
    pushTowardFirstRate: number | null;
    pushTowardSecondRate: number | null;
  } | null;
};

function createModel(
  modelId: string,
  label: string,
  valuePairs: TestPair[],
): PressureSensitivityModel {
  return {
    modelId,
    label,
    valuePairs,
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
    renderBreakdown([
      createModel('alpha', 'Alpha', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.7, pushTowardSecondRate: 0.4 } },
      ]),
    ]);

    expect(screen.getByText('Does pressure work both ways?')).toBeDefined();
    expect(screen.getByText('Pushed for')).toBeDefined();
    expect(screen.getByText('Pushed against')).toBeDefined();
    expect(screen.getByText('Gap')).toBeDefined();
  });

  it('computes pushed-for, pushed-against, and gap values', () => {
    const expectedPushedFor = formatSignedPoints(0.2);
    const expectedPushedAgainst = formatSignedPoints(0.1);
    const expectedGap = formatSignedPoints(0.1);

    renderBreakdown([
      createModel('alpha', 'Alpha', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.7, pushTowardSecondRate: 0.4 } },
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.7, pushTowardSecondRate: 0.4 } },
      ]),
    ]);

    const row = getRowByLabel('Alpha');
    const cells = getCells(row);
    expect(cells[1]?.textContent ?? '').toBe(expectedPushedFor);
    expect(cells[2]?.textContent ?? '').toBe(expectedPushedAgainst);
    expect(cells[3]?.textContent ?? '').toBe(expectedGap);
  });

  it('sorts by absolute gap descending', () => {
    renderBreakdown([
      createModel('model-b', 'ModelB', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.55, pushTowardSecondRate: 0.5 } },
      ]),
      createModel('model-a', 'ModelA', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.7, pushTowardSecondRate: 0.5 } },
      ]),
    ]);

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('ModelA');
    expect(rows[2]?.textContent ?? '').toContain('ModelB');
  });

  it('breaks ties alphabetically', () => {
    renderBreakdown([
      createModel('bravo', 'Bravo', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.7, pushTowardSecondRate: 0.5 } },
      ]),
      createModel('alpha', 'Alpha', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.3, pushTowardSecondRate: 0.5 } },
      ]),
    ]);

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('Alpha');
    expect(rows[2]?.textContent ?? '').toContain('Bravo');
  });

  it('excludes models with zero valid pairs', () => {
    renderBreakdown([
      createModel('invalid', 'Invalid', [{ pressureResponse: null }]),
      createModel('valid', 'Valid', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.7, pushTowardSecondRate: 0.4 } },
      ]),
    ]);

    expect(screen.queryByText('Invalid')).toBeNull();
    expect(screen.getByText('Valid')).toBeDefined();
  });

  it('returns null when all models have zero valid pairs', () => {
    renderBreakdown([
      createModel('invalid-a', 'Invalid A', [{ pressureResponse: null }]),
      createModel('invalid-b', 'Invalid B', [{ pressureResponse: null }]),
    ]);

    expect(screen.queryByText('Does pressure work both ways?')).toBeNull();
  });

  it('returns null for an empty models array', () => {
    renderBreakdown([]);

    expect(screen.queryByText('Does pressure work both ways?')).toBeNull();
  });

  it('uses red text for a negative pushed-for effect', () => {
    renderBreakdown([
      createModel('alpha', 'Alpha', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.4, pushTowardSecondRate: 0.4 } },
      ]),
    ]);

    const row = getRowByLabel('Alpha');
    const cell = within(row).getByText(formatSignedPoints(-0.1)).closest('td');
    expect(cell?.className ?? '').toContain('text-red-700');
  });

  it('uses gray text for a positive pushed-for effect', () => {
    renderBreakdown([
      createModel('alpha', 'Alpha', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.6, pushTowardSecondRate: 0.4 } },
      ]),
    ]);

    const row = getRowByLabel('Alpha');
    const cell = getCells(row)[1];
    expect(cell?.className ?? '').toContain('text-gray-900');
    expect(cell?.className ?? '').not.toContain('text-red-700');
  });

  it('uses red text for a negative gap', () => {
    renderBreakdown([
      createModel('alpha', 'Alpha', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.4, pushTowardSecondRate: 0.3 } },
      ]),
    ]);

    const row = getRowByLabel('Alpha');
    const cell = getCells(row)[3];
    expect(cell?.className ?? '').toContain('text-red-700');
  });

  it('sorts by absolute value', () => {
    renderBreakdown([
      createModel('model-b', 'ModelB', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.6, pushTowardSecondRate: 0.5 } },
      ]),
      createModel('model-a', 'ModelA', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.3, pushTowardSecondRate: 0.5 } },
      ]),
    ]);

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('ModelA');
    expect(rows[2]?.textContent ?? '').toContain('ModelB');
  });

  it('shows all four tooltip texts', () => {
    renderBreakdown([
      createModel('alpha', 'Alpha', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.7, pushTowardSecondRate: 0.4 } },
      ]),
    ]);

    const pushedForTrigger = screen.getByRole('button', { name: /show pushed for help/i });
    fireEvent.focus(pushedForTrigger);
    expect(screen.getByRole('tooltip').textContent ?? '').toContain('Average win-rate lift above baseline');
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
    expect(screen.getByRole('tooltip').textContent ?? '').toContain('sufficient data to compute both directional effects');
  });

  it('excludes non-finite pairs', () => {
    renderBreakdown([
      createModel('alpha', 'Alpha', [
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: 0.7, pushTowardSecondRate: 0.4 } },
        { pressureResponse: { baselineRate: 0.5, pushTowardFirstRate: Number.NaN, pushTowardSecondRate: 0.4 } },
      ]),
    ]);

    const row = getRowByLabel('Alpha');
    const cells = getCells(row);
    expect(cells[4]?.textContent ?? '').toBe('1');
    expect(cells[1]?.textContent ?? '').toBe(formatSignedPoints(0.2));
    expect(cells[2]?.textContent ?? '').toBe(formatSignedPoints(0.1));
  });
});
