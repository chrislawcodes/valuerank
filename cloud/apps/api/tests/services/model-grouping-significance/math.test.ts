import { describe, expect, it } from 'vitest';
import {
  classifyEffectSize,
  classifyVerdict,
  holmBonferroni,
  pairedCohensD,
  pairedMeanConfidenceInterval,
  pairedPermutationPValue,
} from '../../../src/services/model-grouping-significance/math.js';

describe('model-grouping-significance math', () => {
  it('computes an exact paired permutation p-value', () => {
    expect(pairedPermutationPValue([1, 1, 1, 1])).toBe(0.125);
  });

  it('returns a neutral p-value when the paired differences cancel out', () => {
    expect(pairedPermutationPValue([1, -1, 1, -1])).toBe(1);
  });

  it('applies Holm-Bonferroni correction in ascending order', () => {
    expect(holmBonferroni([0.01, 0.03, 0.04])).toEqual([0.03, 0.06, 0.06]);
  });

  it('computes a t-based confidence interval for the mean difference', () => {
    const ci = pairedMeanConfidenceInterval([1, 1, 1, 1]);
    expect(ci.mean).toBe(1);
    expect(ci.ciLow).toBe(1);
    expect(ci.ciHigh).toBe(1);
    expect(ci.n).toBe(4);
  });

  it('computes a paired Cohen d and classifies the result', () => {
    expect(pairedCohensD([1, 1, 1, 1])).toBeNull();
    expect(pairedCohensD([1, -1, 1, -1])).toBe(0);
    expect(classifyEffectSize(0.2)).toBe('Weak');
    expect(classifyEffectSize(0.8)).toBe('Strong');
    expect(classifyVerdict({ correctedPValue: 0.01, effectSize: 0.2 })).toBe('Weak');
    expect(classifyVerdict({ correctedPValue: 0.01, effectSize: 0.8 })).toBe('Significant');
    expect(classifyVerdict({ correctedPValue: 0.2, effectSize: 0.8 })).toBe('Not significant');
  });
});
