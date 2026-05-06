import type { VarianceStats } from '../../services/analysis/aggregate/contracts.js';

export type RepeatPattern = 'stable' | 'softLean' | 'torn' | 'noisy';

// Thresholds MUST stay identical to OverviewTabHelpers.ts; update both together.
export function classifyRepeatPattern(
  directionalAgreement: number | null | undefined,
  medianSignedDistance: number | null | undefined,
  neutralShare: number | null | undefined,
  range: number | null | undefined,
): RepeatPattern | null {
  if (
    directionalAgreement === null
    || directionalAgreement === undefined
    || medianSignedDistance === null
    || medianSignedDistance === undefined
    || neutralShare === null
    || neutralShare === undefined
    || range === null
    || range === undefined
  ) {
    return null;
  }

  const absoluteDistance = Math.abs(medianSignedDistance);
  if (directionalAgreement >= 0.80) {
    return 'stable';
  }
  if (absoluteDistance >= 0.50 && range <= 1 && directionalAgreement >= 0.55) {
    return 'softLean';
  }
  if (range >= 3) {
    return 'noisy';
  }
  if (neutralShare >= 0.60 || absoluteDistance < 0.35) {
    return 'torn';
  }
  return 'torn';
}

export type DimensionKeyResult =
  | { keys: [string, string]; inconsistent: false }
  | { inconsistent: true };

export function resolveDimensionKeys(
  scenarioDimensions: Record<string, Record<string, number | string>>,
): DimensionKeyResult | null {
  const entries = Object.values(scenarioDimensions);
  if (entries.length === 0) return null;

  // Get the sorted key set from the first entry
  const firstKeys = Object.keys(entries[0]).sort();
  if (firstKeys.length !== 2) return null;

  // Check all entries share the same two keys
  for (const dims of entries) {
    const keys = Object.keys(dims).sort();
    if (keys.length !== 2 || keys[0] !== firstKeys[0] || keys[1] !== firstKeys[1]) {
      return { inconsistent: true };
    }
  }

  return { keys: [firstKeys[0], firstKeys[1]], inconsistent: false };
}

export function buildConditionGroups(
  scenarioDimensions: Record<string, Record<string, number | string>>,
  keyA: string,
  keyB: string,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const [scenarioId, dims] of Object.entries(scenarioDimensions)) {
    const aLevel = dims[keyA] != null ? String(dims[keyA]) : 'N/A';
    const bLevel = dims[keyB] != null ? String(dims[keyB]) : 'N/A';
    const conditionKey = `${aLevel}||${bLevel}`;
    const existing = groups.get(conditionKey);
    if (existing != null) {
      existing.push(scenarioId);
    } else {
      groups.set(conditionKey, [scenarioId]);
    }
  }
  return groups;
}

export function weightedMean(
  entries: Array<{ sampleCount: number; value: number | null | undefined }>,
): number | null {
  const eligible = entries.filter((e): e is { sampleCount: number; value: number } => typeof e.value === 'number');
  if (eligible.length === 0) return null;
  const totalWeight = eligible.reduce((sum, e) => sum + e.sampleCount, 0);
  if (totalWeight === 0) return null;
  const weightedSum = eligible.reduce((sum, e) => sum + e.value * e.sampleCount, 0);
  return weightedSum / totalWeight;
}

export type ConditionStats = {
  directionalAgreement: number;
  medianSignedDistance: number;
  neutralShare: number;
  maxRange: number;
  totalSamples: number;
};

export function aggregateConditionStats(
  scenarioIds: string[],
  perScenario: Record<string, VarianceStats>,
): ConditionStats | null {
  const eligible = scenarioIds
    .map((id) => perScenario[id])
    .filter((s): s is VarianceStats => s != null && s.sampleCount >= 2);

  if (eligible.length === 0) return null;

  const totalSamples = eligible.reduce((sum, s) => sum + s.sampleCount, 0);

  const wm = (key: keyof VarianceStats): number | null => {
    const populated = eligible.filter((s) => typeof s[key] === 'number');
    if (populated.length === 0) return null;
    const weightedSum = populated.reduce((sum, s) => sum + (Number(s[key]) * s.sampleCount), 0);
    const weightedCount = populated.reduce((sum, s) => sum + s.sampleCount, 0);
    return weightedCount > 0 ? Number((weightedSum / weightedCount).toFixed(2)) : null;
  };

  const directionalAgreement = wm('directionalAgreement');
  const medianSignedDistance = wm('medianSignedDistance');
  const neutralShare = wm('neutralShare');

  if (directionalAgreement == null || medianSignedDistance == null || neutralShare == null) {
    return null;
  }

  const maxRange = eligible.reduce((max, s) => Math.max(max, s.range ?? 0), 0);

  return { directionalAgreement, medianSignedDistance, neutralShare, maxRange, totalSamples };
}

export type VignetteStabilityStats = {
  classifiedCount: number;
  stableShare: number;
  softLeanShare: number;
  tornShare: number;
  unstableShare: number;
  avgDirectionalAgreement: number | null;
};

export function computeVignetteStability(
  conditionGroups: Map<string, string[]>,
  perScenario: Record<string, VarianceStats>,
): VignetteStabilityStats | null {
  let stable = 0;
  let softLean = 0;
  let torn = 0;
  let unstable = 0;
  const agreementValues: Array<{ value: number; weight: number }> = [];

  for (const [, scenarioIds] of conditionGroups) {
    const stats = aggregateConditionStats(scenarioIds, perScenario);
    if (stats == null) continue;

    const pattern = classifyRepeatPattern(
      stats.directionalAgreement,
      stats.medianSignedDistance,
      stats.neutralShare,
      stats.maxRange,
    );
    if (pattern == null) continue;

    // 'noisy' maps to unstable bucket; UI label is "Unstable"
    if (pattern === 'stable') stable++;
    else if (pattern === 'softLean') softLean++;
    else if (pattern === 'torn') torn++;
    else if (pattern === 'noisy') unstable++;

    agreementValues.push({ value: stats.directionalAgreement, weight: stats.totalSamples });
  }

  const classifiedCount = stable + softLean + torn + unstable;
  if (classifiedCount === 0) return null;

  const avgDirectionalAgreement = weightedMean(
    agreementValues.map((v) => ({ sampleCount: v.weight, value: v.value })),
  );

  return {
    classifiedCount,
    stableShare: stable / classifiedCount,
    softLeanShare: softLean / classifiedCount,
    tornShare: torn / classifiedCount,
    unstableShare: unstable / classifiedCount,
    avgDirectionalAgreement,
  };
}

export function averageVignetteStability(
  vignetteStats: VignetteStabilityStats[],
): {
  stableShare: number;
  softLeanShare: number;
  tornShare: number;
  unstableShare: number;
  avgDirectionalAgreement: number | null;
} | null {
  if (vignetteStats.length === 0) return null;

  const n = vignetteStats.length;
  const sum = (key: keyof VignetteStabilityStats): number =>
    vignetteStats.reduce((acc, s) => acc + (s[key] as number), 0);

  const agreements = vignetteStats
    .filter((s) => s.avgDirectionalAgreement != null)
    .map((s) => s.avgDirectionalAgreement as number);

  const avgDirectionalAgreement =
    agreements.length > 0
      ? agreements.reduce((a, b) => a + b, 0) / agreements.length
      : null;

  return {
    stableShare: sum('stableShare') / n,
    softLeanShare: sum('softLeanShare') / n,
    tornShare: sum('tornShare') / n,
    unstableShare: sum('unstableShare') / n,
    avgDirectionalAgreement,
  };
}
