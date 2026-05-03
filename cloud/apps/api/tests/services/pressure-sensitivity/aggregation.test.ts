import { describe, expect, it } from 'vitest';
import {
  type Cell,
  type Observation,
  buildCellMetrics,
  buildVignetteWeightedCellMetrics,
  computeDirectionBalancedPairWinRates,
  diffProportionCI,
  pooledDirectionalReduction,
  summarizePressureResponse,
  tBasedMeanCI,
  wilsonInterval,
} from '../../../src/services/pressure-sensitivity/aggregation.js';

function cell(partial: Partial<Cell> & { ownLevel: number; opponentLevel: number; n: number }): Cell {
  const winRate =
    partial.winRate ?? (partial.n > 0 && partial.successes != null ? partial.successes / partial.n : null);
  const opponentWinRate =
    partial.opponentWinRate ?? (winRate == null ? null : 1 - winRate);

  return {
    ownLevel: partial.ownLevel,
    opponentLevel: partial.opponentLevel,
    n: partial.n,
    unscoredCount: partial.unscoredCount ?? 0,
    successes: partial.successes ?? 0,
    opponentSuccesses: partial.opponentSuccesses ?? 0,
    winRate,
    opponentWinRate,
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
      opponentSuccesses: 0,
      winRate: 2 / 3,
      opponentWinRate: 0,
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
      opponentSuccesses: 0,
      winRate: null,
      opponentWinRate: null,
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
    expect(result.opponentSuccesses).toBe(2);
    expect(result.winRate).toBe(0);
    expect(result.opponentWinRate).toBe(1);
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
    expect(result.opponentWinRate).toBeCloseTo(1 / 3, 10);
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
      successes: (1 + 1 / 3),
      opponentSuccesses: (1 / 3 + 1 / 3),
      winRate: (1 + 1 / 3) / 2,
      opponentWinRate: (1 / 3 + 1 / 3) / 2,
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
      opponentSuccesses: 0,
      winRate: 1,
      opponentWinRate: 0,
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
    expect(result.pushTowardFirstRate).toBeCloseTo(0.6, 10);
    expect(result.pushTowardSecondRate).toBeCloseTo(0.15, 10);
    expect(result.baselineRate).toBeCloseTo(0.6875, 10);
    expect(result.value).toBeCloseTo(0.45, 10);
    expect(result.qualifyingTrials).toBe(80);
  });

  it('treats each qualifying cell equally instead of weighting by cell size', () => {
    const grid: Cell[] = [
      cell({ ownLevel: 4, opponentLevel: 1, n: 1, successes: 0, winRate: 0, lowData: false }),
      cell({ ownLevel: 5, opponentLevel: 1, n: 100, successes: 100, winRate: 1, lowData: false }),
      cell({ ownLevel: 1, opponentLevel: 4, n: 1, successes: 1, winRate: 0.5, lowData: false }),
      cell({ ownLevel: 1, opponentLevel: 5, n: 100, successes: 50, winRate: 0.5, lowData: false }),
      cell({ ownLevel: 2, opponentLevel: 2, n: 10, successes: 6, winRate: 0.6, lowData: false }),
    ];

    const result = pooledDirectionalReduction(grid, 3);

    expect(result.reason).toBeNull();
    expect(result.pushTowardFirstRate).toBeCloseTo(0.5, 10);
    expect(result.pushTowardSecondRate).toBeCloseTo(0.5, 10);
    expect(result.value).toBeCloseTo(0, 10);
    expect(result.baselineRate).toBeCloseTo(0.6, 10);
  });

  it('marks the directional pool as thin when the total directional vignette count is too small', () => {
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
      pushTowardFirstRate: 0,
      pushTowardSecondRate: 2 / 5,
      reason: 'directional-thin',
      qualifyingTrials: 6,
    });
  });

  it('keeps response defined when sparse cells still add up to enough vignette observations in each pool', () => {
    const result = pooledDirectionalReduction(
      [
        cell({ ownLevel: 4, opponentLevel: 1, n: 1, successes: 1, lowData: true }),
        cell({ ownLevel: 5, opponentLevel: 2, n: 2, successes: 1, lowData: true }),
        cell({ ownLevel: 1, opponentLevel: 4, n: 1, successes: 0, lowData: true }),
        cell({ ownLevel: 2, opponentLevel: 5, n: 2, successes: 1, lowData: true }),
        cell({ ownLevel: 3, opponentLevel: 3, n: 3, successes: 2, lowData: false }),
      ],
      3,
    );

    expect(result.reason).toBeNull();
    expect(result.value).toBeCloseTo(0.5, 10);
    expect(result.qualifyingTrials).toBe(9);
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
      baselineRate: 0.5,
      pushTowardFirstRate: null,
      pushTowardSecondRate: null,
      reason: 'directional-and-inverted-thin',
      qualifyingTrials: 2,
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

describe('computeDirectionBalancedPairWinRates', () => {
  function makeCell(key: string, obsMap: Record<string, Observation[]>) {
    return [key, { observationsByDefinition: new Map(Object.entries(obsMap)) }] as const;
  }

  it('gives equal weight to both directions even when one has more vignettes', () => {
    // Direction A (authoredFirst === canonicalFirst): 3 vignettes, each winning 100% for A.
    // Direction B (authoredFirst !== canonicalFirst): 1 vignette, B wins → A's winRate=0%.
    //   def4 is authored B-first; 'opponent_picked' means B won → canonical first (A) lost.
    // Flat pool would be (1+1+1+0)/4=0.75; direction-balanced = avg(1.0, 0.0) = 0.5
    const cells = new Map([
      makeCell('cell1', {
        def1: [{ outcome: 'own_picked', strength: 'strong' }],
        def2: [{ outcome: 'own_picked', strength: 'strong' }],
        def3: [{ outcome: 'own_picked', strength: 'strong' }],
        def4: [{ outcome: 'opponent_picked', strength: 'strong' }],
      }),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def1', 'def2', 'def3', 'def4']),
      canonicalFirstValueToken: 'A',
      authoredFirstTokenByDef: new Map([
        ['def1', 'A'],
        ['def2', 'A'],
        ['def3', 'A'],
        ['def4', 'B'],
      ]),
      domainByDef: new Map([
        ['def1', 'd1'],
        ['def2', 'd1'],
        ['def3', 'd1'],
        ['def4', 'd1'],
      ]),
    });

    expect(result.ownRate).toBeCloseTo(0.5, 10);
    expect(result.opponentRate).toBeCloseTo(0.5, 10);
  });

  it('averages vignette rates within each direction independently', () => {
    // Direction A: defA wins in cell1 (own_picked→winRate=1), loses in cell2 (opponent_picked→winRate=0) → mean=0.5
    // Direction B: defB authored Y first; opponent_picked means Y won → X (canonical first) lost → winRate=0 → mean=0.0
    // Expected ownRate = (0.5 + 0.0) / 2 = 0.25
    const cells = new Map([
      makeCell('cell1', {
        defA: [{ outcome: 'own_picked', strength: 'strong' }],
        defB: [{ outcome: 'opponent_picked', strength: 'strong' }],
      }),
      makeCell('cell2', {
        defA: [{ outcome: 'opponent_picked', strength: 'strong' }],
      }),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['defA', 'defB']),
      canonicalFirstValueToken: 'X',
      authoredFirstTokenByDef: new Map([
        ['defA', 'X'],
        ['defB', 'Y'],
      ]),
      domainByDef: new Map([
        ['defA', 'd1'],
        ['defB', 'd1'],
      ]),
    });

    expect(result.ownRate).toBeCloseTo(0.25, 10);
  });

  it('returns null when no definitions have any scored observations', () => {
    const cells = new Map([
      makeCell('cell1', {
        def1: [{ outcome: 'unscored', strength: null }],
      }),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def1']),
      canonicalFirstValueToken: 'A',
      authoredFirstTokenByDef: new Map([['def1', 'A']]),
      domainByDef: new Map([['def1', 'd1']]),
    });

    expect(result.ownRate).toBeNull();
    expect(result.opponentRate).toBeNull();
  });

  it('returns null when the definitionsMeasured set is empty', () => {
    const result = computeDirectionBalancedPairWinRates({
      cells: new Map(),
      definitionsMeasured: new Set(),
      canonicalFirstValueToken: 'A',
      authoredFirstTokenByDef: new Map(),
      domainByDef: new Map(),
    });

    expect(result.ownRate).toBeNull();
    expect(result.opponentRate).toBeNull();
  });

  it('uses only direction A rate when direction B has no scored vignettes', () => {
    const cells = new Map([
      makeCell('cell1', {
        defA: [{ outcome: 'own_picked', strength: 'strong' }],
      }),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['defA']),
      canonicalFirstValueToken: 'A',
      authoredFirstTokenByDef: new Map([['defA', 'A']]),
      domainByDef: new Map([['defA', 'd1']]),
    });

    expect(result.ownRate).toBeCloseTo(1.0, 10);
    expect(result.opponentRate).toBeCloseTo(0.0, 10);
  });

  it('weights domains equally regardless of how many vignettes each domain has', () => {
    // Domain A has 2 A-first vignettes both winning 100%.
    // Domain B has 1 A-first vignette winning 0%.
    // Flat pool: (1 + 1 + 0) / 3 = 0.667
    // Per-domain equal weighting: avg(domainA=1.0, domainB=0.0) = 0.5
    const cells = new Map([
      makeCell('cell1', {
        defA1: [{ outcome: 'own_picked', strength: 'strong' }],
        defA2: [{ outcome: 'own_picked', strength: 'strong' }],
        defB1: [{ outcome: 'opponent_picked', strength: 'strong' }],
      }),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['defA1', 'defA2', 'defB1']),
      canonicalFirstValueToken: 'A',
      authoredFirstTokenByDef: new Map([
        ['defA1', 'A'],
        ['defA2', 'A'],
        ['defB1', 'A'],
      ]),
      domainByDef: new Map([
        ['defA1', 'domain-alpha'],
        ['defA2', 'domain-alpha'],
        ['defB1', 'domain-beta'],
      ]),
    });

    expect(result.ownRate).toBeCloseTo(0.5, 10);
    expect(result.opponentRate).toBeCloseTo(0.5, 10);
  });

  it('combines direction balancing and domain equal-weighting independently', () => {
    // Domain A: defA1 authored A-first wins 100%; defA2 authored B-first, B wins → A's rate=0%
    //   → firstMean=1.0, secondMean=0.0 → domainRate=0.5
    // Domain B: defB1 authored A-first wins 0%
    //   → firstMean=0.0, secondMean=null → domainRate=0.0
    // ownRate = avg(0.5, 0.0) = 0.25
    const cells = new Map([
      makeCell('cell1', {
        defA1: [{ outcome: 'own_picked', strength: 'strong' }],
        defA2: [{ outcome: 'opponent_picked', strength: 'strong' }],
        defB1: [{ outcome: 'opponent_picked', strength: 'strong' }],
      }),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['defA1', 'defA2', 'defB1']),
      canonicalFirstValueToken: 'A',
      authoredFirstTokenByDef: new Map([
        ['defA1', 'A'],
        ['defA2', 'B'],
        ['defB1', 'A'],
      ]),
      domainByDef: new Map([
        ['defA1', 'domain-alpha'],
        ['defA2', 'domain-alpha'],
        ['defB1', 'domain-beta'],
      ]),
    });

    // defA2: authored B-first, opponent_picked → B won → A's winRate=0
    // Domain alpha: firstMean=avg(1.0)=1.0, secondMean=avg(0.0)=0.0 → domainRate=0.5
    // Domain beta:  firstMean=avg(0.0)=0.0, secondMean=null           → domainRate=0.0
    // ownRate = avg(0.5, 0.0) = 0.25
    expect(result.ownRate).toBeCloseTo(0.25, 10);
    expect(result.opponentRate).toBeCloseTo(0.75, 10);
  });
});

describe('computeDirectionBalancedPairWinRates (second suite)', () => {
  function makeObs(outcome: 'own_picked' | 'opponent_picked' | 'neutral'): Observation {
    return { outcome, strength: null };
  }

  function makeCell(
    key: string,
    defId: string,
    observations: Observation[],
  ): [string, { observationsByDefinition: Map<string, Observation[]> }] {
    return [key, { observationsByDefinition: new Map([[defId, observations]]) }];
  }

  it('returns null when no cells have data', () => {
    const result = computeDirectionBalancedPairWinRates({
      cells: new Map(),
      definitionsMeasured: new Set(['def-a']),
      canonicalFirstValueToken: 'alpha',
      authoredFirstTokenByDef: new Map([['def-a', 'alpha']]),
      domainByDef: new Map([['def-a', 'd1']]),
    });

    expect(result.ownRate).toBeNull();
    expect(result.opponentRate).toBeNull();
  });

  it('computes direction-balanced rates from a single authored-first definition', () => {
    // def-a authored alpha first (= canonical first). 3 own_picked, 1 opponent_picked → winRate = 0.75
    const cells = new Map([
      makeCell('1::1', 'def-a', [makeObs('own_picked'), makeObs('own_picked'), makeObs('own_picked'), makeObs('opponent_picked')]),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def-a']),
      canonicalFirstValueToken: 'alpha',
      authoredFirstTokenByDef: new Map([['def-a', 'alpha']]),
      domainByDef: new Map([['def-a', 'd1']]),
    });

    expect(result.ownRate).toBeCloseTo(0.75, 10);
    expect(result.opponentRate).toBeCloseTo(0.25, 10);
  });

  it('computes direction-balanced rates from a single authored-second definition', () => {
    // def-b authored beta first (≠ canonical first=alpha). winRate is still alpha's rate because
    // assignOwnOpponent always maps outcomes to canonical own/opponent.
    // 3 own_picked, 1 opponent_picked → winRate=0.75 → alpha ownRate=0.75
    const cells = new Map([
      makeCell('1::1', 'def-b', [makeObs('own_picked'), makeObs('own_picked'), makeObs('own_picked'), makeObs('opponent_picked')]),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def-b']),
      canonicalFirstValueToken: 'alpha',
      authoredFirstTokenByDef: new Map([['def-b', 'beta']]),
      domainByDef: new Map([['def-b', 'd1']]),
    });

    expect(result.ownRate).toBeCloseTo(0.75, 10);
    expect(result.opponentRate).toBeCloseTo(0.25, 10);
  });

  it('averages equally across both authoring directions', () => {
    // def-a (authored alpha first): 4 own_picked, 1 opponent → alpha winRate=0.8
    // def-b (authored beta first): 2 own_picked, 3 opponent → alpha winRate=0.4
    // direction-balanced ownRate = (0.8 + 0.4) / 2 = 0.6
    const cells = new Map([
      makeCell('1::1', 'def-a', [makeObs('own_picked'), makeObs('own_picked'), makeObs('own_picked'), makeObs('own_picked'), makeObs('opponent_picked')]),
      makeCell('2::2', 'def-b', [makeObs('own_picked'), makeObs('own_picked'), makeObs('opponent_picked'), makeObs('opponent_picked'), makeObs('opponent_picked')]),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def-a', 'def-b']),
      canonicalFirstValueToken: 'alpha',
      authoredFirstTokenByDef: new Map([['def-a', 'alpha'], ['def-b', 'beta']]),
      domainByDef: new Map([['def-a', 'd1'], ['def-b', 'd1']]),
    });

    // def-a cell: winRate = 4/5 = 0.8 (authored alpha-first)
    // def-b cell: winRate = 2/5 = 0.4 (authored beta-first; winRate is still alpha's rate)
    // direction-balanced mean = (0.8 + 0.4) / 2 = 0.6
    expect(result.ownRate).toBeCloseTo(0.6, 10);
    expect(result.opponentRate).toBeCloseTo(0.4, 10);
  });

  it('gives each vignette one vote within a direction instead of pooling all of its cells', () => {
    // This regression distinguishes the PRD-correct vignette weighting from the old cell-pooling
    // behavior. Old logic would pool six A-first cell rates as one bucket:
    //   (1 + 1 + 1 + 1 + 1 + 0) / 6 = 0.8333...
    // PRD logic averages per vignette first:
    //   def-many = 1.0 across 5 cells, def-few = 0.0 across 1 cell, direction = (1 + 0) / 2 = 0.5
    const cells = new Map([
      makeCell('1::1', 'def-many', [makeObs('own_picked')]),
      makeCell('1::2', 'def-many', [makeObs('own_picked')]),
      makeCell('1::3', 'def-many', [makeObs('own_picked')]),
      makeCell('2::1', 'def-many', [makeObs('own_picked')]),
      makeCell('2::2', 'def-many', [makeObs('own_picked')]),
      makeCell('3::3', 'def-few', [makeObs('opponent_picked')]),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def-many', 'def-few']),
      canonicalFirstValueToken: 'alpha',
      authoredFirstTokenByDef: new Map([
        ['def-many', 'alpha'],
        ['def-few', 'alpha'],
      ]),
      domainByDef: new Map([
        ['def-many', 'd1'],
        ['def-few', 'd1'],
      ]),
    });

    expect(result.ownRate).toBeCloseTo(0.5, 10);
    expect(result.opponentRate).toBeCloseTo(0.5, 10);
  });

  it('applies cellFilter to restrict which cells contribute', () => {
    // Two cells: 1::1 (balanced) and 4::1 (high pressure on own)
    // Only the balanced cell should contribute with cellFilter own===opp
    const cells = new Map([
      makeCell('1::1', 'def-a', [makeObs('own_picked'), makeObs('own_picked'), makeObs('opponent_picked')]),
      makeCell('4::1', 'def-a', [makeObs('own_picked'), makeObs('own_picked'), makeObs('own_picked'), makeObs('opponent_picked')]),
    ]);

    const balancedResult = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def-a']),
      canonicalFirstValueToken: 'alpha',
      authoredFirstTokenByDef: new Map([['def-a', 'alpha']]),
      domainByDef: new Map([['def-a', 'd1']]),
      cellFilter: (own, opp) => own === opp,
    });

    // Only cell 1::1 contributes: 2 own_picked / 3 = 0.667
    expect(balancedResult.ownRate).toBeCloseTo(2 / 3, 10);

    const highOwnResult = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def-a']),
      canonicalFirstValueToken: 'alpha',
      authoredFirstTokenByDef: new Map([['def-a', 'alpha']]),
      domainByDef: new Map([['def-a', 'd1']]),
      cellFilter: (own, opp) => own >= 4 && opp <= 3,
    });

    // Only cell 4::1 contributes: 3 own_picked / 4 = 0.75
    expect(highOwnResult.ownRate).toBeCloseTo(0.75, 10);
  });

  it('returns null when cellFilter excludes all cells', () => {
    const cells = new Map([
      makeCell('1::1', 'def-a', [makeObs('own_picked'), makeObs('opponent_picked')]),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def-a']),
      canonicalFirstValueToken: 'alpha',
      authoredFirstTokenByDef: new Map([['def-a', 'alpha']]),
      domainByDef: new Map([['def-a', 'd1']]),
      cellFilter: (own, opp) => own >= 4 && opp <= 3,
    });

    expect(result.ownRate).toBeNull();
    expect(result.opponentRate).toBeNull();
  });
});
