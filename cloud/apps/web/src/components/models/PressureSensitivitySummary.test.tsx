import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PressureSensitivitySummary } from './PressureSensitivitySummary';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';

function createModel(
  modelId: string,
  label: string,
  mean: number | null,
  rangeMin: number | null,
  rangeMax: number | null,
  pairsMeasured: number,
): PressureSensitivityModel {
  return {
    modelId,
    label,
    providerName: 'Provider',
    unscoredCount: 0,
    pushedEffectPairsUsed: 0,
    valueRates: [],
    valuePairs: [],
    pressureResponseSummary: { mean, rangeMin, rangeMax, pairsMeasured },
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
  it('renders the pressure response column and sorts ties alphabetically', () => {
    renderSummary([
      createModel('beta', 'Beta', 0.05, 0.01, 0.09, 2),
      createModel('alpha', 'Alpha', 0.05, 0.01, 0.09, 2),
    ]);

    expect(screen.getByText('Pressure Response across models')).toBeDefined();
    expect(screen.getByText('Pressure response')).toBeDefined();
    expect(screen.getByText('Model')).toBeDefined();
    expect(screen.queryByText('Win Rate')).toBeNull();
    expect(screen.queryByText('Low pressure')).toBeNull();
    expect(screen.queryByText('High pressure')).toBeNull();
    expect(screen.queryByText('Win rate Δ ± CI')).toBeNull();

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('Alpha');
    expect(rows[2]?.textContent ?? '').toContain('Beta');
  });

  it('shows red negative mean with ▼ glyph', () => {
    renderSummary([createModel('alpha', 'Alpha', -0.05, -0.09, -0.01, 2)]);

    const row = getRowByLabel('Alpha');
    const glyph = within(row).getByText(/▼/);
    expect(glyph.closest('span')?.className ?? '').toContain('text-red-700');
  });

  it('renders range annotation when rangeMin and rangeMax are defined', () => {
    renderSummary([createModel('alpha', 'Alpha', 0.05, 0.01, 0.09, 2)]);

    expect(screen.getByText(/range across this model's pairs/)).toBeDefined();
  });

  it('shows — when mean is null', () => {
    renderSummary([createModel('alpha', 'Alpha', null, null, null, 0)]);

    const row = getRowByLabel('Alpha');
    expect(within(row).getByText('—')).toBeDefined();
  });

  it('omits range annotation when rangeMin or rangeMax is null', () => {
    renderSummary([createModel('alpha', 'Alpha', 0.05, null, null, 1)]);

    expect(screen.queryByText(/range across this model's pairs/)).toBeNull();
  });

  it('shows the Pressure response tooltip copy', () => {
    renderSummary([createModel('alpha', 'Alpha', 0.05, 0.01, 0.09, 2)]);

    const trigger = screen.getByRole('button', { name: /show pressure response help/i });
    fireEvent.focus(trigger);

    expect(screen.getByRole('tooltip').textContent ?? '').toContain('range in brackets');
  });

  it('renders the snapshot button with the new label', () => {
    renderSummary([createModel('alpha', 'Alpha', 0.05, 0.01, 0.09, 2)]);

    expect(
      screen.getByRole('button', { name: /copy pressure response across models as image/i }),
    ).toBeDefined();
  });
});
