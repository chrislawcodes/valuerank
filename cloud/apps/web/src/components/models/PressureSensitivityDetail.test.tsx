import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { PressureSensitivityDetail } from './PressureSensitivityDetail';
import type { PressureSensitivityModel, PressureSensitivityValuePair } from '../../api/operations/pressureSensitivity';

function createPair(
  pairKey: string,
  firstValueLabel: string,
  secondValueLabel: string,
  value: number | null,
  baselineRate: number | null,
  pushTowardFirstRate: number | null,
  pushTowardSecondRate: number | null,
  ciLow: number | null,
  ciHigh: number | null,
  reason: string | null,
  qualifyingTrials: number,
): PressureSensitivityValuePair {
  return {
    pairKey,
    firstValueToken: firstValueLabel.toLowerCase(),
    firstValueLabel,
    secondValueToken: secondValueLabel.toLowerCase(),
    secondValueLabel,
    n: qualifyingTrials,
    unscoredCount: 0,
    definitionsMeasured: 1,
    pressureResponse: {
      value,
      baselineRate,
      pushTowardFirstRate,
      pushTowardSecondRate,
      qualifyingTrials,
      ciLow,
      ciHigh,
      reason,
    },
    grid: [],
  };
}

function createModel(valuePairs: PressureSensitivityValuePair[]): PressureSensitivityModel {
  return {
    modelId: 'model-a',
    label: 'Model A',
    providerName: 'Provider',
    unscoredCount: 0,
    pushedEffectPairsUsed: 0,
    domainPressureEffects: [],
    pressureResponseSummary: { mean: 0.1, rangeMin: 0.05, rangeMax: 0.15, pairsMeasured: 2 },
    valueRates: [],
    valuePairs,
  };
}

function renderDetail(model: PressureSensitivityModel) {
  render(<PressureSensitivityDetail model={model} />);
}

function getRow(label: string): HTMLTableRowElement {
  const row = screen.getByText(label).closest('tr');
  if (row == null) throw new Error(`Missing row for ${label}`);
  return row;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PressureSensitivityDetail', () => {
  it('renders the six-column layout and sorts ties alphabetically', () => {
    renderDetail(
      createModel([
        createPair('beta::gamma', 'Beta', 'Gamma', -0.12, 0.48, 0.36, 0.60, -0.16, -0.08, null, 14),
        createPair('alpha::delta', 'Alpha', 'Delta', 0.12, 0.48, 0.60, 0.36, 0.08, 0.16, null, 17),
      ]),
    );

    expect(screen.getByText('Pressure Response by Value Pair')).toBeDefined();
    expect(screen.getByText('Value Pair')).toBeDefined();
    expect(screen.getByText('Balanced')).toBeDefined();
    expect(screen.getByText('Push toward first')).toBeDefined();
    expect(screen.getByText('Push toward other')).toBeDefined();
    expect(screen.getByText('Pressure response')).toBeDefined();
    expect(screen.getByText('Trials')).toBeDefined();
    expect(screen.queryByText('Win Rate')).toBeNull();
    expect(screen.queryByText('Low pressure')).toBeNull();
    expect(screen.queryByText('High pressure')).toBeNull();

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('Alpha ↔ Delta');
    expect(rows[2]?.textContent ?? '').toContain('Beta ↔ Gamma');
  });

  it('shows the thin-pool reason on the dash pressure-response cell', () => {
    vi.useFakeTimers();
    // directional-thin: pushTowardFirstRate null, pushTowardSecondRate/balancedRate available
    renderDetail(
      createModel([
        createPair('alpha::delta', 'Alpha', 'Delta', null, 0.5, null, 0.6, null, null, 'directional-thin', 17),
      ]),
    );

    const row = getRow('Alpha ↔ Delta');
    // Pressure response is column index 4 (Value Pair=0, Balanced=1, Push1=2, Push2=3, Response=4, Trials=5)
    const cells = within(row).getAllByRole('cell');
    const responseCell = cells[4];
    if (!responseCell) throw new Error('Expected pressure response cell at index 4');
    const dashSpan = within(responseCell).getByText('—');
    fireEvent.mouseEnter(dashSpan);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('tooltip').textContent ?? '').toContain('push-toward-first pool has fewer than 3 vignette observations');
  });

  it('shows — in rate cells when rates are null', () => {
    renderDetail(
      createModel([
        createPair('alpha::delta', 'Alpha', 'Delta', null, null, null, null, null, null, 'directional-thin', 17),
      ]),
    );

    const row = getRow('Alpha ↔ Delta');
    const dashes = within(row).getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('shows qualifyingTrials in the Trials column', () => {
    renderDetail(
      createModel([
        createPair('alpha::delta', 'Alpha', 'Delta', 0.12, 0.48, 0.60, 0.36, 0.08, 0.16, null, 17),
      ]),
    );

    const row = getRow('Alpha ↔ Delta');
    expect(within(row).getByText('17')).toBeDefined();
  });

  it('shows the Pressure response tooltip copy on the header', () => {
    renderDetail(
      createModel([
        createPair('alpha::delta', 'Alpha', 'Delta', 0.12, 0.48, 0.60, 0.36, 0.08, 0.16, null, 17),
      ]),
    );

    const trigger = screen.getByRole('button', { name: /show pressure response help/i });
    fireEvent.focus(trigger);

    expect(screen.getByRole('tooltip').textContent ?? '').toContain('Newcombe');
  });

  it('renders the snapshot button with the new label', () => {
    renderDetail(
      createModel([
        createPair('alpha::delta', 'Alpha', 'Delta', 0.12, 0.48, 0.60, 0.36, 0.08, 0.16, null, 17),
      ]),
    );

    expect(
      screen.getByRole('button', { name: /copy pressure response by value pair as image/i }),
    ).toBeDefined();
  });
});
