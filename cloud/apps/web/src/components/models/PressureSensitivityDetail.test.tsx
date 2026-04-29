import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { PressureSensitivityDetail } from './PressureSensitivityDetail';
import type { PressureSensitivityModel, PressureSensitivityValuePair } from '../../api/operations/pressureSensitivity';

function createPair(
  pairKey: string,
  ownToken: string,
  opponentToken: string,
  value: number | null,
  lowBandMean: number | null,
  highBandMean: number | null,
  ciLow: number | null,
  ciHigh: number | null,
  reason: string | null,
  qualifyingTrials: number,
): PressureSensitivityValuePair {
  return {
    pairKey,
    ownToken,
    opponentToken,
    n: qualifyingTrials,
    unscoredCount: 0,
    definitionsMeasured: 1,
    definitionsExcluded: 0,
    qualifyingTrials,
    winRateDelta: {
      value,
      lowBandMean,
      highBandMean,
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
    winRateDeltaSummary: {
      mean: 0.1,
      ciLow: 0.05,
      ciHigh: 0.15,
      lowBandMean: 0.52,
      highBandMean: 0.62,
      pairsMeasured: 2,
      pairsPositive: 1,
    },
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
  it('renders the new five-column layout and sorts ties alphabetically', () => {
    renderDetail(
      createModel([
        createPair('beta::gamma', 'Beta', 'Gamma', -0.12, 0.48, 0.60, -0.16, -0.08, null, 14),
        createPair('alpha::delta', 'Alpha', 'Delta', 0.12, 0.48, 0.60, 0.08, 0.16, null, 17),
      ]),
    );

    expect(screen.getByText('Value Pair')).toBeDefined();
    expect(screen.getByText('Win Rate')).toBeDefined();
    expect(screen.getByText('Trials')).toBeDefined();
    expect(screen.queryByText('Defs')).toBeNull();
    expect(screen.queryByText('Baseline')).toBeNull();
    expect(screen.queryByText('Conviction Δ')).toBeNull();
    expect(screen.queryByText('netScore Δ')).toBeNull();

    const rows = screen.getAllByRole('row');
    expect(rows[2]?.textContent ?? '').toContain('Alpha ↔ Delta');
    expect(rows[3]?.textContent ?? '').toContain('Beta ↔ Gamma');
  });

  it('shows the thin-band reason on the dash delta cell', () => {
    vi.useFakeTimers();
    renderDetail(
      createModel([
        createPair('alpha::delta', 'Alpha', 'Delta', null, null, 0.60, null, null, 'low-band-thin', 17),
      ]),
    );

    const row = getRow('Alpha ↔ Delta');
    const deltaCell = within(row).getAllByText('—')[0];
    fireEvent.mouseEnter(deltaCell);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('tooltip').textContent ?? '').toContain('Low pressure band has no cells with N ≥ 3 trials.');
  });

  it('shows no badge when the low pressure cell is thin', () => {
    renderDetail(
      createModel([
        createPair('alpha::delta', 'Alpha', 'Delta', null, null, 0.60, null, null, 'low-band-thin', 17),
      ]),
    );

    const row = getRow('Alpha ↔ Delta');
    expect(within(row).queryByText('ceiling')).toBeNull();
    expect(within(row).queryByText('floor')).toBeNull();
  });

  it('shows qualifyingTrials in the Trials column', () => {
    renderDetail(
      createModel([
        createPair('alpha::delta', 'Alpha', 'Delta', 0.12, 0.48, 0.60, 0.08, 0.16, null, 17),
      ]),
    );

    const row = getRow('Alpha ↔ Delta');
    expect(within(row).getByText('17')).toBeDefined();
  });

  it('shows the Win rate Δ tooltip copy on the header', () => {
    renderDetail(
      createModel([
        createPair('alpha::delta', 'Alpha', 'Delta', 0.12, 0.48, 0.60, 0.08, 0.16, null, 17),
      ]),
    );

    const trigger = screen.getByRole('button', { name: /show win rate Δ ± ci help/i });
    fireEvent.focus(trigger);

    expect(screen.getByRole('tooltip').textContent ?? '').toContain('spread of per-pair Δs');
  });
});
