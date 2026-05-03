import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PressureResponseByValueTable } from './PressureResponseByValueTable';
import type {
  PressureSensitivityModel,
  PressureSensitivityValueRate,
} from '../../api/operations/pressureSensitivity';

const TEN_VALUE_LABELS = [
  'Alpha',
  'Bravo',
  'Charlie',
  'Delta',
  'Echo',
  'Foxtrot',
  'Golf',
  'Hotel',
  'India',
  'Juliet',
];

function createValueRate(
  valueLabel: string,
  overrides: Partial<PressureSensitivityValueRate> = {},
): PressureSensitivityValueRate {
  return {
    valueToken: valueLabel.toLowerCase(),
    valueLabel,
    averageWinRate: 0.5,
    balancedWinRate: 0.5,
    highPressureOnThisValueWinRate: 0.5,
    highPressureOnOpposingValueWinRate: 0.5,
    pairsMeasured: 9,
    ...overrides,
  };
}

function createModel(
  modelId: string,
  valueRates: PressureSensitivityValueRate[],
): PressureSensitivityModel {
  return {
    modelId,
    label: modelId,
    providerName: 'Provider',
    unscoredCount: 0,
    pressureResponseSummary: {
      mean: 0.1,
      rangeMin: 0.05,
      rangeMax: 0.15,
      pairsMeasured: valueRates[0]?.pairsMeasured ?? 0,
    },
    valueRates,
    valuePairs: [],
  };
}

function createTenValueRates(): PressureSensitivityValueRate[] {
  return TEN_VALUE_LABELS.map((valueLabel, index) =>
    createValueRate(valueLabel, {
      averageWinRate: 0.4 + index * 0.01,
      balancedWinRate: 0.35 + index * 0.01,
      highPressureOnThisValueWinRate: 0.45 + index * 0.01,
      highPressureOnOpposingValueWinRate: 0.3 + index * 0.01,
    }),
  );
}

function createSortFixture(): PressureSensitivityValueRate[] {
  return [
    createValueRate('Alpha', {
      averageWinRate: 0.3,
      balancedWinRate: 0.3,
      highPressureOnThisValueWinRate: 0.9,
      highPressureOnOpposingValueWinRate: 0,
    }),
    createValueRate('Beta', {
      averageWinRate: 0.8,
      balancedWinRate: 0.75,
      highPressureOnThisValueWinRate: 0.9,
      highPressureOnOpposingValueWinRate: 0.1,
    }),
    createValueRate('Charlie', {
      averageWinRate: 0.7,
      balancedWinRate: 0.45,
      highPressureOnThisValueWinRate: 0.7,
      highPressureOnOpposingValueWinRate: 0.4,
    }),
  ];
}

function createMathFixture(): PressureSensitivityValueRate[] {
  return [
    createValueRate('Alpha', {
      averageWinRate: 0.6,
      balancedWinRate: 0.4,
      highPressureOnThisValueWinRate: 0.8,
      highPressureOnOpposingValueWinRate: 0.3,
    }),
    createValueRate('Beta', {
      averageWinRate: 0.4,
      balancedWinRate: 0.6,
      highPressureOnThisValueWinRate: 0.2,
      highPressureOnOpposingValueWinRate: 0.7,
    }),
  ];
}

describe('PressureResponseByValueTable', () => {
  it('renders 10 rows when the filtered model set has 10 values', () => {
    render(<PressureResponseByValueTable models={[createModel('Model A', createTenValueRates())]} />);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(12);
    expect(screen.getByText('Win rate')).toBeDefined();
  });

  it('sorts by responsiveness by default and re-sorts when a header is clicked', () => {
    render(<PressureResponseByValueTable models={[createModel('Model A', createSortFixture())]} />);

    const rows = screen.getAllByRole('row');
    expect(rows[2]?.textContent ?? '').toContain('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /sort by average win rate/i }));

    const resortedRows = screen.getAllByRole('row');
    expect(resortedRows[2]?.textContent ?? '').toContain('Beta');
  });

  it('toggles sort direction when the same header is clicked twice', () => {
    render(<PressureResponseByValueTable models={[createModel('Model A', createSortFixture())]} />);

    const averageHeader = screen.getByRole('button', { name: /sort by average win rate/i });
    fireEvent.click(averageHeader);
    fireEvent.click(averageHeader);

    const rows = screen.getAllByRole('row');
    expect(rows[2]?.textContent ?? '').toContain('Alpha');
  });

  it('renders the snapshot button with the correct label', () => {
    render(<PressureResponseByValueTable models={[createModel('Model A', createSortFixture())]} />);

    expect(
      screen.getByRole('button', { name: /copy pressure response by value as image/i }),
    ).toBeDefined();
  });

  it('renders the averaged value-rate inputs and responsiveness math', () => {
    render(<PressureResponseByValueTable models={[createModel('Model A', createMathFixture())]} />);

    const row = screen.getByText('Alpha').closest('tr');
    if (row == null) {
      throw new Error('Missing Alpha row');
    }

    const cells = within(row).getAllByRole('cell');
    expect(cells[1]?.textContent ?? '').toBe('60.0%');
    expect(cells[2]?.textContent ?? '').toBe('40.0%');
    expect(cells[3]?.textContent ?? '').toBe('80.0%');
    expect(cells[4]?.textContent ?? '').toBe('30.0%');
  });

  it('shows dashes for null rates instead of a numeric value', () => {
    render(
      <PressureResponseByValueTable
        models={[
          createModel('Model A', [
            createValueRate('Alpha', {
              averageWinRate: null,
              balancedWinRate: 0.4,
              highPressureOnThisValueWinRate: null,
              highPressureOnOpposingValueWinRate: 0.3,
            }),
          ]),
        ]}
      />,
    );

    const row = screen.getByText('Alpha').closest('tr');
    if (row == null) {
      throw new Error('Missing Alpha row');
    }

    const cells = within(row).getAllByRole('cell');
    expect(cells[1]?.textContent ?? '').toBe('—');
    expect(cells[2]?.textContent ?? '').toBe('40.0%');
    expect(cells[3]?.textContent ?? '').toBe('—');
    expect(cells[4]?.textContent ?? '').toBe('30.0%');
  });

  it('averages rates across all selected models', () => {
    render(
      <PressureResponseByValueTable
        models={[
          createModel('Model A', [
            createValueRate('Alpha', {
              averageWinRate: 0.4,
              balancedWinRate: 0.2,
              highPressureOnThisValueWinRate: 0.6,
              highPressureOnOpposingValueWinRate: 0.1,
            }),
          ]),
          createModel('Model B', [
            createValueRate('Alpha', {
              averageWinRate: 0.8,
              balancedWinRate: 0.4,
              highPressureOnThisValueWinRate: 1,
              highPressureOnOpposingValueWinRate: 0.3,
            }),
          ]),
        ]}
      />,
    );

    const row = screen.getByText('Alpha').closest('tr');
    if (row == null) {
      throw new Error('Missing Alpha row');
    }

    const cells = within(row).getAllByRole('cell');
    expect(screen.getByText(/Averaged across 2 selected models/)).toBeDefined();
    expect(cells[1]?.textContent ?? '').toBe('60.0%');
    expect(cells[2]?.textContent ?? '').toBe('30.0%');
    expect(cells[3]?.textContent ?? '').toBe('80.0%');
    expect(cells[4]?.textContent ?? '').toBe('20.0%');
  });
});
