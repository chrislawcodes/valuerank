import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WinRateStabilitySection } from './WinRateStabilitySection';
import type { ModelsStabilityModelResult, ModelsStabilitySkippedVignette } from '../../api/operations/modelsStability';

function makeModel(overrides: Partial<ModelsStabilityModelResult> & { modelId: string; label: string }): ModelsStabilityModelResult {
  return {
    qualifyingVignetteCount: 10,
    avgDirectionalAgreement: 0.75,
    avgExactAgreement: 0.60,
    ...overrides,
  };
}

const MODEL_A = makeModel({ modelId: 'model-a', label: 'Model A', avgDirectionalAgreement: 0.8, qualifyingVignetteCount: 10 });
const MODEL_B = makeModel({ modelId: 'model-b', label: 'Model B', avgDirectionalAgreement: 0.3, qualifyingVignetteCount: 6 });
const MODEL_C = makeModel({
  modelId: 'model-c',
  label: 'Model C',
  avgDirectionalAgreement: null,
  avgExactAgreement: null,
  qualifyingVignetteCount: 0,
});

describe('WinRateStabilitySection', () => {
  it('renders the section heading and table headers', () => {
    render(
      <WinRateStabilitySection
        models={[MODEL_A]}
        skippedVignettes={[]}
        fetching={false}
        errorMessage={null}
      />,
    );

    expect(screen.getByRole('heading', { name: /response consistency by model/i })).toBeTruthy();
    expect(screen.getAllByText(/vignettes \(n\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/direction agree/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/exact agree/i).length).toBeGreaterThan(0);
  });

  it('renders null when models list is empty and not fetching', () => {
    const { container } = render(
      <WinRateStabilitySection
        models={[]}
        skippedVignettes={[]}
        fetching={false}
        errorMessage={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows loading state when fetching with no data', () => {
    render(
      <WinRateStabilitySection
        models={[]}
        skippedVignettes={[]}
        fetching={true}
        errorMessage={null}
      />,
    );
    expect(screen.getByText(/loading response consistency/i)).toBeTruthy();
  });

  it('shows error message when errorMessage is set', () => {
    render(
      <WinRateStabilitySection
        models={[MODEL_A]}
        skippedVignettes={[]}
        fetching={false}
        errorMessage="Something went wrong"
      />,
    );
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
  });

  it('shows Low N badge for models with fewer than 5 qualifying vignettes', () => {
    const lowNModel = makeModel({ modelId: 'low', label: 'Low N Model', qualifyingVignetteCount: 3 });
    render(
      <WinRateStabilitySection
        models={[lowNModel, MODEL_A]}
        skippedVignettes={[]}
        fetching={false}
        errorMessage={null}
      />,
    );
    expect(screen.getByText('Low N')).toBeTruthy();
    expect(screen.queryAllByText('Low N').length).toBe(1);
  });

  it('does not show Low N badge for models with 0 qualifying vignettes', () => {
    render(
      <WinRateStabilitySection
        models={[MODEL_C]}
        skippedVignettes={[]}
        fetching={false}
        errorMessage={null}
      />,
    );
    expect(screen.queryByText('Low N')).toBeNull();
  });

  it('renders skipped vignettes warning block when skips are present', () => {
    const skipped: ModelsStabilitySkippedVignette[] = [
      { definitionId: 'def-1', vignetteName: 'Vignette One', reason: 'normalization-failed' },
      { definitionId: 'def-2', vignetteName: 'Vignette Two', reason: 'inconsistent-dimension-keys' },
    ];
    render(
      <WinRateStabilitySection
        models={[MODEL_A]}
        skippedVignettes={skipped}
        fetching={false}
        errorMessage={null}
      />,
    );
    expect(screen.getByText(/2 vignettes skipped/i)).toBeTruthy();
    expect(screen.getByText(/vignette one/i)).toBeTruthy();
    expect(screen.getByText(/normalization-failed/i)).toBeTruthy();
  });

  it('sorts by avgDirectionalAgreement descending by default', () => {
    render(
      <WinRateStabilitySection
        models={[MODEL_B, MODEL_A]}
        skippedVignettes={[]}
        fetching={false}
        errorMessage={null}
      />,
    );
    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1];
    const lastDataRow = rows[2];
    expect(firstDataRow?.textContent).toMatch(/Model A/);
    expect(lastDataRow?.textContent).toMatch(/Model B/);
  });

  it('toggles sort direction when clicking an active column header', async () => {
    const user = userEvent.setup();
    render(
      <WinRateStabilitySection
        models={[MODEL_B, MODEL_A]}
        skippedVignettes={[]}
        fetching={false}
        errorMessage={null}
      />,
    );

    // Default: avgDirectionalAgreement desc — Model A first
    let rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent).toMatch(/Model A/);

    // Click Direction Agree again → asc
    await user.click(screen.getByRole('button', { name: /sort by direction agree ascending/i }));
    rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent).toMatch(/Model B/);
  });

  it('formats percentage and em-dash for null values', () => {
    render(
      <WinRateStabilitySection
        models={[MODEL_C]}
        skippedVignettes={[]}
        fetching={false}
        errorMessage={null}
      />,
    );
    // null values render as —
    const emDashes = screen.getAllByText('—');
    expect(emDashes.length).toBeGreaterThanOrEqual(2);
  });
});
