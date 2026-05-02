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
