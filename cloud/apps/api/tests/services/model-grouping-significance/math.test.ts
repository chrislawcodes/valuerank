import { describe, expect, it } from 'vitest';
import {
  bootstrapMeanDiffCI,
  classifyEffectSize,
  classifyVerdict,
  holmBonferroni,
  rankBiserialCorrelation,
  wilcoxonSignedRank,
} from '../../../src/services/model-grouping-significance/math.js';

describe('model-grouping-significance math', () => {
  // ---- wilcoxonSignedRank ----

  it('returns trivial result for empty input', () => {
    expect(wilcoxonSignedRank([])).toEqual({ statistic: 0, pValue: 1, nEff: 0 });
  });

  it('returns trivial result when all differences are zero', () => {
    expect(wilcoxonSignedRank([0, 0, 0])).toEqual({ statistic: 0, pValue: 1, nEff: 0 });
  });

  it('uses exact distribution for small nEff with no ties', () => {
    // All 10 differences negative → W+ = 0, exactly 1 of 2^10 sign assignments has W+ = 0
    const result = wilcoxonSignedRank([-1, -2, -3, -4, -5, -6, -7, -8, -9, -10]);
    expect(result.nEff).toBe(10);
    expect(result.statistic).toBe(0);
    expect(result.pValue).toBeCloseTo(2 / 1024, 5);
  });

  it('returns high p-value for symmetric differences', () => {
    // Equal positive and negative magnitudes → statistic at midpoint, p should be high
    const result = wilcoxonSignedRank([1, -1, 2, -2, 3, -3]);
    expect(result.pValue).toBeGreaterThan(0.5);
  });

  it('uses normal approximation for nEff > 25', () => {
    // 26 differences all negative → falls through to normal approx
    const diffs = Array.from({ length: 26 }, (_, i) => -(i + 1));
    const result = wilcoxonSignedRank(diffs);
    expect(result.nEff).toBe(26);
    expect(result.pValue).toBeLessThan(0.001);
  });

  // ---- rankBiserialCorrelation ----

  it('computes rank-biserial correlation correctly', () => {
    // W = 0 → r = 1 (all ranks on positive side)
    expect(rankBiserialCorrelation(0, 10)).toBe(1);
    // W = n*(n+1)/4 → r = 0.5
    expect(rankBiserialCorrelation(27.5, 10)).toBe(0.5);
    // W = n*(n+1)/2 → r = 0 (all ranks on negative side)
    expect(rankBiserialCorrelation(55, 10)).toBe(0);
  });

  // ---- bootstrapMeanDiffCI ----

  it('returns zeros for empty input', () => {
    expect(bootstrapMeanDiffCI([])).toEqual({ low: 0, high: 0 });
  });

  it('returns a valid interval for a non-trivial input', () => {
    const { low, high } = bootstrapMeanDiffCI([-2, -1, 0, 1, 2], 0.05, 500);
    expect(low).toBeLessThanOrEqual(high);
  });

  it('returns zero interval for all-zero differences', () => {
    const { low, high } = bootstrapMeanDiffCI([0, 0, 0]);
    expect(low).toBe(0);
    expect(high).toBe(0);
  });

  // ---- holmBonferroni ----

  it('applies Holm-Bonferroni correction in ascending order', () => {
    expect(holmBonferroni([0.01, 0.03, 0.04])).toEqual([0.03, 0.06, 0.06]);
  });

  // ---- classifyEffectSize ----

  it('classifies effect sizes using |r| >= 0.3 threshold', () => {
    expect(classifyEffectSize(null)).toBe('Weak');
    expect(classifyEffectSize(0)).toBe('Weak');
    expect(classifyEffectSize(0.1)).toBe('Weak');
    expect(classifyEffectSize(0.3)).toBe('Strong');
    expect(classifyEffectSize(0.5)).toBe('Strong');
    expect(classifyEffectSize(-0.4)).toBe('Strong');
    expect(classifyEffectSize(-0.1)).toBe('Weak');
  });

  it('classifies final verdicts correctly', () => {
    expect(classifyVerdict({ correctedPValue: 0.01, effectSize: 0.1 })).toBe('Weak');
    expect(classifyVerdict({ correctedPValue: 0.01, effectSize: 0.5 })).toBe('Significant');
    expect(classifyVerdict({ correctedPValue: 0.2, effectSize: 0.5 })).toBe('Not significant');
    expect(classifyVerdict({ correctedPValue: null, effectSize: 0.5 })).toBe('Not significant');
  });
});
