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
  opponentWinRate: number = 1 - winRate,
): PressureSensitivityCell {
  return {
    ownLevel,
    opponentLevel,
    n,
    unscoredCount: 0,
    winRate,
    opponentWinRate,
    conviction: null,
    netScore: null,
    lowData: false,
  };
}

type DirectionBalancedFields = {
  directionBalancedWinRate?: number | null;
  directionBalancedOpponentWinRate?: number | null;
  directionBalancedBalancedWinRate?: number | null;
  directionBalancedBalancedOpponentWinRate?: number | null;
  directionBalancedHighPressureOwnWinRate?: number | null;
  directionBalancedHighPressureOwnOpponentWinRate?: number | null;
  directionBalancedHighPressureOpponentWinRate?: number | null;
  directionBalancedHighPressureOpponentOpponentWinRate?: number | null;
};

function createPair(
  pairKey: string,
  firstValueLabel: string,
  secondValueLabel: string,
  grid: PressureSensitivityCell[],
  directionBalanced: DirectionBalancedFields = {},
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
    directionBalancedWinRate: directionBalanced.directionBalancedWinRate ?? null,
    directionBalancedOpponentWinRate: directionBalanced.directionBalancedOpponentWinRate ?? null,
    directionBalancedBalancedWinRate: directionBalanced.directionBalancedBalancedWinRate ?? null,
    directionBalancedBalancedOpponentWinRate: directionBalanced.directionBalancedBalancedOpponentWinRate ?? null,
    directionBalancedHighPressureOwnWinRate: directionBalanced.directionBalancedHighPressureOwnWinRate ?? null,
    directionBalancedHighPressureOwnOpponentWinRate: directionBalanced.directionBalancedHighPressureOwnOpponentWinRate ?? null,
    directionBalancedHighPressureOpponentWinRate: directionBalanced.directionBalancedHighPressureOpponentWinRate ?? null,
    directionBalancedHighPressureOpponentOpponentWinRate: directionBalanced.directionBalancedHighPressureOpponentOpponentWinRate ?? null,
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
  // alpha::beta / alpha::charlie: Alpha average = 0.3 (via directionBalancedWinRate)
  // beta::charlie: Beta average = 0.8 (via directionBalancedWinRate)
  // Sorted by responsiveness (highPressureOnValue - balanced):
  //   Alpha: highOwn(0.9) - balanced(0.3) = 0.6
  //   Beta: highOwn(0.9) - balanced(mean[0.7,0.8]=0.75) = 0.15
  //   Charlie: highOwn(mean[1,0.4]=0.7) - balanced(mean[0.7,0.2]=0.45) = 0.25
  //   → Alpha (0.6) > Charlie (0.25) > Beta (0.15)
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
      {
        directionBalancedWinRate: 0.3,
        directionBalancedOpponentWinRate: 0.7,
        directionBalancedBalancedWinRate: 0.3,
        directionBalancedBalancedOpponentWinRate: 0.7,
        directionBalancedHighPressureOwnWinRate: 0.9,
        directionBalancedHighPressureOwnOpponentWinRate: 0.1,
        directionBalancedHighPressureOpponentWinRate: 0,
        directionBalancedHighPressureOpponentOpponentWinRate: 1,
      },
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
      {
        directionBalancedWinRate: 0.3,
        directionBalancedOpponentWinRate: 0.7,
        directionBalancedBalancedWinRate: 0.3,
        directionBalancedBalancedOpponentWinRate: 0.7,
        directionBalancedHighPressureOwnWinRate: 0.9,
        directionBalancedHighPressureOwnOpponentWinRate: 0.1,
        directionBalancedHighPressureOpponentWinRate: 0,
        directionBalancedHighPressureOpponentOpponentWinRate: 1,
      },
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
      {
        directionBalancedWinRate: 0.8,
        directionBalancedOpponentWinRate: 0.2,
        directionBalancedBalancedWinRate: 0.8,
        directionBalancedBalancedOpponentWinRate: 0.2,
        directionBalancedHighPressureOwnWinRate: 0.9,
        directionBalancedHighPressureOwnOpponentWinRate: 0.1,
        directionBalancedHighPressureOpponentWinRate: 0.6,
        directionBalancedHighPressureOpponentOpponentWinRate: 0.4,
      },
    ),
  ]);
}

function createMathFixture(): PressureSensitivityModel {
  // alpha::beta: Alpha direction-balanced average = 0.6 (directionBalancedWinRate)
  // gamma::alpha: Alpha direction-balanced average (as second) = 0.6 (directionBalancedOpponentWinRate)
  // Alpha average = mean([0.6, 0.6]) = 0.6
  // Alpha balanced = mean([0.4, 0.4]) = 0.4
  // Alpha highOwn = mean([0.8, 0.8]) = 0.8
  // Alpha highOpp = mean([0.3, 0.3]) = 0.3
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
      {
        // Alpha is first
        directionBalancedWinRate: 0.6,
        directionBalancedOpponentWinRate: 0.4,
        directionBalancedBalancedWinRate: 0.4,
        directionBalancedBalancedOpponentWinRate: 0.6,
        directionBalancedHighPressureOwnWinRate: 0.8,
        directionBalancedHighPressureOwnOpponentWinRate: 0.2,
        directionBalancedHighPressureOpponentWinRate: 0.3,
        directionBalancedHighPressureOpponentOpponentWinRate: 0.7,
      },
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
      {
        // Alpha is second
        directionBalancedWinRate: 0.4,
        directionBalancedOpponentWinRate: 0.6,
        directionBalancedBalancedWinRate: 0.6,
        directionBalancedBalancedOpponentWinRate: 0.4,
        directionBalancedHighPressureOwnWinRate: 0.7,
        directionBalancedHighPressureOwnOpponentWinRate: 0.3,
        directionBalancedHighPressureOpponentWinRate: 0.2,
        directionBalancedHighPressureOpponentOpponentWinRate: 0.8,
      },
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

  it('treats each pooled condition cell equally instead of weighting by cell size', () => {
    render(
      <PressureResponseByValueTable
        valuePairs={[
          createPair(
            'alpha::beta',
            'Alpha',
            'Beta',
            [
              createCell(1, 1, 1, 0),
              createCell(4, 1, 100, 1),
              createCell(1, 4, 1, 0),
              createCell(2, 3, 100, 1),
            ],
            {
              directionBalancedWinRate: 0.5,
              directionBalancedBalancedWinRate: 0,
              directionBalancedHighPressureOwnWinRate: 1,
              directionBalancedHighPressureOpponentWinRate: 0,
            },
          ),
        ]}
      />,
    );

    const row = screen.getByText('Alpha').closest('tr');
    if (row == null) {
      throw new Error('Missing Alpha row');
    }

    const cells = within(row).getAllByRole('cell');
    expect(cells[1]?.textContent ?? '').toBe('50.0%');
    expect(cells[2]?.textContent ?? '').toBe('0.0%');
    expect(cells[3]?.textContent ?? '').toBe('100.0%');
    expect(cells[4]?.textContent ?? '').toBe('0.0%');
  });

  it('keeps sparse vignette cells in the pooled rates instead of showing dashes', () => {
    render(
      <PressureResponseByValueTable
        valuePairs={[
          createPair(
            'alpha::beta',
            'Alpha',
            'Beta',
            [
              createCell(1, 1, 1, 0.4),
              createCell(4, 1, 1, 0.8),
              createCell(1, 4, 2, 0.3),
              createCell(2, 3, 2, 0.9),
            ],
            {
              directionBalancedWinRate: 0.6,
              directionBalancedBalancedWinRate: 0.4,
              directionBalancedHighPressureOwnWinRate: 0.8,
              directionBalancedHighPressureOpponentWinRate: 0.3,
            },
          ),
        ]}
      />,
    );

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
