/**
 * Computes the win rate for one side of a pairwise comparison, including
 * neutral outcomes in the denominator. Returns null when there are no
 * observations.
 */
const EPSILON = 1e-6;

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
 * I² heterogeneity index for a set of per-vignette win-rate estimates.
 * Returns a number in [0, 100], or null when fewer than 2 valid estimates remain after filtering.
 *
 * Algorithm (per spec FR-011):
 *   1. Filter out any input where totalTrials === 0 OR winRate === null
 *   2. If fewer than 2 valid estimates remain, return null
 *   3. For each estimate i:
 *        vi = max(p_i * (1 - p_i) / n_i, EPSILON)  with EPSILON = 1e-6
 *        wi = 1 / vi
 *   4. ybar_w = sum(wi * p_i) / sum(wi)
 *   5. Q = sum(wi * (p_i - ybar_w)^2)
 *   6. df = k - 1  where k = number of valid estimates
 *   7. If Q === 0 return 0
 *   8. Return max(0, (Q - df) / Q) * 100
 */
export function computeISquared(
  estimates: Array<{ winRate: number | null; totalTrials: number }>,
): number | null {
  const validEstimates = estimates.filter(
    (
      estimate,
    ): estimate is {
      winRate: number;
      totalTrials: number;
    } => estimate.totalTrials > 0 && estimate.winRate !== null,
  );

  if (validEstimates.length < 2) {
    return null;
  }

  const weightedEstimates = validEstimates.map((estimate) => {
    const variance = Math.max(
      (estimate.winRate * (1 - estimate.winRate)) / estimate.totalTrials,
      EPSILON,
    );

    return {
      winRate: estimate.winRate,
      weight: 1 / variance,
    };
  });

  const totalWeight = weightedEstimates.reduce(
    (sum, estimate) => sum + estimate.weight,
    0,
  );
  const weightedMean =
    weightedEstimates.reduce(
      (sum, estimate) => sum + estimate.weight * estimate.winRate,
      0,
    ) / totalWeight;
  const q = weightedEstimates.reduce(
    (sum, estimate) =>
      sum + estimate.weight * (estimate.winRate - weightedMean) ** 2,
    0,
  );

  if (q === 0) {
    return 0;
  }

  const degreesOfFreedom = validEstimates.length - 1;
  return Math.max(0, (q - degreesOfFreedom) / q) * 100;
}
