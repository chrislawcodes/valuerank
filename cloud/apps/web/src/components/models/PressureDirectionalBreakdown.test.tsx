import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PressureDirectionalBreakdown } from './PressureDirectionalBreakdown';
import { formatSignedPoints } from './pressureSensitivityFormatting';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';

type DomainEffect = { domainId: string; domainName: string; pushedForEffect: number | null };

function createModel(
  modelId: string,
  label: string,
  pushedForEffect: number | null,
  domainEffects: DomainEffect[] = [],
): PressureSensitivityModel {
  return {
    modelId,
    label,
    providerName: 'Provider',
    unscoredCount: 0,
    pushedForEffect,
    pushedAgainstEffect: null,
    pushedEffectPairsUsed: domainEffects.length,
    domainPressureEffects: domainEffects,
    pressureResponseSummary: { mean: 0.1, rangeMin: 0.05, rangeMax: 0.15, pairsMeasured: 1 },
    valueRates: [],
    valuePairs: [],
  } as unknown as PressureSensitivityModel;
}

const DOMAINS: DomainEffect[] = [
  { domainId: 'dom-1', domainName: 'Ethics', pushedForEffect: 0.3 },
  { domainId: 'dom-2', domainName: 'Politics', pushedForEffect: 0.1 },
];

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
    renderBreakdown([createModel('alpha', 'Alpha', 0.2, DOMAINS)]);

    expect(screen.getByText('Pressure sensitivity by domain')).toBeDefined();
    expect(screen.getByText('High pressure')).toBeDefined();
    expect(screen.getByText('on value effect')).toBeDefined();
    expect(screen.getByText('Ethics')).toBeDefined();
    expect(screen.getByText('Politics')).toBeDefined();
  });

  it('displays overall effect and domain deltas (domain minus overall)', () => {
    // DOMAINS: Ethics=0.3, Politics=0.1; value effect=0.2
    // Ethics delta: 0.3 - 0.2 = +0.1
    // Politics delta: 0.1 - 0.2 = -0.1
    renderBreakdown([createModel('alpha', 'Alpha', 0.2, DOMAINS)]);

    const row = getRowByLabel('Alpha');
    const cells = getCells(row);
    expect(cells[1]?.textContent ?? '').toBe(formatSignedPoints(0.2));   // Value effect unchanged
    expect(cells[2]?.textContent ?? '').toBe(formatSignedPoints(0.1));   // Ethics delta
    expect(cells[3]?.textContent ?? '').toBe(formatSignedPoints(-0.1));  // Politics delta
  });

  it('shows em dash for null domain effect', () => {
    renderBreakdown([
      createModel('alpha', 'Alpha', 0.2, [
        { domainId: 'dom-1', domainName: 'Ethics', pushedForEffect: null },
      ]),
    ]);

    const row = getRowByLabel('Alpha');
    const cells = getCells(row);
    expect(cells[2]?.textContent ?? '').toBe('—');
  });

  it('sorts by overall effect descending', () => {
    renderBreakdown([
      createModel('model-b', 'ModelB', 0.1, DOMAINS),
      createModel('model-a', 'ModelA', 0.3, DOMAINS),
    ]);

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('ModelA');
    expect(rows[2]?.textContent ?? '').toContain('ModelB');
  });

  it('breaks ties alphabetically', () => {
    renderBreakdown([
      createModel('bravo', 'Bravo', 0.2, DOMAINS),
      createModel('alpha', 'Alpha', 0.2, DOMAINS),
    ]);

    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent ?? '').toContain('Alpha');
    expect(rows[2]?.textContent ?? '').toContain('Bravo');
  });

  it('excludes models where overall pushed effect is null', () => {
    renderBreakdown([
      createModel('invalid', 'Invalid', null, DOMAINS),
      createModel('valid', 'Valid', 0.2, DOMAINS),
    ]);

    expect(screen.queryByText('Invalid')).toBeNull();
    expect(screen.getByText('Valid')).toBeDefined();
  });

  it('returns null when all models have null overall effect', () => {
    renderBreakdown([
      createModel('a', 'A', null),
      createModel('b', 'B', null),
    ]);

    expect(screen.queryByText('Pressure sensitivity by domain')).toBeNull();
  });

  it('returns null for an empty models array', () => {
    renderBreakdown([]);

    expect(screen.queryByText('Pressure sensitivity by domain')).toBeNull();
  });

  it('uses red text for a negative overall effect', () => {
    renderBreakdown([createModel('alpha', 'Alpha', -0.1, DOMAINS)]);

    const row = getRowByLabel('Alpha');
    const cell = getCells(row)[1];
    expect(cell?.className ?? '').toContain('text-red-700');
  });

  it('uses default text for a positive overall effect', () => {
    renderBreakdown([createModel('alpha', 'Alpha', 0.1, DOMAINS)]);

    const row = getRowByLabel('Alpha');
    const cell = getCells(row)[1];
    expect(cell?.className ?? '').toContain('text-gray-900');
    expect(cell?.className ?? '').not.toContain('text-red-700');
  });

  it('uses rose background for a negative domain delta', () => {
    // delta = -0.2 - 0.1 = -0.3 → intensity > 0.66 → rose-300/100 classes
    renderBreakdown([
      createModel('alpha', 'Alpha', 0.1, [
        { domainId: 'dom-1', domainName: 'Ethics', pushedForEffect: -0.2 },
      ]),
    ]);

    const row = getRowByLabel('Alpha');
    const cell = getCells(row)[2];
    expect(cell?.className ?? '').toContain('rose');
  });

  it('sorts domain columns alphabetically by name', () => {
    renderBreakdown([
      createModel('alpha', 'Alpha', 0.2, [
        { domainId: 'dom-z', domainName: 'Zoology', pushedForEffect: 0.1 },
        { domainId: 'dom-a', domainName: 'Art', pushedForEffect: 0.2 },
      ]),
    ]);

    const headers = screen.getAllByRole('columnheader');
    const headerText = headers.map((h) => h.textContent ?? '');
    const artIdx = headerText.findIndex((t) => t.includes('Art'));
    const zooIdx = headerText.findIndex((t) => t.includes('Zoology'));
    expect(artIdx).toBeLessThan(zooIdx);
  });

  it('shows the value effect and domain tooltips', () => {
    renderBreakdown([createModel('alpha', 'Alpha', 0.2, DOMAINS)]);

    const valueEffectTrigger = screen.getByRole('button', {
      name: /show high pressure on value effect help/i,
    });
    fireEvent.focus(valueEffectTrigger);
    expect(screen.getByRole('tooltip').textContent ?? '').toContain('Win-rate lift above balanced');
    fireEvent.blur(valueEffectTrigger);

    const ethicsTrigger = screen.getByRole('button', { name: /show ethics help/i });
    fireEvent.focus(ethicsTrigger);
    expect(screen.getByRole('tooltip').textContent ?? '').toContain('Ethics');
    fireEvent.blur(ethicsTrigger);
  });

  it('renders the standard copy button for the report capture control', () => {
    renderBreakdown([createModel('alpha', 'Alpha', 0.2, DOMAINS)]);

    expect(
      screen.getByRole('button', { name: /copy pressure sensitivity by domain as image/i }),
    ).toBeDefined();
  });
});
