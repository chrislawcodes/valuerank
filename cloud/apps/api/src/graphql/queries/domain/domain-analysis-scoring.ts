import type { DomainAnalysisValueKey } from '../domain-analysis-values.js';

function getPairwiseWinCount(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
  winner: DomainAnalysisValueKey,
  loser: DomainAnalysisValueKey,
): number {
  return pairwiseWins.get(winner)?.get(loser) ?? 0;
}

export function computeSmoothedLogOddsScore(wins: number, losses: number): number {
  return Math.log((wins + 1) / (losses + 1));
}

export function computeFullBTScores(
  valueKeys: readonly DomainAnalysisValueKey[],
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
): Map<DomainAnalysisValueKey, number> {
  const EPSILON = 1e-6;
  const MAX_ITERATIONS = 500;
  const TOLERANCE = 1e-8;

  const strengths = new Map<DomainAnalysisValueKey, number>(valueKeys.map((valueKey) => [valueKey, 1]));

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const nextStrengths = new Map<DomainAnalysisValueKey, number>();
    let maxLogDelta = 0;

    for (const valueKey of valueKeys) {
      const currentStrength = strengths.get(valueKey) ?? 1;
      let totalWins = 0;
      let denominator = 0;
      let hasComparisons = false;

      for (const opponent of valueKeys) {
        if (opponent === valueKey) continue;
        const wins = getPairwiseWinCount(pairwiseWins, valueKey, opponent);
        const losses = getPairwiseWinCount(pairwiseWins, opponent, valueKey);
        const matches = wins + losses;
        if (matches <= 0) continue;

        const opponentStrength = strengths.get(opponent) ?? 1;
        const sumStrength = currentStrength + opponentStrength;
        if (sumStrength <= 0) continue;

        hasComparisons = true;
        totalWins += wins;
        denominator += matches / sumStrength;
      }

      let nextStrength = currentStrength;
      if (hasComparisons && denominator > 0) {
        nextStrength = totalWins / denominator;
      }
      if (!Number.isFinite(nextStrength) || nextStrength <= 0) {
        nextStrength = EPSILON;
      }
      nextStrengths.set(valueKey, nextStrength);
    }

    const logValues = valueKeys.map((valueKey) => Math.log(Math.max(nextStrengths.get(valueKey) ?? EPSILON, EPSILON)));
    const meanLog = logValues.reduce((sum, value) => sum + value, 0) / (logValues.length || 1);
    const normalizationFactor = Math.exp(meanLog);

    for (const valueKey of valueKeys) {
      const normalized = Math.max((nextStrengths.get(valueKey) ?? EPSILON) / normalizationFactor, EPSILON);
      const prev = Math.max(strengths.get(valueKey) ?? EPSILON, EPSILON);
      const logDelta = Math.abs(Math.log(normalized) - Math.log(prev));
      if (logDelta > maxLogDelta) maxLogDelta = logDelta;
      strengths.set(valueKey, normalized);
    }

    if (maxLogDelta < TOLERANCE) break;
  }

  return new Map(
    valueKeys.map((valueKey) => {
      const strength = Math.max(strengths.get(valueKey) ?? EPSILON, EPSILON);
      return [valueKey, Math.log(strength)];
    }),
  );
}
