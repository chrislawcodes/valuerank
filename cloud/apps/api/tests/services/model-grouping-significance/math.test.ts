import { describe, expect, it } from 'vitest';
import {
  classifyEffectSize,
  classifyVerdict,
  exactMcNemar,
  holmBonferroni,
  matchedPairsOddsRatio,
  oddsRatioCI,
} from '../../../src/services/model-grouping-significance/math.js';

describe('model-grouping-significance math', () => {
  it('computes exact McNemar p-values for key edge cases', () => {
    expect(exactMcNemar(0, 0)).toBe(1);
    expect(exactMcNemar(0, 5)).toBeCloseTo(0.0625, 10);
    expect(exactMcNemar(5, 5)).toBe(1);
    expect(exactMcNemar(1, 10)).toBeLessThan(0.05);
    expect(exactMcNemar(3, 3)).toBe(1);
  });

  it('computes matched-pairs odds ratios', () => {
    expect(matchedPairsOddsRatio(0, 0)).toBe(1);
    expect(matchedPairsOddsRatio(0, 5)).toBeNull();
    expect(matchedPairsOddsRatio(5, 0)).toBeNull();
    expect(matchedPairsOddsRatio(4, 1)).toBe(0.25);
    expect(matchedPairsOddsRatio(1, 4)).toBe(4);
  });

  it('computes odds-ratio confidence intervals when both discordant cells are non-zero', () => {
    const interval = oddsRatioCI(4, 1, 0.05);
    expect(interval.low).not.toBeNull();
    expect(interval.high).not.toBeNull();
    expect(interval.low!).toBeLessThan(0.25);
    expect(interval.high!).toBeGreaterThan(0.25);
  });

  it('returns undefined odds-ratio intervals when a discordant cell is zero', () => {
    expect(oddsRatioCI(0, 5, 0.05)).toEqual({ low: null, high: null });
    expect(oddsRatioCI(5, 0, 0.05)).toEqual({ low: null, high: null });
    expect(oddsRatioCI(0, 0, 0.05)).toEqual({ low: null, high: null });
  });

  it('applies Holm-Bonferroni correction in ascending order', () => {
    expect(holmBonferroni([0.01, 0.03, 0.04])).toEqual([0.03, 0.06, 0.06]);
  });

  it('classifies odds-ratio effect sizes and final verdicts', () => {
    expect(classifyEffectSize(null)).toBe('Weak');
    expect(classifyEffectSize(1.5)).toBe('Weak');
    expect(classifyEffectSize(3)).toBe('Strong');
    expect(classifyEffectSize(0.3)).toBe('Strong');
    expect(classifyEffectSize(0.5)).toBe('Weak');
    expect(classifyEffectSize(2)).toBe('Weak');

    expect(classifyVerdict({ correctedPValue: 0.01, oddsRatio: 1.5 })).toBe('Weak');
    expect(classifyVerdict({ correctedPValue: 0.01, oddsRatio: 3 })).toBe('Significant');
    expect(classifyVerdict({ correctedPValue: 0.2, oddsRatio: 3 })).toBe('Not significant');
    expect(classifyVerdict({ correctedPValue: null, oddsRatio: 3 })).toBe('Not significant');
  });
});
