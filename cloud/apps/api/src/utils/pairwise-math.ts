/**
 * Computes the win rate for one side of a pairwise comparison, including
 * neutral outcomes in the denominator. Returns null when there are no
 * observations.
 */
export function computePairwiseWinRate(
  wins: number,
  losses: number,
  neutral: number,
): number | null {
  const total = wins + losses + neutral;
  if (total <= 0) return null;
  return wins / total;
}

/**
 * Population standard deviation of per-vignette win-rate estimates,
 * with each scenario counted equally regardless of trial count.
 *
 * ValueRank treats every vignette as a designed stimulus in a revealed-
 * preference study; differences in trial count reflect data-collection
 * choices, not differences in scenario importance. Weighting by trial count
 * (as in textbook inverse-variance heterogeneity) would overrepresent
 * heavily-sampled scenarios in the spread measure and contradict the
 * unweighted arithmetic mean reported as `pooledMean`.
 *
 * `totalTrials` is used ONLY as a filter (drop zero-trial vignettes); it does
 * NOT enter the spread calculation itself.
 *
 * Returns SD in [0, 1] (i.e., proportion units, the same unit as `winRate`),
 * or null when fewer than 2 valid estimates remain after filtering.
 *
 * Algorithm:
 *   1. Filter out any input where totalTrials === 0 OR winRate === null
 *   2. If fewer than 2 valid estimates remain, return null
 *   3. mean = unweighted arithmetic mean of the per-vignette win rates
 *   4. variance = sum((p_i - mean)^2) / k        (population variance, divisor k)
 *   5. Return sqrt(variance)
 */
export function computePerVignetteStdDev(
  estimates: Array<{ winRate: number | null; totalTrials: number }>,
): number | null {
  const validRates = estimates
    .filter(
      (estimate) => estimate.totalTrials > 0 && estimate.winRate !== null,
    )
    .map((estimate) => estimate.winRate as number);

  if (validRates.length < 2) {
    return null;
  }

  const mean =
    validRates.reduce((sum, rate) => sum + rate, 0) / validRates.length;
  const sumSquaredDeviations = validRates.reduce(
    (sum, rate) => sum + (rate - mean) ** 2,
    0,
  );
  const variance = sumSquaredDeviations / validRates.length;
  return Math.sqrt(variance);
}
