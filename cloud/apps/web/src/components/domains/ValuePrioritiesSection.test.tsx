import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ValuePrioritiesSection } from './ValuePrioritiesSection';
import { VALUES, type ModelEntry, type ValueKey } from '../../data/domainAnalysisData';

function createRecord(
  generator: (valueKey: ValueKey, index: number) => number | null
): Record<ValueKey, number | null> {
  return Object.fromEntries(
    VALUES.map((valueKey, index) => [valueKey, generator(valueKey, index)])
  ) as Record<ValueKey, number | null>;
}

function createModel(overrides: Partial<ModelEntry> = {}): ModelEntry {
  return {
    model: 'model-a',
    label: 'Model A',
    values: Object.fromEntries(
      VALUES.map((valueKey, index) => [valueKey, index + 1.25]),
    ) as Record<ValueKey, number>,
    winRates: createRecord((_valueKey, index) => 64.2 + index),
    ...overrides,
  };
}

function renderSection(models: ModelEntry[], winRateMode: 'all' | 'exc-neutral' = 'all') {
  render(
    <MemoryRouter>
      <ValuePrioritiesSection
        models={models}
        selectedDomainId="domain-a"
        selectedSignature="vnewtd"
        winRateMode={winRateMode}
      />
    </MemoryRouter>
  );
}

describe('ValuePrioritiesSection', () => {
  it('shows exc-neutral win rates when the mode is exc-neutral', () => {
    renderSection([
      createModel({
        winRatesExcNeutral: createRecord((valueKey) => {
          if (valueKey === 'Self_Direction_Action') return 72;
          return 50;
        }),
      }),
    ], 'exc-neutral');

    expect(screen.getByText('72.0%')).toBeTruthy();
  });

  it('shows the exc-neutral unavailable notice when the data is null', () => {
    renderSection([
      createModel({
        winRatesExcNeutral: createRecord(() => null),
      }),
    ], 'exc-neutral');

    expect(screen.getByText(/Exc\. neutral data not yet available/i)).toBeTruthy();
  });

  it('keeps the standard win rate visible in all mode and hides the notice', () => {
    renderSection([
      createModel({
        winRatesExcNeutral: createRecord((valueKey) => (valueKey === 'Self_Direction_Action' ? 72 : 50)),
        winRates: createRecord((valueKey) => (valueKey === 'Self_Direction_Action' ? 58 : 46)),
      }),
    ], 'all');

    expect(screen.getByText('58.0%')).toBeTruthy();
    expect(screen.queryByText(/Exc\. neutral data not yet available/i)).toBeNull();
  });
});
