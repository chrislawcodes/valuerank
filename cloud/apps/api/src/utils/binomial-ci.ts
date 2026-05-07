const Z = 1.959963984540054;

/**
 * Wilson score interval for a binomial proportion at 95% confidence (z = 1.96).
 * Returns [low, high] both clamped to [0, 1], or null if n === 0.
 *
 * Standard formula:
 *   p_hat = successes / n
 *   denom = 1 + z^2 / n
 *   center = (p_hat + z^2 / (2n)) / denom
 *   margin = (z / denom) * sqrt(p_hat * (1 - p_hat) / n + z^2 / (4 * n^2))
 *   low = center - margin
 *   high = center + margin
 */
export function wilsonCI95(successes: number, n: number): [number, number] | null {
  if (n === 0) {
    return null;
  }

  const pHat = successes / n;
  const zSquared = Z * Z;
  const denominator = 1 + zSquared / n;
  const center = (pHat + zSquared / (2 * n)) / denominator;
  const margin =
    (Z / denominator) *
    Math.sqrt((pHat * (1 - pHat)) / n + zSquared / (4 * n * n));

  let low = center - margin;
  let high = center + margin;

  if (successes === 0) {
    low = 0;
  }

  if (successes === n) {
    high = 1;
  }

  return [
    Math.max(0, Math.min(1, low)),
    Math.max(0, Math.min(1, high)),
  ];
}
