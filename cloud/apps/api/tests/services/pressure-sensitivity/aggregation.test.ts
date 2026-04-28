import { describe, expect, it } from 'vitest';
import {
  type Cell,
  type Observation,
  aggregateSensitivity,
  applyBandReduction,
  buildCellMetrics,
  computeBaselineWinRate,
} from '../../../src/services/pressure-sensitivity/aggregation.js';

function cell(partial: Partial<Cell> & { ownLevel: number; opponentLevel: number; n: number }): Cell {
  return {
    ownLevel: partial.ownLevel,
    opponentLevel: partial.opponentLevel,
    n: partial.n,
    unscoredCount: partial.unscoredCount ?? 0,
    winRate: partial.winRate ?? null,
    conviction: partial.conviction ?? null,
    netScore: partial.netScore ?? null,
    lowData: partial.lowData ?? partial.n < 3,
  };
}

describe('buildCellMetrics', () => {
  it('computes win rate, conviction, and netScore for a typical mix', () => {
    const observations: Observation[] = [
      { outcome: 'own_picked', strength: 'strong' },
      { outcome: 'own_picked', strength: 'strong' },
      { outcome: 'neutral', strength: null },
    ];

    expect(buildCellMetrics(observations)).toEqual({
      n: 3,
      unscoredCount: 0,
      winRate: 2 / 3,
      conviction: 2,
      netScore: (2 * 2 + 0 - 0 - 0) / 3,
    });
  });

  it('returns nulls when only unscored observations are present', () => {
    expect(
      buildCellMetrics([
        { outcome: 'unscored', strength: null },
        { outcome: 'unscored', strength: null },
      ]),
    ).toEqual({
      n: 0,
      unscoredCount: 2,
      winRate: null,
      conviction: null,
      netScore: null,
    });
  });

  it('returns null conviction when no own_picked observations exist', () => {
    const result = buildCellMetrics([
      { outcome: 'opponent_picked', strength: 'strong' },
      { outcome: 'opponent_picked', strength: 'strong' },
    ]);

    expect(result.n).toBe(2);
    expect(result.winRate).toBe(0);
    expect(result.conviction).toBeNull();
    expect(result.netScore).toBe((0 - 2 * 2) / 2);
  });

  it('separates strong vs lean weights in the netScore numerator', () => {
    const result = buildCellMetrics([
      { outcome: 'own_picked', strength: 'strong' },
      { outcome: 'own_picked', strength: 'lean' },
      { outcome: 'opponent_picked', strength: 'lean' },
    ]);

    // (2*1 + 1) - (2*0 + 1) = 3 - 1 = 2; /3 = 0.666…
    expect(result.netScore).toBeCloseTo(2 / 3, 10);
    // conviction: (2*1 + 1) / (1 + 1) = 1.5
    expect(result.conviction).toBe(1.5);
  });
});

describe('applyBandReduction', () => {
  it('returns expected deltas on a standard grid', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 1, opponentLevel: 1, n: 5, winRate: 0.2, conviction: 1, netScore: -0.5 }),
      cell({ ownLevel: 2, opponentLevel: 1, n: 5, winRate: 0.4, conviction: 1.2, netScore: -0.2 }),
      cell({ ownLevel: 4, opponentLevel: 1, n: 5, winRate: 0.7, conviction: 1.7, netScore: 0.6 }),
      cell({ ownLevel: 5, opponentLevel: 1, n: 5, winRate: 0.9, conviction: 1.9, netScore: 1.2 }),
    ];

    const result = applyBandReduction(grid, 3);

    expect(result.directionDelta).toBeCloseTo(0.8 - 0.3, 10);
    expect(result.convictionDelta).toBeCloseTo(1.8 - 1.1, 10);
    expect(result.netScoreDelta).toBeCloseTo(0.9 - -0.35, 10);
  });

  it('returns null deltas when the low band has no cell meeting minN', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 1, opponentLevel: 1, n: 1, winRate: 0.2, conviction: 1, netScore: -0.5 }),
      cell({ ownLevel: 4, opponentLevel: 1, n: 5, winRate: 0.8, conviction: 1.8, netScore: 0.9 }),
    ];

    const result = applyBandReduction(grid, 3);

    expect(result.directionDelta).toBeNull();
    expect(result.convictionDelta).toBeNull();
    expect(result.netScoreDelta).toBeNull();
  });

  it('returns null deltas when the high band is empty', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 1, opponentLevel: 1, n: 5, winRate: 0.2, conviction: 1, netScore: -0.5 }),
    ];

    expect(applyBandReduction(grid, 3).directionDelta).toBeNull();
  });

  it('drops nullable conviction values from the band mean', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 1, opponentLevel: 1, n: 5, winRate: 0.2, conviction: null, netScore: -0.5 }),
      cell({ ownLevel: 5, opponentLevel: 1, n: 5, winRate: 0.8, conviction: 1.8, netScore: 0.9 }),
    ];

    const result = applyBandReduction(grid, 3);

    // direction is defined: 0.8 - 0.2
    expect(result.directionDelta).toBeCloseTo(0.6, 10);
    // conviction is undefined because low band has no defined conviction
    expect(result.convictionDelta).toBeNull();
  });
});

describe('computeBaselineWinRate', () => {
  it('uses level 1 when populated and meets minN', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 1, opponentLevel: 1, n: 5, winRate: 0.95 }),
      cell({ ownLevel: 1, opponentLevel: 5, n: 5, winRate: 0.95 }),
      cell({ ownLevel: 5, opponentLevel: 1, n: 5, winRate: 0.95 }),
    ];

    expect(computeBaselineWinRate(grid, 3)).toEqual({ value: 0.95, ceilingFloorFlag: 'ceiling' });
  });

  it('falls back to the next level when level 1 is empty', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 2, opponentLevel: 1, n: 5, winRate: 0.5 }),
    ];

    expect(computeBaselineWinRate(grid, 3)).toEqual({ value: 0.5, ceilingFloorFlag: null });
  });

  it('flags floor when baseline <= 0.1', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 1, opponentLevel: 1, n: 5, winRate: 0.05 }),
    ];

    expect(computeBaselineWinRate(grid, 3)).toEqual({ value: 0.05, ceilingFloorFlag: 'floor' });
  });

  it('returns null when no level meets minN', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 1, opponentLevel: 1, n: 1, winRate: 0.5 }),
    ];

    expect(computeBaselineWinRate(grid, 3)).toEqual({ value: null, ceilingFloorFlag: null });
  });
});

describe('aggregateSensitivity', () => {
  it('returns the mean of |netScoreDelta| over defined pairs', () => {
    expect(
      aggregateSensitivity([
        { netScoreDelta: 0.3 },
        { netScoreDelta: null },
        { netScoreDelta: -0.5 },
        { netScoreDelta: 0.1 },
      ]),
    ).toEqual({ value: (0.3 + 0.5 + 0.1) / 3, valuePairsMeasured: 3 });
  });

  it('returns null + 0 when no pairs have a defined Δ', () => {
    expect(aggregateSensitivity([{ netScoreDelta: null }])).toEqual({
      value: null,
      valuePairsMeasured: 0,
    });
  });
});
