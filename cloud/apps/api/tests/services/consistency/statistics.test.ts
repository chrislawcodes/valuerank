import { describe, expect, it } from 'vitest';
import {
  coherenceForPair,
  dersimonianLairdPool,
  netPressureRank,
  spearmanRankCorrelation,
  wilsonInterval,
} from '../../../src/services/consistency/statistics.js';

describe('wilsonInterval', () => {
  it('returns the expected interval for 20 of 25', () => {
    const result = wilsonInterval(20, 25);
    expect(result.p).toBeCloseTo(0.8, 6);
    // Wilson 95% for k=20, n=25: low ≈ 0.6087, high ≈ 0.9114
    expect(result.low).toBeCloseTo(0.6087, 3);
    expect(result.high).toBeCloseTo(0.9114, 3);
  });

  it('returns zeros when there are no trials', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0, p: 0 });
  });
});

describe('dersimonianLairdPool', () => {
  it('falls back to Wilson for a single scenario', () => {
    const single = dersimonianLairdPool([{ p: 0.8, n: 25 }]);
    const wilson = wilsonInterval(20, 25);
    expect(single.betweenSd).toBe(0);
    expect(single.tauSquared).toBe(0);
    expect(single.estimate).toBeCloseTo(wilson.p, 6);
    expect(single.ciLow).toBeCloseTo(wilson.low, 6);
    expect(single.ciHigh).toBeCloseTo(wilson.high, 6);
  });

  it('pools heterogeneous studies with random effects', () => {
    const result = dersimonianLairdPool([
      { p: 0.2, n: 20 },
      { p: 0.5, n: 20 },
      { p: 0.9, n: 20 },
    ]);

    // DL random-effects pooled estimate for [(0.2,20),(0.5,20),(0.9,20)] ≈ 0.5356
    expect(result.estimate).toBeCloseTo(0.5356, 3);
    expect(result.tauSquared).toBeGreaterThan(0);
    expect(result.ciLow).toBeGreaterThanOrEqual(0);
    expect(result.ciHigh).toBeLessThanOrEqual(1);
  });
});

describe('spearmanRankCorrelation', () => {
  it('matches a tied-rank example', () => {
    const result = spearmanRankCorrelation(
      [1, 1, 2, 3, 3],
      [3, 2, 2, 1, 1],
    );

    // Tied-rank Spearman (Pearson-of-ranks method) for x=[1,1,2,3,3], y=[3,2,2,1,1]:
    //   x_ranks = [1.5,1.5,3,4.5,4.5], y_ranks = [5,3.5,3.5,1.5,1.5]
    //   rho = cov(ranks) / (sd(x_ranks)*sd(y_ranks)) = -8.25 / sqrt(9*9) = -0.9167
    expect(result.rho).toBeCloseTo(-0.9167, 3);
    expect(result.p).toBeLessThan(0.05);
  });

  it('throws on length mismatch', () => {
    expect(() => spearmanRankCorrelation([1, 2], [1])).toThrow(RangeError);
  });
});

describe('coherenceForPair', () => {
  it('returns indeterminate for zero-variance pressure', () => {
    expect(coherenceForPair([
      { pressureRank: 1, winRate: 0.1 },
      { pressureRank: 1, winRate: 0.5 },
      { pressureRank: 1, winRate: 0.9 },
    ])).toEqual({ rho: null, p: null, coherent: false, determinate: false });
  });

  it('treats a strong and significant signal as coherent', () => {
    const result = coherenceForPair([
      { pressureRank: 1, winRate: 0.2 },
      { pressureRank: 2, winRate: 0.4 },
      { pressureRank: 3, winRate: 0.6 },
      { pressureRank: 4, winRate: 0.8 },
      { pressureRank: 5, winRate: 1.0 },
    ]);

    expect(result.determinate).toBe(true);
    expect(result.coherent).toBe(true);
    expect(result.rho).toBeGreaterThanOrEqual(0.8);
    expect(result.p).toBeLessThan(0.05);
  });

  it('keeps a small-sample signal determinate but not coherent', () => {
    const result = coherenceForPair([
      { pressureRank: 1, winRate: 0.1 },
      { pressureRank: 2, winRate: 0.2 },
      { pressureRank: 3, winRate: 0.4 },
      { pressureRank: 4, winRate: 0.3 },
    ]);

    expect(result.determinate).toBe(true);
    expect(result.coherent).toBe(false);
    expect(result.rho).toBeGreaterThanOrEqual(0.8);
    expect(result.p).toBeGreaterThan(0.05);
  });

  it('returns indeterminate below three points', () => {
    expect(coherenceForPair([
      { pressureRank: 1, winRate: 0.2 },
      { pressureRank: 2, winRate: 0.4 },
    ])).toEqual({ rho: null, p: null, coherent: false, determinate: false });
  });
});

describe('netPressureRank', () => {
  it('maps canonical labels to pressure ranks', () => {
    expect(netPressureRank('strongly')).toBe(2);
    expect(netPressureRank('somewhat')).toBe(1);
    expect(netPressureRank('neutral')).toBe(0);
    expect(netPressureRank('opponentSomewhat')).toBe(-1);
    expect(netPressureRank('opponentStrongly')).toBe(-2);
    expect(netPressureRank('not-a-label')).toBeNull();
  });
});
