import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PressureSensitivitySummary } from './PressureSensitivitySummary';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';

function createModel(
  modelId: string,
  label: string,
  mean: number | null,
  ciLow: number | null,
  ciHigh: number | null,
  lowBandMean: number | null,
  highBandMean: number | null,
  pairsMeasured: number,
  pairsPositive: number,
): PressureSensitivityModel {
  return {
    modelId,
    label,
    providerName: 'Provider',
    unscoredCount: 0,
    valuePairs: [],
    winRateDeltaSummary: {
      mean,
      ciLow,
      ciHigh,
      lowBandMean,
      highBandMean,
      pairsMeasured,
      pairsPositive,
    },
  };
}

function renderSummary(models: PressureSensitivityModel[]) {
  render(<PressureSensitivitySummary models={models} selectedModelId={null} onSelectModel={() => undefined} />);
}

function getRowByLabel(label: string): HTMLTableRowElement {
  const row = screen.getByText(label).closest('tr');
  if (row == null) throw new Error(`Missing row for ${label}`);
  return row;
}

describe('PressureSensitivitySummary', () => {
  it('renders the new win-rate columns and sorts ties alphabetically', () => {
    renderSummary([
      createModel('beta', 'Beta', 0.05, 0.01, 0.09, 0.55, 0.61, 2, 1),
      createModel('alpha', 'Alpha', 0.05, 0.01, 0.09, 0.55, 0.61, 2, 1),
    ]);

    expect(screen.getByText('Win Rate')).toBeDefined();
    expect(screen.getByText('Model')).toBeDefined();
    expect(screen.getByText('Low pressure')).toBeDefined();
    expect(screen.getByText('High pressure')).toBeDefined();
    expect(screen.getByText('Win rate Δ ± CI')).toBeDefined();
    expect(screen.queryByText('Aggregate sensitivity')).toBeNull();
    expect(screen.queryByText('Provider')).toBeNull();
    expect(screen.queryByText('Pairs measured')).toBeNull();
    expect(screen.queryByText('Spread')).toBeNull();

    const rows = screen.getAllByRole('row');
    expect(rows[2]?.textContent ?? '').toContain('Alpha');
    expect(rows[3]?.textContent ?? '').toContain('Beta');
  });

  it('shows a red negative delta with a leading glyph', () => {
    renderSummary([
      createModel('alpha', 'Alpha', -0.05, -0.09, -0.01, 0.45, 0.40, 3, 0),
    ]);

    const row = getRowByLabel('Alpha');
    const glyph = within(row).getByText(/▼/);
    expect(glyph.closest('span')?.className ?? '').toContain('text-red-700');
  });

  it('shows the ceiling badge when the low pressure rate is high', () => {
    renderSummary([
      createModel('alpha', 'Alpha', 0.05, 0.01, 0.09, 0.95, 0.62, 2, 1),
    ]);

    expect(screen.getByText('ceiling')).toBeDefined();
  });

  it('hides the ceiling badge when the low pressure rate is null', () => {
    renderSummary([
      createModel('alpha', 'Alpha', 0.05, 0.01, 0.09, null, 0.62, 2, 1),
    ]);

    expect(screen.queryByText('ceiling')).toBeNull();
  });

  it('renders the thin annotation when only one pair is measured', () => {
    renderSummary([
      createModel('alpha', 'Alpha', 0.05, null, null, 0.55, 0.61, 1, 1),
    ]);

    expect(screen.getByText('(thin)')).toBeDefined();
  });

  it('renders the moved-up count when at least two pairs are measured', () => {
    renderSummary([
      createModel('alpha', 'Alpha', 0.05, 0.01, 0.09, 0.55, 0.61, 2, 1),
    ]);

    expect(screen.getByText(/1\/2 moved up/)).toBeDefined();
  });

  it('shows the Win rate Δ tooltip copy', () => {
    renderSummary([
      createModel('alpha', 'Alpha', 0.05, 0.01, 0.09, 0.55, 0.61, 2, 1),
    ]);

    const trigger = screen.getByRole('button', { name: /show win rate Δ ± ci help/i });
    fireEvent.focus(trigger);

    expect(screen.getByRole('tooltip').textContent ?? '').toContain('spread of per-pair Δs');
  });
});
