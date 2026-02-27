/**
 * domain-intensity.ts
 *
 * Intensity stability analysis for domain analysis (#026).
 * Splits each model's transcripts by scenario pair intensity, recomputes
 * BT scores per stratum, and flags values whose ranking changes materially
 * between the low and high intensity groups.
 *
 * No database access. No external dependencies.
 */

// --- Exported types (match spec data contract) ---

export type StratumBTResult = {
  stratum: 'low' | 'medium' | 'high';
  scores: Record<string, number>;      // Only values with comparisons in stratum
  comparisonCount: number;             // Non-neutral decisions in this stratum
  sufficient: boolean;
  insufficientReason: 'low_count' | 'disconnected_graph' | null;
};

export type ValueStabilityResult = {
  valueKey: string;
  lowRank: number | null;              // null if low stratum insufficient or value absent
  highRank: number | null;             // null if high stratum insufficient or value absent
  lowScore: number | null;
  highScore: number | null;
  rankDelta: number | null;            // highRank - lowRank; null if either rank null
  scoreDelta: number | null;           // highScore - lowScore; null if either null
  isUnstable: boolean;                 // |rankDelta| >= 3; false when rankDelta null
  direction: 'strengthens' | 'weakens' | 'stable' | 'insufficient_data';
};

export type ModelIntensityStability = {
  model: string;
  label: string;
  strata: StratumBTResult[];
  valueStability: ValueStabilityResult[];
  valuesWithSufficientData: number;
  sensitivityScore: number | null;
  sensitivityLabel: 'highly_stable' | 'moderately_sensitive' | 'highly_sensitive' | 'insufficient_data';
  dataWarning: string | null;
};

export type IntensityStabilityAnalysis = {
  models: ModelIntensityStability[];
  mostUnstableValues: string[];
  skipped: boolean;
  skipReason: 'insufficient_dimension_coverage' | 'no_intensity_variation' | 'all_models_insufficient' | null;
};

/** Pre-processed input for a single transcript, ready for intensity computation. */
export type IntensityTranscriptInput = {
  modelId: string;
  valueA: string;
  valueB: string;
  decisionCode: string | null;
  dimensions: Record<string, number> | null;
};

// --- Calibration constants ---
const MIN_STRATUM_COMPARISONS = 10;
const INSTABILITY_RANK_DELTA_THRESHOLD = 3;
const SCORE_DELTA_STABLE_THRESHOLD = 0.05;
const MIN_DIMENSION_COVERAGE = 0.3;

// --- Pure helpers ---

/**
 * Extract numeric dimensions from raw scenario content JSON.
 * Looks for { dimensions: { [valueKey]: number } } in the content object.
 */
export function extractDimensions(scenarioContent: unknown): Record<string, number> | null {
  if (scenarioContent == null || typeof scenarioContent !== 'object') return null;
  const content = scenarioContent as Record<string, unknown>;
  const dims = content['dimensions'];
  if (dims == null || typeof dims !== 'object' || Array.isArray(dims)) return null;
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(dims as Record<string, unknown>)) {
    if (typeof v === 'number') result[k] = v;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Pair intensity = (dims[valueA] + dims[valueB]) / 2.
 * Returns null if either key is missing.
 */
export function computePairIntensity(
  dims: Record<string, number>,
  valueA: string,
  valueB: string,
): number | null {
  const a = dims[valueA];
  const b = dims[valueB];
  if (a == null || b == null) return null;
  return (a + b) / 2;
}

/**
 * Assign an intensity score to a stratum bucket.
 * low: 1.0–2.4, medium: 2.5–3.4, high: 3.5–5.0
 */
export function getStratum(intensity: number): 'low' | 'medium' | 'high' {
  if (intensity < 2.5) return 'low';
  if (intensity < 3.5) return 'medium';
  return 'high';
}

/**
 * Check if the comparison graph is connected over the given active values.
 * Builds an undirected adjacency graph from pairwise wins (both directions).
 */
export function isConnectedGraph(
  activeValues: string[],
  pairwiseWins: Map<string, Map<string, number>>,
): boolean {
  if (activeValues.length === 0) return false;
  if (activeValues.length === 1) return true;

  const adj = new Map<string, Set<string>>(activeValues.map((v) => [v, new Set()]));
  for (const [winner, losers] of pairwiseWins) {
    for (const [loser, count] of losers) {
      if (count > 0) {
        adj.get(winner)?.add(loser);
        adj.get(loser)?.add(winner);
      }
    }
  }

  const visited = new Set<string>();
  const stack = [activeValues[0]!];
  while (stack.length > 0) {
    const v = stack.pop()!;
    if (visited.has(v)) continue;
    visited.add(v);
    for (const neighbor of adj.get(v) ?? []) {
      if (!visited.has(neighbor)) stack.push(neighbor);
    }
  }
  return activeValues.every((v) => visited.has(v));
}

/**
 * Run Bradley-Terry on string-keyed pairwise wins over the given value set.
 * Returns log-strength scores normalized to geometric mean = 0.
 */
function computeBTScores(
  valueKeys: string[],
  pairwiseWins: Map<string, Map<string, number>>,
): Map<string, number> {
  const EPSILON = 1e-6;
  const MAX_ITERATIONS = 500;
  const TOLERANCE = 1e-8;

  const strengths = new Map<string, number>(valueKeys.map((vk) => [vk, 1]));

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const nextStrengths = new Map<string, number>();
    let maxLogDelta = 0;

    for (const vk of valueKeys) {
      const currentStrength = strengths.get(vk) ?? 1;
      let totalWins = 0;
      let denominator = 0;
      let hasComparisons = false;

      for (const opponent of valueKeys) {
        if (opponent === vk) continue;
        const wins = pairwiseWins.get(vk)?.get(opponent) ?? 0;
        const losses = pairwiseWins.get(opponent)?.get(vk) ?? 0;
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
      if (!Number.isFinite(nextStrength) || nextStrength <= 0) nextStrength = EPSILON;
      nextStrengths.set(vk, nextStrength);
    }

    const logValues = valueKeys.map((vk) => Math.log(Math.max(nextStrengths.get(vk) ?? EPSILON, EPSILON)));
    const meanLog = logValues.reduce((sum, v) => sum + v, 0) / (logValues.length || 1);
    const normFactor = Math.exp(meanLog);

    for (const vk of valueKeys) {
      const normalized = Math.max((nextStrengths.get(vk) ?? EPSILON) / normFactor, EPSILON);
      const prev = Math.max(strengths.get(vk) ?? EPSILON, EPSILON);
      const logDelta = Math.abs(Math.log(normalized) - Math.log(prev));
      if (logDelta > maxLogDelta) maxLogDelta = logDelta;
      strengths.set(vk, normalized);
    }

    if (maxLogDelta < TOLERANCE) break;
  }

  return new Map(
    valueKeys.map((vk) => {
      const strength = Math.max(strengths.get(vk) ?? EPSILON, EPSILON);
      return [vk, Math.log(strength)];
    }),
  );
}

/**
 * Compute BT result for a single stratum.
 * Only values with actual comparisons are included in scores.
 * Ranks in the stability computation are relative to this value set.
 */
export function computeStratumResult(
  stratum: 'low' | 'medium' | 'high',
  pairwiseWins: Map<string, Map<string, number>>,
  comparisonCount: number,
): StratumBTResult {
  if (comparisonCount < MIN_STRATUM_COMPARISONS) {
    return { stratum, scores: {}, comparisonCount, sufficient: false, insufficientReason: 'low_count' };
  }

  // Determine values that actually participated in comparisons
  const activeValues: string[] = [];
  const seen = new Set<string>();
  for (const [winner, losers] of pairwiseWins) {
    for (const [loser, count] of losers) {
      if (count > 0) {
        if (!seen.has(winner)) { activeValues.push(winner); seen.add(winner); }
        if (!seen.has(loser)) { activeValues.push(loser); seen.add(loser); }
      }
    }
  }

  if (!isConnectedGraph(activeValues, pairwiseWins)) {
    return { stratum, scores: {}, comparisonCount, sufficient: false, insufficientReason: 'disconnected_graph' };
  }

  const btScores = computeBTScores(activeValues, pairwiseWins);
  return {
    stratum,
    scores: Object.fromEntries(btScores),
    comparisonCount,
    sufficient: true,
    insufficientReason: null,
  };
}

/**
 * Compute per-value stability metrics from low and high stratum results.
 * Ranks are within each stratum's own value set. Values absent from a stratum
 * get null rank (excluded from rankDelta and instability flag).
 */
export function computeValueStability(
  lowResult: StratumBTResult,
  highResult: StratumBTResult,
  valueKeys: string[],
): ValueStabilityResult[] {
  const rankMap = (scores: Record<string, number>): Map<string, number> => {
    const entries = Object.entries(scores).sort(([, a], [, b]) => b - a);
    const map = new Map<string, number>();
    entries.forEach(([vk], i) => map.set(vk, i + 1));
    return map;
  };

  const lowRanks = lowResult.sufficient ? rankMap(lowResult.scores) : new Map<string, number>();
  const highRanks = highResult.sufficient ? rankMap(highResult.scores) : new Map<string, number>();

  return valueKeys.map((valueKey) => {
    const lowScore = lowResult.sufficient ? (lowResult.scores[valueKey] ?? null) : null;
    const highScore = highResult.sufficient ? (highResult.scores[valueKey] ?? null) : null;
    const lowRank = lowResult.sufficient ? (lowRanks.get(valueKey) ?? null) : null;
    const highRank = highResult.sufficient ? (highRanks.get(valueKey) ?? null) : null;

    const rankDelta = lowRank != null && highRank != null ? highRank - lowRank : null;
    const scoreDelta = lowScore != null && highScore != null ? highScore - lowScore : null;
    const isUnstable = rankDelta != null && Math.abs(rankDelta) >= INSTABILITY_RANK_DELTA_THRESHOLD;

    let direction: ValueStabilityResult['direction'];
    if (scoreDelta == null) {
      direction = 'insufficient_data';
    } else if (scoreDelta > SCORE_DELTA_STABLE_THRESHOLD) {
      direction = 'strengthens';
    } else if (scoreDelta < -SCORE_DELTA_STABLE_THRESHOLD) {
      direction = 'weakens';
    } else {
      direction = 'stable';
    }

    return { valueKey, lowRank, highRank, lowScore, highScore, rankDelta, scoreDelta, isUnstable, direction };
  });
}

/**
 * Compute per-model sensitivity score and label from value stability results.
 */
export function computeModelSensitivity(valueStability: ValueStabilityResult[]): {
  valuesWithSufficientData: number;
  sensitivityScore: number | null;
  sensitivityLabel: ModelIntensityStability['sensitivityLabel'];
} {
  const sufficient = valueStability.filter((v) => v.lowRank != null && v.highRank != null);
  const unstable = sufficient.filter((v) => v.isUnstable);
  const valuesWithSufficientData = sufficient.length;
  const sensitivityScore = valuesWithSufficientData > 0 ? unstable.length / valuesWithSufficientData : null;

  let sensitivityLabel: ModelIntensityStability['sensitivityLabel'];
  if (valuesWithSufficientData === 0) {
    sensitivityLabel = 'insufficient_data';
  } else if (unstable.length === 0) {
    sensitivityLabel = 'highly_stable';
  } else if (unstable.length <= 2) {
    sensitivityLabel = 'moderately_sensitive';
  } else {
    sensitivityLabel = 'highly_sensitive';
  }

  return { valuesWithSufficientData, sensitivityScore, sensitivityLabel };
}

/**
 * Pre-computation domain-level skip evaluation.
 * Checks dimension coverage and intensity variation before any BT work.
 */
export function evaluateDomainPreSkip(inputs: IntensityTranscriptInput[]): {
  skipped: boolean;
  skipReason: IntensityStabilityAnalysis['skipReason'];
} {
  if (inputs.length === 0) {
    return { skipped: true, skipReason: 'insufficient_dimension_coverage' };
  }

  const withDimensions = inputs.filter((t) => t.dimensions != null);
  if (withDimensions.length / inputs.length < MIN_DIMENSION_COVERAGE) {
    return { skipped: true, skipReason: 'insufficient_dimension_coverage' };
  }

  // Need both low and high strata represented for stability comparison
  const strata = new Set<'low' | 'medium' | 'high'>();
  for (const t of withDimensions) {
    if (t.dimensions == null) continue;
    const intensity = computePairIntensity(t.dimensions, t.valueA, t.valueB);
    if (intensity != null) strata.add(getStratum(intensity));
  }
  if (!strata.has('low') || !strata.has('high')) {
    return { skipped: true, skipReason: 'no_intensity_variation' };
  }

  return { skipped: false, skipReason: null };
}

/**
 * Main entry point. Compute full intensity stability analysis.
 *
 * @param modelInputs - Models to compute stability for (model ID + display label)
 * @param transcripts - Pre-processed transcripts with value pair and dimensions resolved
 * @param valueKeys   - All domain value keys (e.g. the 10 DOMAIN_ANALYSIS_VALUE_KEYS)
 */
export function computeIntensityStability(
  modelInputs: Array<{ modelId: string; label: string }>,
  transcripts: IntensityTranscriptInput[],
  valueKeys: string[],
): IntensityStabilityAnalysis {
  const preSkip = evaluateDomainPreSkip(transcripts);
  if (preSkip.skipped) {
    return { models: [], mostUnstableValues: [], skipped: true, skipReason: preSkip.skipReason };
  }

  const modelResults: ModelIntensityStability[] = modelInputs.map(({ modelId, label }) => {
    const modelTranscripts = transcripts.filter((t) => t.modelId === modelId);

    const lowWins = new Map<string, Map<string, number>>();
    const medWins = new Map<string, Map<string, number>>();
    const highWins = new Map<string, Map<string, number>>();
    let lowCount = 0;
    let medCount = 0;
    let highCount = 0;

    const addWin = (map: Map<string, Map<string, number>>, winner: string, loser: string) => {
      if (!map.has(winner)) map.set(winner, new Map());
      map.get(winner)!.set(loser, (map.get(winner)!.get(loser) ?? 0) + 1);
    };

    for (const t of modelTranscripts) {
      if (t.dimensions == null || t.decisionCode == null) continue;
      const intensity = computePairIntensity(t.dimensions, t.valueA, t.valueB);
      if (intensity == null) continue;
      const decision = Number.parseInt(t.decisionCode, 10);
      if (!Number.isFinite(decision) || decision < 1 || decision > 5) continue;
      if (decision === 3) continue; // neutral — no pairwise comparison

      const stratum = getStratum(intensity);
      const winsMap = stratum === 'low' ? lowWins : stratum === 'medium' ? medWins : highWins;

      if (decision >= 4) {
        addWin(winsMap, t.valueA, t.valueB);
      } else {
        addWin(winsMap, t.valueB, t.valueA);
      }

      if (stratum === 'low') lowCount++;
      else if (stratum === 'medium') medCount++;
      else highCount++;
    }

    const lowResult = computeStratumResult('low', lowWins, lowCount);
    const medResult = computeStratumResult('medium', medWins, medCount);
    const highResult = computeStratumResult('high', highWins, highCount);

    const valueStability = computeValueStability(lowResult, highResult, valueKeys);
    const { valuesWithSufficientData, sensitivityScore, sensitivityLabel } = computeModelSensitivity(valueStability);

    const warnings: string[] = [];
    if (!lowResult.sufficient) {
      const reason = lowResult.insufficientReason === 'low_count'
        ? `Low stratum: only ${lowResult.comparisonCount} comparisons (need ${MIN_STRATUM_COMPARISONS})`
        : 'Low stratum: disconnected comparison graph';
      warnings.push(reason);
    }
    if (!highResult.sufficient) {
      const reason = highResult.insufficientReason === 'low_count'
        ? `High stratum: only ${highResult.comparisonCount} comparisons (need ${MIN_STRATUM_COMPARISONS})`
        : 'High stratum: disconnected comparison graph';
      warnings.push(reason);
    }

    return {
      model: modelId,
      label,
      strata: [lowResult, medResult, highResult],
      valueStability,
      valuesWithSufficientData,
      sensitivityScore,
      sensitivityLabel,
      dataWarning: warnings.length > 0 ? warnings.join('; ') : null,
    };
  });

  // Post-computation skip: all models have no sufficient data
  const allInsufficient = modelResults.every((m) => m.valuesWithSufficientData === 0);
  if (allInsufficient) {
    return { models: [], mostUnstableValues: [], skipped: true, skipReason: 'all_models_insufficient' };
  }

  // Domain callout: values unstable in 2+ models
  const unstableCountByValue = new Map<string, number>();
  for (const m of modelResults) {
    for (const v of m.valueStability) {
      if (v.isUnstable) {
        unstableCountByValue.set(v.valueKey, (unstableCountByValue.get(v.valueKey) ?? 0) + 1);
      }
    }
  }
  const mostUnstableValues = [...unstableCountByValue.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .map(([vk]) => vk);

  return { models: modelResults, mostUnstableValues, skipped: false, skipReason: null };
}
