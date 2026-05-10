/**
 * Methodology guard: direction-balanced averaging.
 *
 * The user has explicitly stated this rule as a research-integrity invariant:
 * "We should never overweight cells with more trials than others. We should be
 * treating those orders equally. More trials just means that the direction is
 * more accurate."
 *
 * What the rule means in practice:
 *  - Win rates pooled across the two directions of a mirrored vignette pair
 *    must average each direction with EQUAL weight, regardless of how many
 *    trials each direction has.
 *  - Pressure response (push-toward-A rate minus push-toward-B rate) must be
 *    computed from per-direction averages, not from trial-weighted pools.
 *
 * Why this file exists:
 *  - The existing unit tests in `aggregation.test.ts` already cover the
 *    invariant case-by-case. This file restates the rule pointedly so a
 *    future contributor reading test names alone will see "this is a
 *    methodology guard" before they touch the math. If you find yourself
 *    refactoring this file or its asserts to match a new implementation, STOP
 *    and re-read the wave-6 spec — you are likely about to silently regress
 *    the user's research-integrity rule.
 *
 * If a future change to `computeDirectionBalancedPairWinRates` or
 * `pooledDirectionalReduction` switches to count-additive (trial-weighted)
 * pooling, these tests must fail loudly.
 */

import { describe, expect, it } from 'vitest';
import {
  type Cell,
  type Observation,
  computeDirectionBalancedPairWinRates,
  pooledDirectionalReduction,
} from '../../../src/services/pressure-sensitivity/aggregation.js';

function makeCell(partial: Partial<Cell> & { ownLevel: number; opponentLevel: number; n: number }): Cell {
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

function observationsFor(params: {
  ownPicked?: number;
  opponentPicked?: number;
  neutral?: number;
  unscored?: number;
}): Observation[] {
  return [
    ...Array.from({ length: params.ownPicked ?? 0 }, () => ({ outcome: 'own_picked' as const, strength: 'strong' as const })),
    ...Array.from({ length: params.opponentPicked ?? 0 }, () => ({ outcome: 'opponent_picked' as const, strength: 'strong' as const })),
    ...Array.from({ length: params.neutral ?? 0 }, () => ({ outcome: 'neutral' as const, strength: null })),
    ...Array.from({ length: params.unscored ?? 0 }, () => ({ outcome: 'unscored' as const, strength: null })),
  ];
}

describe('Methodology guard: direction-balanced win rates (computeDirectionBalancedPairWinRates)', () => {
  it('averages two directions with equal weight even when trial counts are 100 vs 10', () => {
    // Direction "alpha" (def-a, authored alpha-first): 100 trials. Model picks alpha 70% of the time.
    //   `ownPicked: 70` = the canonical own value (alpha) was picked 70 times → alpha rate = 0.7.
    // Direction "beta"  (def-b, authored beta-first): 10 trials. Model picks alpha 30% of the time.
    //   `ownPicked: 3` = alpha was picked 3 times → alpha rate = 0.3.
    //   (`opponent_picked` for def-b means beta won, i.e., alpha lost.)
    //
    // Direction-balanced ownRate must equal exactly (0.70 + 0.30) / 2 = 0.50.
    // A count-additive bug would produce (70 + 3) / (100 + 10) ≈ 0.6636.
    const cells = new Map([
      ['1::1', {
        observationsByDefinition: new Map<string, Observation[]>([
          ['def-a', observationsFor({ ownPicked: 70, opponentPicked: 30 })],
          ['def-b', observationsFor({ ownPicked: 3, opponentPicked: 7 })],
        ]),
      }],
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def-a', 'def-b']),
      canonicalFirstValueToken: 'alpha',
      authoredFirstTokenByDef: new Map([
        ['def-a', 'alpha'],
        ['def-b', 'beta'],
      ]),
      domainByDef: new Map([
        ['def-a', 'd1'],
        ['def-b', 'd1'],
      ]),
    });

    // Equal-weighted result. If you see ~0.66 here, the math regressed to count-additive pooling.
    expect(result.ownRate).toBeCloseTo(0.5, 10);
    expect(result.opponentRate).toBeCloseTo(0.5, 10);
  });

  it('produces the SAME result as trial-weighted pooling when trial counts are balanced', () => {
    // Sanity check: when both directions have the same trial count, equal-weighted and
    // trial-weighted pooling agree. This proves the lopsided test above is actually
    // exercising the methodology guard (the lopsided case is the only one where the
    // bug would surface).
    //
    // Direction "alpha" (def-a, alpha-first): 100 trials, alpha rate = 0.7
    // Direction "beta"  (def-b, beta-first):  100 trials, alpha rate = 0.3
    const cells = new Map([
      ['1::1', {
        observationsByDefinition: new Map<string, Observation[]>([
          ['def-a', observationsFor({ ownPicked: 70, opponentPicked: 30 })],
          ['def-b', observationsFor({ ownPicked: 30, opponentPicked: 70 })],
        ]),
      }],
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def-a', 'def-b']),
      canonicalFirstValueToken: 'alpha',
      authoredFirstTokenByDef: new Map([
        ['def-a', 'alpha'],
        ['def-b', 'beta'],
      ]),
      domainByDef: new Map([
        ['def-a', 'd1'],
        ['def-b', 'd1'],
      ]),
    });

    // (0.70 + 0.30) / 2 = 0.50 (equal-weighted)
    // (70 + 30) / (100 + 100) = 0.50 (trial-weighted)
    // Both agree because trial counts match. This is the sanity-check baseline.
    expect(result.ownRate).toBeCloseTo(0.5, 10);
    expect(result.opponentRate).toBeCloseTo(0.5, 10);
  });
});

describe('Methodology guard: pressure response (pooledDirectionalReduction)', () => {
  it('averages each pressure cell with equal weight even when cell sizes are 1 vs 100', () => {
    // Push-toward-first cells: one with 1 trial (winRate=0), one with 100 trials (winRate=1).
    //   Equal-weighted average = (0 + 1) / 2 = 0.5.
    //   Trial-weighted bug    = (0 * 1 + 1 * 100) / 101 ≈ 0.99.
    // Push-toward-second cells: one with 1 trial (winRate=0.5), one with 100 trials (winRate=0.5).
    //   Both equal-weighted and trial-weighted = 0.5.
    // Pressure response = 0.5 − 0.5 = 0.0.
    const grid: Cell[] = [
      makeCell({ ownLevel: 4, opponentLevel: 1, n: 1, successes: 0, winRate: 0, lowData: false }),
      makeCell({ ownLevel: 5, opponentLevel: 1, n: 100, successes: 100, winRate: 1, lowData: false }),
      makeCell({ ownLevel: 1, opponentLevel: 4, n: 1, successes: 1, winRate: 0.5, lowData: false }),
      makeCell({ ownLevel: 1, opponentLevel: 5, n: 100, successes: 50, winRate: 0.5, lowData: false }),
      makeCell({ ownLevel: 2, opponentLevel: 2, n: 10, successes: 6, winRate: 0.6, lowData: false }),
    ];

    const result = pooledDirectionalReduction(grid, 3);

    expect(result.reason).toBeNull();
    // Equal-weighted across cells. If you see ~0.99 for pushTowardFirstRate, the math regressed.
    expect(result.pushTowardFirstRate).toBeCloseTo(0.5, 10);
    expect(result.pushTowardSecondRate).toBeCloseTo(0.5, 10);
    expect(result.value).toBeCloseTo(0, 10);
  });

  it('reports `directional-thin` when fewer than minN trials are pushing toward Value A', () => {
    // The card surfaces this reason via tooltip ("Not enough trials with Value A stacked higher
    // to compute pressure response.") so the user can distinguish "no pressure response detected"
    // from "we don't have enough data yet."
    const grid: Cell[] = [
      makeCell({ ownLevel: 4, opponentLevel: 1, n: 1, successes: 0, lowData: true }),
      makeCell({ ownLevel: 1, opponentLevel: 4, n: 5, successes: 2, lowData: false }),
    ];

    const result = pooledDirectionalReduction(grid, 3);

    expect(result.value).toBeNull();
    expect(result.reason).toBe('directional-thin');
  });

  it('reports `inverted-thin` when fewer than minN trials are pushing toward Value B', () => {
    const grid: Cell[] = [
      makeCell({ ownLevel: 4, opponentLevel: 1, n: 5, successes: 4, lowData: false }),
    ];

    const result = pooledDirectionalReduction(grid, 3);

    expect(result.value).toBeNull();
    expect(result.reason).toBe('inverted-thin');
  });

  it('reports `directional-and-inverted-thin` when both pressure conditions are too thin', () => {
    const result = pooledDirectionalReduction(
      [makeCell({ ownLevel: 3, opponentLevel: 3, n: 2, successes: 1, lowData: true })],
      3,
    );

    expect(result.value).toBeNull();
    expect(result.reason).toBe('directional-and-inverted-thin');
  });

  it('reports `baseline-thin` when only the equal-pressure baseline is too thin', () => {
    const result = pooledDirectionalReduction(
      [
        makeCell({ ownLevel: 4, opponentLevel: 1, n: 5, successes: 4, lowData: false }),
        makeCell({ ownLevel: 1, opponentLevel: 4, n: 5, successes: 1, lowData: false }),
      ],
      3,
    );

    expect(result.value).toBeCloseTo(0.6, 10);
    expect(result.reason).toBe('baseline-thin');
  });
});
