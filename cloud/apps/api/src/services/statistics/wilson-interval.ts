/**
 * Canonical Wilson score confidence interval.
 *
 * Single source of truth — replaces the duplicate implementations in
 * pressure-sensitivity/aggregation.ts and consistency/statistics.ts (DEDUP-9).
 */

// Default z for a two-tailed 95% CI
const Z_95 = 1.96;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Compute the Wilson score confidence interval.
 *
 * Returns `null` for any invalid input (trials <= 0, non-integer counts,
 * negative counts, NaN, infinity). This is the "fail-loud" contract: callers
 * must handle null rather than silently receiving zeros.
 *
 * @param matches - Number of successes (non-negative integer, <= trials)
 * @param trials  - Total number of trials (positive integer)
 * @param z       - Normal quantile; defaults to 1.96 (95% CI)
 */
export function wilsonInterval(
  matches: number,
  trials: number,
  z = Z_95,
): { low: number; high: number; p: number } | null {
  if (
    !Number.isFinite(matches)
    || !Number.isFinite(trials)
    || !Number.isFinite(z)
    || !Number.isInteger(matches)
    || !Number.isInteger(trials)
    || matches < 0
    || trials <= 0
    || matches > trials
  ) {
    return null;
  }

  const p = matches / trials;
  const zSquared = z * z;
  const denominator = 1 + zSquared / trials;
  const center = (p + zSquared / (2 * trials)) / denominator;
  const margin = (
    z
    * Math.sqrt((p * (1 - p) + zSquared / (4 * trials)) / trials)
  ) / denominator;

  const low = matches === 0 ? 0 : clamp01(center - margin);
  const high = matches === trials ? 1 : clamp01(center + margin);

  return { p, low, high };
}
