import { describe, expect, it } from 'vitest';

import { computeISquared } from '../../src/utils/pairwise-math.js';

describe('computeISquared', () => {
  it('returns null for an empty set of estimates', () => {
    expect(computeISquared([])).toBeNull();
  });

  it('returns null when fewer than two valid estimates remain', () => {
    expect(computeISquared([{ winRate: 0.5, totalTrials: 100 }])).toBeNull();
  });

  it('returns null when every estimate is filtered out', () => {
    expect(
      computeISquared([
        { winRate: null, totalTrials: 100 },
        { winRate: null, totalTrials: 100 },
      ]),
    ).toBeNull();
  });

  it('returns zero for identical estimates', () => {
    expect(
      computeISquared([
        { winRate: 0.5, totalTrials: 100 },
        { winRate: 0.5, totalTrials: 100 },
      ]),
    ).toBe(0);
  });

  it('returns a high heterogeneity value for widely separated estimates', () => {
    const result = computeISquared([
      { winRate: 0.1, totalTrials: 100 },
      { winRate: 0.9, totalTrials: 100 },
    ]);

    expect(result).not.toBeNull();
    expect(result).toBeGreaterThan(50);
  });

  it('does not throw when estimates sit at the binomial extremes', () => {
    expect(() =>
      computeISquared([
        { winRate: 0.0, totalTrials: 100 },
        { winRate: 1.0, totalTrials: 100 },
      ]),
    ).not.toThrow();
  });
});
