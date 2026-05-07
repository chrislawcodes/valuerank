import { describe, expect, it } from 'vitest';

import { computePerVignetteStdDev } from '../../src/utils/pairwise-math.js';

describe('computePerVignetteStdDev', () => {
  it('returns null for an empty set of estimates', () => {
    expect(computePerVignetteStdDev([])).toBeNull();
  });

  it('returns null when fewer than two valid estimates remain', () => {
    expect(computePerVignetteStdDev([{ winRate: 0.5, totalTrials: 100 }])).toBeNull();
  });

  it('returns null when every estimate is filtered out', () => {
    expect(
      computePerVignetteStdDev([
        { winRate: null, totalTrials: 100 },
        { winRate: null, totalTrials: 100 },
      ]),
    ).toBeNull();
  });

  it('returns zero for identical estimates', () => {
    expect(
      computePerVignetteStdDev([
        { winRate: 0.5, totalTrials: 100 },
        { winRate: 0.5, totalTrials: 100 },
      ]),
    ).toBe(0);
  });

  it('returns the population SD of widely separated estimates, ignoring trial counts', () => {
    const result = computePerVignetteStdDev([
      { winRate: 0.1, totalTrials: 100 },
      { winRate: 0.9, totalTrials: 100 },
    ]);

    // Population SD of [0.1, 0.9] with mean 0.5: sqrt(((0.1-0.5)^2 + (0.9-0.5)^2)/2) = 0.4
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(0.4, 6);
  });

  it('weights every vignette equally regardless of trial count', () => {
    // Same rates as above but with very different trial counts. SD must not change,
    // because totalTrials is filter-only.
    const balanced = computePerVignetteStdDev([
      { winRate: 0.1, totalTrials: 100 },
      { winRate: 0.9, totalTrials: 100 },
    ]);
    const skewed = computePerVignetteStdDev([
      { winRate: 0.1, totalTrials: 5 },
      { winRate: 0.9, totalTrials: 10000 },
    ]);

    expect(balanced).toBeCloseTo(skewed ?? -1, 9);
  });

  it('does not throw when estimates sit at the proportion extremes', () => {
    expect(() =>
      computePerVignetteStdDev([
        { winRate: 0.0, totalTrials: 100 },
        { winRate: 1.0, totalTrials: 100 },
      ]),
    ).not.toThrow();
  });
});
