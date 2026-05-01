import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PressureResponseByValueTable } from './PressureResponseByValueTable';
import type {
  PressureSensitivityCell,
  PressureSensitivityModel,
  PressureSensitivityValuePair,
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

function createCell(
  ownLevel: number,
  opponentLevel: number,
  n: number,
  winRate: number,
): PressureSensitivityCell {
  return {
    ownLevel,
    opponentLevel,
    n,
    unscoredCount: 0,
    winRate,
    conviction: null,
    netScore: null,
    lowData: false,
  };
}

function createPair(
  pairKey: string,
  firstValueLabel: string,
  secondValueLabel: string,
  grid: PressureSensitivityCell[],
): PressureSensitivityValuePair {
  const n = grid.reduce((sum, cell) => sum + cell.n, 0);

  return {
    pairKey,
    firstValueToken: firstValueLabel.toLowerCase(),
    firstValueLabel,
    secondValueToken: secondValueLabel.toLowerCase(),
    secondValueLabel,
    n,
    unscoredCount: 0,
    definitionsMeasured: 1,
    pressureResponse: {
      value: null,
      baselineRate: null,
      pushTowardFirstRate: null,
      pushTowardSecondRate: null,
      qualifyingTrials: n,
      ciLow: null,
      ciHigh: null,
      reason: null,
    },
    grid,
  };
}

function createModel(valuePairs: PressureSensitivityValuePair[]): PressureSensitivityModel {
  return {
    modelId: 'model-a',
    label: 'Model A',
    providerName: 'Provider',
    unscoredCount: 0,
    pressureResponseSummary: { mean: 0.1, rangeMin: 0.05, rangeMax: 0.15, pairsMeasured: valuePairs.length },
    valuePairs,
  };
}

function createUniformGrid(): PressureSensitivityCell[] {
  return [
    createCell(1, 1, 5, 0.6),
    createCell(4, 1, 5, 0.8),
    createCell(1, 4, 5, 0.4),
    createCell(2, 3, 5, 0.6),
  ];
}

function createTenValueModel(): PressureSensitivityModel {
  const pairs: PressureSensitivityValuePair[] = [];

  for (let i = 0; i < TEN_VALUE_LABELS.length; i += 1) {
    const firstValueLabel = TEN_VALUE_LABELS[i];
    if (firstValueLabel == null) continue;

    for (let j = i + 1; j < TEN_VALUE_LABELS.length; j += 1) {
      const secondValueLabel = TEN_VALUE_LABELS[j];
      if (secondValueLabel == null) continue;

      pairs.push(
        createPair(
          `${firstValueLabel.toLowerCase()}::${secondValueLabel.toLowerCase()}`,
          firstValueLabel,
          secondValueLabel,
          createUniformGrid(),
        ),
      );
    }
  }

  return createModel(pairs);
}

function createSortFixture(): PressureSensitivityModel {
  return createModel([
    createPair(
      'alpha::beta',
      'Alpha',
      'Beta',
      [
        createCell(1, 1, 10, 0.3),
        createCell(4, 1, 10, 0.9),
        createCell(1, 4, 10, 0),
        createCell(2, 3, 10, 0),
      ],
    ),
    createPair(
      'alpha::charlie',
      'Alpha',
      'Charlie',
      [
        createCell(1, 1, 10, 0.3),
        createCell(4, 1, 10, 0.9),
        createCell(1, 4, 10, 0),
        createCell(2, 3, 10, 0),
      ],
    ),
    createPair(
      'beta::charlie',
      'Beta',
      'Charlie',
      [
        createCell(1, 1, 10, 0.8),
        createCell(4, 1, 10, 0.9),
        createCell(1, 4, 10, 0.6),
        createCell(2, 3, 10, 0.9),
      ],
    ),
  ]);
}

function createMathFixture(): PressureSensitivityModel {
  return createModel([
    createPair(
      'alpha::beta',
      'Alpha',
      'Beta',
      [
        createCell(1, 1, 5, 0.4),
        createCell(4, 1, 5, 0.8),
        createCell(1, 4, 10, 0.3),
        createCell(2, 3, 10, 0.9),
      ],
    ),
    createPair(
      'gamma::alpha',
      'Gamma',
      'Alpha',
      [
        createCell(1, 1, 10, 0.6),
        createCell(4, 1, 10, 0.7),
        createCell(1, 4, 10, 0.2),
        createCell(2, 3, 10, 0.1),
      ],
    ),
  ]);
}

describe('PressureResponseByValueTable', () => {
  it('renders 10 rows when the model has 10 values across 9 pairs each', () => {
    render(<PressureResponseByValueTable valuePairs={createTenValueModel().valuePairs} />);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(12);
    expect(screen.getByText('Win rate')).toBeDefined();
  });

  it('sorts by responsiveness by default and re-sorts when a header is clicked', () => {
    render(<PressureResponseByValueTable valuePairs={createSortFixture().valuePairs} />);

    const rows = screen.getAllByRole('row');
    expect(rows[2]?.textContent ?? '').toContain('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /sort by average win rate/i }));

    const resortedRows = screen.getAllByRole('row');
    expect(resortedRows[2]?.textContent ?? '').toContain('Beta');
  });

  it('renders the snapshot button with the correct label', () => {
    render(<PressureResponseByValueTable valuePairs={createSortFixture().valuePairs} />);

    expect(
      screen.getByRole('button', { name: /copy pressure response by value as image/i }),
    ).toBeDefined();
  });

  it('aggregates pooled win rates across multiple pairs', () => {
    render(<PressureResponseByValueTable valuePairs={createMathFixture().valuePairs} />);

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
});
