/**
 * Cohen's d Effect Size Calculator
 *
 * Cohen's d is a measure of effect size between two groups.
 * d = (M1 - M2) / pooled_standard_deviation
 *
 * Interpretation (Cohen, 1988):
 * - |d| < 0.2: negligible
 * - 0.2 <= |d| < 0.5: small
 * - 0.5 <= |d| < 0.8: medium
 * - |d| >= 0.8: large
 */

import type { EffectSizeInterpretation } from '../../components/compare/types';

export type CohensDResult = {
  /** Cohen's d value (can be negative) */
  d: number;
  /** Absolute value of d */
  absD: number;
  /** Interpretation category */
  interpretation: EffectSizeInterpretation;
  /** Direction of effect */
  direction: 'positive' | 'negative' | 'none';
};

/**
 * Calculate Cohen's d effect size between two samples.
 *
 * Uses pooled standard deviation (for equal variance assumption).
 * This is appropriate for comparing means from two independent groups.
 *
 * @param mean1 - Mean of first sample
 * @param stdDev1 - Standard deviation of first sample
 * @param n1 - Sample size of first sample
 * @param mean2 - Mean of second sample
 * @param stdDev2 - Standard deviation of second sample
 * @param n2 - Sample size of second sample
 * @returns Cohen's d with interpretation
 */
export function cohensD(
  mean1: number,
  stdDev1: number,
  n1: number,
  mean2: number,
  stdDev2: number,
  n2: number
): CohensDResult {
  // Handle edge cases
  if (n1 < 2 || n2 < 2) {
    return {
      d: 0,
      absD: 0,
      interpretation: 'negligible',
      direction: 'none',
    };
  }

  // Calculate pooled standard deviation
  // s_pooled = sqrt(((n1-1)*s1^2 + (n2-1)*s2^2) / (n1+n2-2))
  const pooledVariance =
    ((n1 - 1) * stdDev1 ** 2 + (n2 - 1) * stdDev2 ** 2) / (n1 + n2 - 2);
  const pooledStd = Math.sqrt(pooledVariance);

  // Handle zero variance
  if (pooledStd === 0) {
    // If means are equal and variance is zero, no effect
    if (mean1 === mean2) {
      return {
        d: 0,
        absD: 0,
        interpretation: 'negligible',
        direction: 'none',
      };
    }
    // If means differ but variance is zero, effect is technically infinite
    // Return large effect in the appropriate direction
    return {
      d: mean1 > mean2 ? Infinity : -Infinity,
      absD: Infinity,
      interpretation: 'large',
      direction: mean1 > mean2 ? 'positive' : 'negative',
    };
  }

  // Calculate Cohen's d
  const d = (mean1 - mean2) / pooledStd;
  const absD = Math.abs(d);

  // Interpret effect size
  const interpretation = interpretEffectSize(absD);

  // Determine direction
  const direction: CohensDResult['direction'] =
    absD < 0.01 ? 'none' : d > 0 ? 'positive' : 'negative';

  return { d, absD, interpretation, direction };
}

/**
 * Interpret absolute Cohen's d value.
 */
export function interpretEffectSize(absD: number): EffectSizeInterpretation {
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
}

/**
 * Calculate Cohen's d from raw data arrays.
 * Convenience function that computes mean and stdDev from arrays.
 *
 * @param sample1 - Array of values from first sample
 * @param sample2 - Array of values from second sample
 */
export function cohensDFromData(sample1: number[], sample2: number[]): CohensDResult {
  if (sample1.length < 2 || sample2.length < 2) {
    return {
      d: 0,
      absD: 0,
      interpretation: 'negligible',
      direction: 'none',
    };
  }

  const stats1 = computeStats(sample1);
  const stats2 = computeStats(sample2);

  return cohensD(
    stats1.mean,
    stats1.stdDev,
    sample1.length,
    stats2.mean,
    stats2.stdDev,
    sample2.length
  );
}

/**
 * Compute mean and standard deviation of an array.
 */
function computeStats(data: number[]): { mean: number; stdDev: number } {
  const n = data.length;
  if (n === 0) return { mean: 0, stdDev: 0 };
  if (n === 1) return { mean: data[0] ?? 0, stdDev: 0 };

  const mean = data.reduce((sum, x) => sum + x, 0) / n;
  const variance = data.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev };
}
