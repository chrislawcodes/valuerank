import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ValuePrioritiesSection } from './ValuePrioritiesSection';
import { VALUES, type ModelEntry, type ValueKey } from '../../data/domainAnalysisData';

function createRecord(
  generator: (valueKey: ValueKey, index: number) => number | null,
): Record<ValueKey, number | null> {
  return Object.fromEntries(VALUES.map((valueKey, index) => [valueKey, generator(valueKey, index)])) as Record<
    ValueKey,
    number | null
  >;
}

function createModels(): ModelEntry[] {
  return [
    {
      model: 'model-a',
      label: 'Model A',
      values: Object.fromEntries(VALUES.map((valueKey, index) => [valueKey, index + 1.25])) as Record<ValueKey, number>,
      winRates: createRecord((_valueKey, index) => 64.2 + index),
    },
    {
      model: 'model-b',
      label: 'Model B',
      values: Object.fromEntries(VALUES.map((valueKey, index) => [valueKey, index + 2.5])) as Record<ValueKey, number>,
      winRates: createRecord((valueKey) => {
        if (valueKey === 'Achievement') return null;
        if (valueKey === 'Hedonism') return null;
        return 53.9;
      }),
    },
  ];
}

function renderSection() {
  render(
    <MemoryRouter>
      <ValuePrioritiesSection models={createModels()} selectedDomainId="domain-a" selectedSignature="vnewtd" />
    </MemoryRouter>,
  );
}

function getModelRow(label: string): HTMLTableRowElement {
  const row = screen.getByText(label).closest('tr');
  if (row === null) {
    throw new Error(`Missing row for ${label}`);
  }
  return row;
}

function getFirstValueCell(row: HTMLTableRowElement): HTMLElement {
  const cell = within(row).getAllByRole('button')[0];
  if (cell === undefined) {
    throw new Error('Missing first value cell');
  }
  return cell;
}

describe('ValuePrioritiesSection', () => {
  it('keeps win rate mode formatted with one decimal place', () => {
    renderSection();

    const firstCell = getFirstValueCell(getModelRow('Model A'));
    expect(firstCell.textContent).toMatch(/^\d+\.\d%$/);
  });

  it('shows n/a when the win rate is missing', () => {
    renderSection();

    const row = getModelRow('Model B');
    // Find any cell that renders "n/a" text. Achievement and Hedonism have null win rates.
    const naCell = within(row)
      .getAllByRole('button')
      .find((cell) => cell.textContent === 'n/a');
    expect(naCell).toBeDefined();
  });

  it('does not render a Full BT toggle', () => {
    renderSection();

    expect(screen.queryByRole('button', { name: /full bt/i })).toBeNull();
  });
});
