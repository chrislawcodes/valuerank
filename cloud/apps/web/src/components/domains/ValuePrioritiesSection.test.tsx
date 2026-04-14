import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
      winRates: createRecord((valueKey, index) => 64.2 + index),
      supportRates: createRecord((valueKey, index) => 72.4 + index),
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
      supportRates: createRecord((valueKey) => {
        if (valueKey === 'Tradition') return null;
        if (valueKey === 'Hedonism') return null;
        return 81.2;
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
  it('shows support rate and win rate together in support mode', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /support rate \/ win rate/i }));

    const firstCell = getFirstValueCell(getModelRow('Model A'));
    expect(firstCell.textContent).toMatch(/^Support \d+% \/ Win \d+%$/);
  });

  it('shows win n/a when the win rate is missing', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /support rate \/ win rate/i }));

    const row = getModelRow('Model B');
    const cell = within(row).getByRole('button', { name: /Support 81% \/ Win n\/a/ });
    expect(cell.textContent).toBe('Support 81% / Win n/a');
  });

  it('shows n/a / n/a when both support and win rates are missing', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /support rate \/ win rate/i }));

    const row = getModelRow('Model B');
    const cell = within(row).getByRole('button', { name: /^n\/a \/ n\/a$/ });
    expect(cell.textContent).toBe('n/a / n/a');
  });

  it('sorts ascending in support mode and keeps null support rates last', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /support rate \/ win rate/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Tradition/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Tradition/i }));

    const rows = screen.getAllByRole('row');
    if (rows[2] === undefined || rows[3] === undefined) {
      throw new Error('Missing support-mode rows');
    }
    expect(rows[2].textContent).toContain('Model A');
    expect(rows[3].textContent).toContain('Model B');
  });

  it('sorts descending in support mode and keeps null support rates last', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /support rate \/ win rate/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Tradition/i }));

    const rows = screen.getAllByRole('row');
    if (rows[2] === undefined || rows[3] === undefined) {
      throw new Error('Missing support-mode rows');
    }
    expect(rows[2].textContent).toContain('Model A');
    expect(rows[3].textContent).toContain('Model B');
  });

  it('keeps win rate mode formatted with one decimal place', () => {
    renderSection();

    const firstCell = getFirstValueCell(getModelRow('Model A'));
    expect(firstCell.textContent).toMatch(/^\d+\.\d%$/);
  });
});
