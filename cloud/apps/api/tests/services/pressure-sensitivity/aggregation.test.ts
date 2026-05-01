import { describe, expect, it } from 'vitest';
import {
  type Cell,
  type Observation,
  buildCellMetrics,
  buildVignetteWeightedCellMetrics,
  diffProportionCI,
  pooledDirectionalReduction,
  summarizePressureResponse,
  tBasedMeanCI,
  wilsonInterval,
} from '../../../src/services/pressure-sensitivity/aggregation.js';

function cell(partial: Partial<Cell> & { ownLevel: number; opponentLevel: number; n: number }): Cell {
  return {
    ownLevel: partial.ownLevel,
    opponentLevel: partial.opponentLevel,
    n: partial.n,
    unscoredCount: partial.unscoredCount ?? 0,
    successes: partial.successes ?? 0,
    winRate: partial.winRate ?? null,
    conviction: partial.conviction ?? null,
    netScore: partial.netScore ?? null,
    lowData: partial.lowData ?? partial.n < 3,
  };
}

describe('buildCellMetrics', () => {
  it('computes win rate, conviction, netScore, and successes for a typical mix', () => {
    const observations: Observation[] = [
      { outcome: 'own_picked', strength: 'strong' },
      { outcome: 'own_picked', strength: 'lean' },
      { outcome: 'neutral', strength: null },
    ];

    expect(buildCellMetrics(observations)).toEqual({
      n: 3,
      unscoredCount: 0,
      successes: 2,
      winRate: 2 / 3,
      conviction: 1.5,
      netScore: (2 * 1 + 1 - 0 - 0) / 3,
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
      successes: 0,
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
    expect(result.successes).toBe(0);
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

    expect(result.netScore).toBeCloseTo(2 / 3, 10);
    expect(result.conviction).toBe(1.5);
  });
});

describe('buildVignetteWeightedCellMetrics', () => {
  it('counts each vignette once inside a cell and averages vignette win rates equally', () => {
    const result = buildVignetteWeightedCellMetrics([
      [
        { outcome: 'own_picked', strength: 'strong' },
      ],
      [
        { outcome: 'own_picked', strength: 'lean' },
        { outcome: 'opponent_picked', strength: 'lean' },
        { outcome: 'opponent_picked', strength: 'lean' },
      ],
    ]);

    expect(result).toEqual({
      n: 2,
      unscoredCount: 0,
      successes: 2,
      winRate: (1 + 1 / 3) / 2,
      conviction: 1.5,
      netScore: (2 + (-1 / 3)) / 2,
      lowData: true,
    });
  });

  it('ignores vignette groups with no scored observations', () => {
    const result = buildVignetteWeightedCellMetrics([
      [{ outcome: 'unscored', strength: null }],
      [{ outcome: 'own_picked', strength: 'lean' }],
    ]);

    expect(result).toEqual({
      n: 1,
      unscoredCount: 1,
      successes: 1,
      winRate: 1,
      conviction: 1,
      netScore: 1,
      lowData: true,
    });
  });
});

describe('wilsonInterval', () => {
  it('matches the textbook value for 20/25', () => {
    const interval = wilsonInterval(20, 25);

    expect(interval).not.toBeNull();
    expect(interval?.p).toBeCloseTo(0.8, 10);
    expect(interval?.low).toBeCloseTo(0.6087, 3);
    expect(interval?.high).toBeCloseTo(0.9114, 3);
  });

  it('clamps the lower bound to 0 when matches is 0', () => {
    const interval = wilsonInterval(0, 10);

    expect(interval).not.toBeNull();
    expect(interval?.low).toBe(0);
    expect(interval?.high).toBeGreaterThan(0);
  });

  it('clamps the upper bound to 1 when matches equals trials', () => {
    const interval = wilsonInterval(10, 10);

    expect(interval).not.toBeNull();
    expect(interval?.low).toBeLessThan(1);
    expect(interval?.high).toBe(1);
  });

  it('returns null for invalid inputs', () => {
    expect(wilsonInterval(Number.NaN, 10)).toBeNull();
    expect(wilsonInterval(5, 0)).toBeNull();
  });
});

describe('diffProportionCI', () => {
  it('returns a Newcombe Method-10 interval for a balanced pair of proportions', () => {
    const interval = diffProportionCI(0.3, 100, 0.7, 100);

    expect(interval).not.toBeNull();
    expect(interval?.ciLow).toBeCloseTo(0.2644, 4);
    expect(interval?.ciHigh).toBeCloseTo(0.5146, 4);
  });

  it('returns null when either trial count is zero', () => {
    expect(diffProportionCI(0.5, 0, 0.5, 10)).toBeNull();
  });
});

describe('tBasedMeanCI', () => {
  it('matches the expected t-based half-width for a four-value sample', () => {
    const interval = tBasedMeanCI([0.3, 0.5, 0.4, 0.45]);

    expect(interval.mean).toBeCloseTo(0.4125, 10);
    expect(interval.ciLow).toBeCloseTo(0.2766234558, 10);
    expect(interval.ciHigh).toBeCloseTo(0.5483765442, 10);
    expect(interval.n).toBe(4);
  });

  it('returns null CIs for a single value', () => {
    expect(tBasedMeanCI([0.3])).toEqual({
      mean: 0.3,
      ciLow: null,
      ciHigh: null,
      n: 1,
    });
  });

  it('returns null CIs for an empty sample', () => {
    expect(tBasedMeanCI([])).toEqual({
      mean: null,
      ciLow: null,
      ciHigh: null,
      n: 0,
    });
  });

  it('filters non-finite values before computing the mean', () => {
    const interval = tBasedMeanCI([0.3, Number.NaN, 0.4]);

    expect(interval.mean).toBeCloseTo(0.35, 10);
    expect(interval.n).toBe(2);
  });
});

describe('pooledDirectionalReduction', () => {
  it('uses pooled binomial rates for directional, mirror, and baseline pools', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 4, opponentLevel: 1, n: 10, successes: 7, lowData: false }),
      cell({ ownLevel: 5, opponentLevel: 3, n: 20, successes: 10, lowData: false }),
      cell({ ownLevel: 1, opponentLevel: 4, n: 30, successes: 6, lowData: false }),
      cell({ ownLevel: 3, opponentLevel: 5, n: 10, successes: 1, lowData: false }),
      cell({ ownLevel: 2, opponentLevel: 2, n: 8, successes: 3, lowData: false }),
      cell({ ownLevel: 5, opponentLevel: 5, n: 2, successes: 2, lowData: true }),
    ];

    const result = pooledDirectionalReduction(grid, 3);

    expect(result.reason).toBeNull();
    expect(result.pushTowardFirstRate).toBeCloseTo(17 / 30, 10);
    expect(result.pushTowardSecondRate).toBeCloseTo(7 / 40, 10);
    expect(result.baselineRate).toBeCloseTo(3 / 8, 10);
    expect(result.value).toBeCloseTo(17 / 30 - 7 / 40, 10);
    expect(result.qualifyingTrials).toBe(78);
  });

  it('marks the directional pool as thin but still returns the surviving mirror rate', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 4, opponentLevel: 1, n: 1, successes: 0, lowData: true }),
      cell({ ownLevel: 1, opponentLevel: 4, n: 5, successes: 2, lowData: false }),
    ];

    const result = pooledDirectionalReduction(grid, 3);

    expect(result).toMatchObject({
      value: null,
      ciLow: null,
      ciHigh: null,
      baselineRate: null,
      pushTowardFirstRate: null,
      pushTowardSecondRate: 2 / 5,
      reason: 'directional-thin',
      qualifyingTrials: 5,
    });
  });

  it('marks the mirror pool as thin but still returns the surviving directional rate', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 4, opponentLevel: 1, n: 5, successes: 4, lowData: false }),
    ];

    const result = pooledDirectionalReduction(grid, 3);

    expect(result).toMatchObject({
      value: null,
      ciLow: null,
      ciHigh: null,
      baselineRate: null,
      pushTowardFirstRate: 4 / 5,
      pushTowardSecondRate: null,
      reason: 'inverted-thin',
      qualifyingTrials: 5,
    });
  });

  it('marks both directional pools thin when neither side qualifies', () => {
    const result = pooledDirectionalReduction(
      [cell({ ownLevel: 3, opponentLevel: 3, n: 2, successes: 1, lowData: true })],
      3,
    );

    expect(result).toEqual({
      value: null,
      ciLow: null,
      ciHigh: null,
      baselineRate: null,
      pushTowardFirstRate: null,
      pushTowardSecondRate: null,
      reason: 'directional-and-inverted-thin',
      qualifyingTrials: 0,
    });
  });

  it('keeps response defined when only the baseline pool is thin', () => {
    const result = pooledDirectionalReduction(
      [
        cell({ ownLevel: 4, opponentLevel: 1, n: 5, successes: 4, lowData: false }),
        cell({ ownLevel: 1, opponentLevel: 4, n: 5, successes: 1, lowData: false }),
      ],
      3,
    );

    expect(result.value).toBeCloseTo(0.6, 10);
    expect(result.baselineRate).toBeNull();
    expect(result.reason).toBe('baseline-thin');
    expect(result.qualifyingTrials).toBe(10);
  });
});

describe('summarizePressureResponse', () => {
  it('computes an equal-weight mean and range across measured pairs', () => {
    const summary = summarizePressureResponse([0.019, 0.021, 0.05]);

    expect(summary.pairsMeasured).toBe(3);
    expect(summary.mean).toBeCloseTo(0.03, 10);
    expect(summary.rangeMin).toBe(0.019);
    expect(summary.rangeMax).toBe(0.05);
  });

  it('returns null summary fields when no pairs are measured', () => {
    expect(summarizePressureResponse([])).toEqual({
      mean: null,
      rangeMin: null,
      rangeMax: null,
      pairsMeasured: 0,
    });
  });
});
