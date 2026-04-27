import { DOMAIN_ANALYSIS_VALUE_KEYS, extractValuePair, toPascalCaseKey, type DomainAnalysisValueKey } from './domain-analysis-values.js';

export const COVERAGE_VALUE_KEYS = DOMAIN_ANALYSIS_VALUE_KEYS;
export type CoverageValueKey = DomainAnalysisValueKey;
export { extractValuePair, toPascalCaseKey };

/**
 * Extract the two canonical value dimension names from a definition's resolved content JSON.
 * Returns null if the definition does not have exactly two recognized value dimensions.
 */
export function selectPrimaryDefinitionCount(
  definitionIds: readonly string[],
  batchCountByDefinitionId: ReadonlyMap<string, number>,
): { primaryDefinitionId: string | null; batchCount: number } {
  const uniqueDefinitionIds = Array.from(new Set(definitionIds));
  if (uniqueDefinitionIds.length === 0) {
    return { primaryDefinitionId: null, batchCount: 0 };
  }

  const primaryDefinitionId = uniqueDefinitionIds.reduce((best, defId) => {
    const bestCount = batchCountByDefinitionId.get(best) ?? 0;
    const thisCount = batchCountByDefinitionId.get(defId) ?? 0;
    return thisCount > bestCount ? defId : best;
  }, uniqueDefinitionIds[0] ?? '');

  return {
    primaryDefinitionId: primaryDefinitionId === '' ? null : primaryDefinitionId,
    batchCount: primaryDefinitionId === '' ? 0 : (batchCountByDefinitionId.get(primaryDefinitionId) ?? 0),
  };
}


export function getCoverageBatchIncrement(samplesPerScenario: unknown): number {
  return Number.isInteger(samplesPerScenario) && (samplesPerScenario as number) >= 1
    ? (samplesPerScenario as number)
    : 1;
}

export type CoverageModelBreakdown = { modelId: string; label: string; trialCount: number };
export type CoverageConditionBreakdown = { filledSlots: number; definitionIds: string[] };

/**
 * Deduplicate a list of runs by their paired-batch group ID.
 *
 * A-first and B-first companion definitions for the same value pair share the
 * same `jobChoiceBatchGroupId` / `pairedBatchGroupId`. When runs are collected
 * across both companion definitions and flattened into a single list, each paired
 * batch appears twice. Call this before any aggregation (trial counts, model
 * breakdowns, etc.) to ensure each batch is counted exactly once.
 *
 * Runs without a group ID (ungrouped / unpaired) are always kept.
 *
 * If `completenessOf` is provided, ties within a group are broken by preferring
 * the complete companion. When both companions are complete (or both incomplete)
 * the survivor is the one that appears first in input order. Callers that
 * depend on deterministic survivor selection should pre-sort by `createdAt`
 * (or another stable key) before calling.
 */
export function deduplicateRunsByGroupId<T extends { config: unknown }>(
  runs: ReadonlyArray<T>,
  completenessOf?: (run: T) => boolean,
): T[] {
  if (completenessOf == null) {
    const seenGroupIds = new Set<string>();
    return runs.filter((run) => {
      const groupId = getCoverageBatchGroupId(run.config);
      if (groupId === null) return true;
      if (seenGroupIds.has(groupId)) return false;
      seenGroupIds.add(groupId);
      return true;
    });
  }

  // Two-pass: first index every run by groupId, then pick the survivor with
  // a "prefer complete" rule. Ungrouped runs pass through.
  const groups = new Map<string, T[]>();
  const ungrouped: T[] = [];
  for (const run of runs) {
    const groupId = getCoverageBatchGroupId(run.config);
    if (groupId === null) {
      ungrouped.push(run);
      continue;
    }
    const existing = groups.get(groupId) ?? [];
    existing.push(run);
    groups.set(groupId, existing);
  }

  const survivors: T[] = [...ungrouped];
  for (const [, members] of groups) {
    if (members.length === 0) continue;
    const complete = members.find((member) => completenessOf(member));
    survivors.push(complete ?? members[0]!);
  }
  return survivors;
}

export function computePerModelTrialCounts(
  runs: ReadonlyArray<{ config: unknown; transcripts: ReadonlyArray<{ modelId: string }> }>,
  defaultModelIds: readonly string[],
  modelLabelById: ReadonlyMap<string, string>,
): { minTrialCount: number | null; maxTrialCount: number | null; modelBreakdown: CoverageModelBreakdown[] | null } {
  if (defaultModelIds.length === 0) {
    return { minTrialCount: null, maxTrialCount: null, modelBreakdown: null };
  }

  // Caller is responsible for deduplicating paired runs before passing them here.
  // Use deduplicateRunsByGroupId() at the call site when collecting runs across
  // companion definitions for the same value pair.
  //
  // We count actual transcript rows per model rather than the planned
  // `samplesPerScenario × runs-where-model-present` value. This keeps the
  // displayed trial count consistent with what the aggregate analysis pipeline
  // actually consumes (every transcript becomes a sample, including any
  // duplicates from worker retries or races -- see
  // aggregate-preparation.ts:202). If we kept the planned value, runs with
  // duplicate transcripts would silently have larger effective sample sizes
  // in analysis than the UI advertised.
  const trialCountByModel = new Map<string, number>(
    defaultModelIds.map((modelId) => [modelId, 0]),
  );

  for (const run of runs) {
    for (const transcript of run.transcripts) {
      if (trialCountByModel.has(transcript.modelId)) {
        trialCountByModel.set(transcript.modelId, (trialCountByModel.get(transcript.modelId) ?? 0) + 1);
      }
    }
  }

  const modelBreakdown: CoverageModelBreakdown[] = defaultModelIds.map((modelId) => ({
    modelId,
    label: modelLabelById.get(modelId) ?? modelId,
    trialCount: trialCountByModel.get(modelId) ?? 0,
  }));

  const counts = modelBreakdown.map((b) => b.trialCount);
  const minTrialCount = Math.min(...counts);
  const maxTrialCount = Math.max(...counts);

  return { minTrialCount, maxTrialCount, modelBreakdown };
}

export function getCoverageBatchGroupId(runConfig: unknown): string | null {
  const config = runConfig as {
    jobChoiceBatchGroupId?: unknown;
    pairedBatchGroupId?: unknown;
  } | null;

  const raw = typeof config?.jobChoiceBatchGroupId === 'string'
    ? config.jobChoiceBatchGroupId
    : typeof config?.pairedBatchGroupId === 'string'
      ? config.pairedBatchGroupId
      : null;

  return raw != null && raw.trim().length > 0 ? raw.trim() : null;
}

/**
 * Read the direction token off a Run's config. Returns null for missing,
 * blank, or non-string `jobChoiceValueFirst`. Trimmed.
 *
 * Defensive against any non-object input (number, boolean, etc.); returns
 * null without touching the value.
 */
export function getCoverageDirection(runConfig: unknown): string | null {
  if (typeof runConfig !== 'object' || runConfig === null) return null;
  const config = runConfig as { jobChoiceValueFirst?: unknown };
  if (typeof config.jobChoiceValueFirst !== 'string') return null;
  const trimmed = config.jobChoiceValueFirst.trim();
  if (trimmed.length === 0) return null;
  // Normalize to PascalCase_Underscore to match COVERAGE_VALUE_KEYS.
  // Prod stores tokens as lowercase (e.g. "hedonism"); keys are "Hedonism".
  return toPascalCaseKey(trimmed);
}

/**
 * Compute per-cell counts using the directional model.
 *
 * Sums `batchCount` across companion definitions (unchanged semantics).
 * Computes `pairedBatchCount = min(complete A-first, complete B-first)`
 * by merging per-direction Sets across companion definitions and taking
 * `min(set.size)` of the two directions. When >2 distinct directions
 * appear in the merged map (data corruption), takes min of the two
 * largest counts and emits a warning via `log.warn` (if provided).
 *
 * Computes `orphanedBatchCount = max - min` of the same two directional
 * counts used for `pairedBatchCount`. When only one direction is present,
 * the other side is treated as 0 and orphanedBatchCount equals the count
 * of the present side.
 *
 * Tie-break for `primaryDefinitionId`: `(batchCount desc, directionCount desc, defId asc)`
 * where `directionCount = directionalGroupsByDefinitionId.get(defId)?.size ?? 0`.
 */
export function selectPrimaryDefinitionCounts(
  definitionIds: readonly string[],
  batchCountByDefinitionId: ReadonlyMap<string, number>,
  directionalGroupsByDefinitionId: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>,
  valueA: string,
  valueB: string,
  log?: { warn: (obj: object, msg: string) => void },
  cellKey?: string,
): {
  primaryDefinitionId: string | null;
  batchCount: number;
  pairedBatchCount: number;
  orphanedBatchCount: number;
  aFirstBatchCount: number;
  bFirstBatchCount: number;
} {
  const uniqueDefinitionIds = Array.from(new Set(definitionIds));
  if (uniqueDefinitionIds.length === 0) {
    return {
      primaryDefinitionId: null,
      batchCount: 0,
      pairedBatchCount: 0,
      orphanedBatchCount: 0,
      aFirstBatchCount: 0,
      bFirstBatchCount: 0,
    };
  }

  const directionCountFor = (defId: string): number =>
    directionalGroupsByDefinitionId.get(defId)?.size ?? 0;

  const primaryDefinitionId = uniqueDefinitionIds.reduce((best, defId) => {
    const bestBatch = batchCountByDefinitionId.get(best) ?? 0;
    const thisBatch = batchCountByDefinitionId.get(defId) ?? 0;
    if (thisBatch > bestBatch) return defId;
    if (thisBatch < bestBatch) return best;

    const bestDirs = directionCountFor(best);
    const thisDirs = directionCountFor(defId);
    if (thisDirs > bestDirs) return defId;
    if (thisDirs < bestDirs) return best;

    return defId.localeCompare(best) < 0 ? defId : best;
  }, uniqueDefinitionIds[0] ?? '');

  const batchCount = uniqueDefinitionIds.reduce(
    (total, defId) => total + (batchCountByDefinitionId.get(defId) ?? 0),
    0,
  );

  // Merge per-direction Sets across companion definitions for this cell.
  const merged = new Map<string, Set<string>>();
  for (const defId of uniqueDefinitionIds) {
    const defMap = directionalGroupsByDefinitionId.get(defId);
    if (defMap == null) continue;
    for (const [direction, groupKeys] of defMap) {
      const existing = merged.get(direction) ?? new Set<string>();
      for (const key of groupKeys) existing.add(key);
      merged.set(direction, existing);
    }
  }

  let pairedBatchCount: number;
  let orphanedBatchCount: number;
  if (merged.size === 0) {
    pairedBatchCount = 0;
    orphanedBatchCount = 0;
  } else if (merged.size === 1) {
    const onlyCount = Array.from(merged.values())[0]!.size;
    pairedBatchCount = 0;
    orphanedBatchCount = onlyCount;
  } else if (merged.size === 2) {
    const counts = Array.from(merged.values()).map((s) => s.size);
    pairedBatchCount = Math.min(counts[0]!, counts[1]!);
    orphanedBatchCount = Math.max(counts[0]!, counts[1]!) - pairedBatchCount;
  } else {
    // >2 distinct direction tokens — data corruption. Take min of the two
    // largest counts and emit a warning. Do not throw; the operator should
    // still see a number.
    const sortedCounts = Array.from(merged.values())
      .map((s) => s.size)
      .sort((a, b) => b - a);
    pairedBatchCount = Math.min(sortedCounts[0]!, sortedCounts[1]!);
    orphanedBatchCount = sortedCounts[0]! - pairedBatchCount;
    if (log != null) {
      log.warn(
        { cellKey, directions: Array.from(merged.keys()), definitionIds: uniqueDefinitionIds },
        '>2 distinct jobChoiceValueFirst tokens in single coverage cell; using min of two largest',
      );
    }
  }

  const aFirstBatchCount = merged.get(valueA)?.size ?? 0;
  const bFirstBatchCount = merged.get(valueB)?.size ?? 0;

  return {
    primaryDefinitionId: primaryDefinitionId === '' ? null : primaryDefinitionId,
    batchCount,
    pairedBatchCount,
    orphanedBatchCount,
    aFirstBatchCount,
    bFirstBatchCount,
  };
}

type DirectionSetMap = ReadonlyMap<string, ReadonlySet<string>>;

function mergeDirectionSets(
  definitionIds: readonly string[],
  directionSetsByDefinitionId: ReadonlyMap<string, DirectionSetMap>,
): Map<string, Set<string>> {
  const merged = new Map<string, Set<string>>();

  for (const defId of new Set(definitionIds)) {
    const defMap = directionSetsByDefinitionId.get(defId);
    if (defMap == null) continue;

    for (const [direction, slotKeys] of defMap) {
      const existing = merged.get(direction) ?? new Set<string>();
      for (const slotKey of slotKeys) {
        existing.add(slotKey);
      }
      merged.set(direction, existing);
    }
  }

  return merged;
}

function collectDefinitionIdsForDirection(
  definitionIds: readonly string[],
  directionSetsByDefinitionId: ReadonlyMap<string, DirectionSetMap>,
  direction: string,
): string[] {
  const contributors = new Set<string>();

  for (const defId of new Set(definitionIds)) {
    const defMap = directionSetsByDefinitionId.get(defId);
    if (defMap == null) continue;
    const slotSet = defMap.get(direction);
    if (slotSet == null || slotSet.size === 0) continue;
    contributors.add(defId);
  }

  return Array.from(contributors).sort((left, right) => left.localeCompare(right));
}

export function computeConditionCounts(
  definitionIds: readonly string[],
  directionSetsByDefinitionId: ReadonlyMap<string, DirectionSetMap>,
): {
  pairedConditionCount: number;
  orphanedConditionCount: number;
  perDirection: Map<string, CoverageConditionBreakdown>;
} {
  const uniqueDefinitionIds = Array.from(new Set(definitionIds));
  if (uniqueDefinitionIds.length === 0) {
    return {
      pairedConditionCount: 0,
      orphanedConditionCount: 0,
      perDirection: new Map(),
    };
  }

  const merged = mergeDirectionSets(uniqueDefinitionIds, directionSetsByDefinitionId);
  const perDirection = new Map<string, CoverageConditionBreakdown>();

  for (const [direction, slotKeys] of merged) {
    perDirection.set(direction, {
      filledSlots: slotKeys.size,
      definitionIds: collectDefinitionIdsForDirection(uniqueDefinitionIds, directionSetsByDefinitionId, direction),
    });
  }

  let pairedConditionCount = 0;
  let orphanedConditionCount = 0;

  if (merged.size === 1) {
    const onlyCount = Array.from(merged.values())[0]!.size;
    orphanedConditionCount = onlyCount;
  } else if (merged.size >= 2) {
    // For >2 directions (corruption case), use the two largest slot sets — same
    // shape as selectPrimaryDefinitionCounts. The paired/orphaned semantics use
    // ACTUAL set intersection and symmetric difference, not just size comparison;
    // two equal-sized sets with disjoint slot identities (e.g. {s1,s2} vs {s3,s4})
    // must report 0 paired and 4 orphaned, not 2 paired and 0 orphaned.
    const sortedSets = Array.from(merged.values()).sort((left, right) => right.size - left.size);
    const slotsA = sortedSets[0]!;
    const slotsB = sortedSets[1]!;
    let intersectionSize = 0;
    for (const slot of slotsA) {
      if (slotsB.has(slot)) intersectionSize++;
    }
    pairedConditionCount = intersectionSize;
    // |A △ B| = |A| + |B| - 2|A ∩ B|
    orphanedConditionCount = slotsA.size + slotsB.size - 2 * intersectionSize;
  }

  return {
    pairedConditionCount,
    orphanedConditionCount,
    perDirection,
  };
}
