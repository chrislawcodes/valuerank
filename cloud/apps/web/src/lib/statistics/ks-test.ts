/**
 * Kolmogorov-Smirnov Test (Simplified)
 *
 * The KS statistic measures the maximum distance between two
 * empirical cumulative distribution functions (ECDFs).
 *
 * This is useful for comparing decision distributions across runs
 * to see if they come from the same underlying distribution.
 *
 * Note: This is a simplified implementation suitable for visual
 * comparison. For full statistical rigor, use a stats library.
 */

export type KSResult = {
  /** KS statistic (max distance between ECDFs) */
  statistic: number;
  /** Interpretation of the result */
  interpretation: KSInterpretation;
  /** Sample sizes used */
  n1: number;
  n2: number;
};

export type KSInterpretation = 'identical' | 'similar' | 'different' | 'very_different';

/**
 * Calculate the Kolmogorov-Smirnov statistic between two samples.
 *
 * Returns the maximum absolute difference between the two ECDFs.
 * Higher values indicate more different distributions.
 *
 * Interpretation thresholds (heuristic):
 * - statistic < 0.1: distributions appear identical
 * - 0.1 <= statistic < 0.2: distributions are similar
 * - 0.2 <= statistic < 0.4: distributions are different
 * - statistic >= 0.4: distributions are very different
 *
 * @param sample1 - First sample (array of numeric values)
 * @param sample2 - Second sample (array of numeric values)
 * @returns KS statistic and interpretation
 */
export function ksStatistic(sample1: number[], sample2: number[]): KSResult {
  const n1 = sample1.length;
  const n2 = sample2.length;

  // Handle edge cases
  if (n1 === 0 || n2 === 0) {
    return {
      statistic: n1 === 0 && n2 === 0 ? 0 : 1,
      interpretation: n1 === 0 && n2 === 0 ? 'identical' : 'very_different',
      n1,
      n2,
    };
  }

  // Build ECDFs
  const cdf1 = buildECDF(sample1);
  const cdf2 = buildECDF(sample2);

  // Find all unique values across both samples
  const allValues = [...new Set([...sample1, ...sample2])].sort((a, b) => a - b);

  // Find maximum difference between CDFs
  let maxDiff = 0;
  for (const x of allValues) {
    const diff = Math.abs(cdf1(x) - cdf2(x));
    if (diff > maxDiff) {
      maxDiff = diff;
    }
  }

  return {
    statistic: maxDiff,
    interpretation: interpretKS(maxDiff),
    n1,
    n2,
  };
}

/**
 * Build an empirical cumulative distribution function (ECDF).
 *
 * The ECDF at point x is the proportion of data points <= x.
 *
 * @param data - Array of numeric values
 * @returns Function that computes ECDF(x) for any x
 */
export function buildECDF(data: number[]): (x: number) => number {
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;

  return (x: number): number => {
    if (n === 0) return 0;

    // Count values <= x
    let count = 0;
    for (const val of sorted) {
      if (val <= x) {
        count++;
      } else {
        break; // sorted, so no more values <= x
      }
    }
    return count / n;
  };
}

/**
 * Interpret KS statistic using heuristic thresholds.
 *
 * These thresholds are heuristic guidelines, not statistical significance.
 * For formal hypothesis testing, compute p-values using critical value tables.
 */
export function interpretKS(statistic: number): KSInterpretation {
  if (statistic < 0.1) return 'identical';
  if (statistic < 0.2) return 'similar';
  if (statistic < 0.4) return 'different';
  return 'very_different';
}

/**
 * Calculate KS statistic from count arrays (e.g., decision distributions).
 *
 * This is useful when you have counts per decision value (1-5)
 * rather than raw sample arrays.
 *
 * @param counts1 - Record of value -> count for first distribution
 * @param counts2 - Record of value -> count for second distribution
 * @returns KS statistic and interpretation
 */
export function ksFromCounts(
  counts1: Record<number, number>,
  counts2: Record<number, number>
): KSResult {
  // Convert counts to samples
  const sample1 = countsToSample(counts1);
  const sample2 = countsToSample(counts2);

  return ksStatistic(sample1, sample2);
}

/**
 * Convert a counts record to an array of values.
 */
function countsToSample(counts: Record<number, number>): number[] {
  const sample: number[] = [];
  for (const [value, count] of Object.entries(counts)) {
    const numValue = Number(value);
    for (let i = 0; i < count; i++) {
      sample.push(numValue);
    }
  }
  return sample;
}
