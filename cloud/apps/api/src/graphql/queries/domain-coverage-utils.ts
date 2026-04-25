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

export function selectPrimaryDefinitionCounts(
  definitionIds: readonly string[],
  batchCountByDefinitionId: ReadonlyMap<string, number>,
  pairedBatchCountByDefinitionId: ReadonlyMap<string, number>,
  pairedBatchGroupIdsByDefinitionId?: ReadonlyMap<string, ReadonlySet<string>>,
  pairedBatchIncrementsByGroupId?: ReadonlyMap<string, ReadonlyMap<string, number>>,
): { primaryDefinitionId: string | null; batchCount: number; pairedBatchCount: number } {
  const uniqueDefinitionIds = Array.from(new Set(definitionIds));
  if (uniqueDefinitionIds.length === 0) {
    return { primaryDefinitionId: null, batchCount: 0, pairedBatchCount: 0 };
  }

  const primaryDefinitionId = uniqueDefinitionIds.reduce((best, defId) => {
    const bestBatchCount = batchCountByDefinitionId.get(best) ?? 0;
    const thisBatchCount = batchCountByDefinitionId.get(defId) ?? 0;
    if (thisBatchCount > bestBatchCount) {
      return defId;
    }
    if (thisBatchCount < bestBatchCount) {
      return best;
    }

    const bestPairedCount = pairedBatchCountByDefinitionId.get(best) ?? 0;
    const thisPairedCount = pairedBatchCountByDefinitionId.get(defId) ?? 0;
    if (thisPairedCount > bestPairedCount) {
      return defId;
    }
    if (thisPairedCount < bestPairedCount) {
      return best;
    }

    return defId.localeCompare(best) < 0 ? defId : best;
  }, uniqueDefinitionIds[0] ?? '');

  const batchCount = uniqueDefinitionIds.reduce(
    (total, defId) => total + (batchCountByDefinitionId.get(defId) ?? 0),
    0,
  );

  // Deduplicate paired batch counts across companion definitions.
  // A_first and B_first share the same group IDs, so we merge group→increment
  // maps and take the max increment per group (not sum). Ungrouped runs are summed.
  let pairedBatchCount: number;
  if (pairedBatchGroupIdsByDefinitionId != null && pairedBatchIncrementsByGroupId != null) {
    // Merge increments: for each group ID, take the max increment across definitions
    // (companions have the same sps, so max === any, but max is safer)
    const mergedIncrements = new Map<string, number>();
    let ungroupedTotal = 0;
    for (const defId of uniqueDefinitionIds) {
      const defIncrements = pairedBatchIncrementsByGroupId.get(defId);
      if (defIncrements != null) {
        for (const [gid, inc] of defIncrements) {
          mergedIncrements.set(gid, Math.max(mergedIncrements.get(gid) ?? 0, inc));
        }
      }
      // Ungrouped portion: pairedBatchCount minus grouped total for this definition
      const defPairedCount = pairedBatchCountByDefinitionId.get(defId) ?? 0;
      const defGroupedTotal = defIncrements != null
        ? Array.from(defIncrements.values()).reduce((sum, v) => sum + v, 0)
        : 0;
      ungroupedTotal += Math.max(0, defPairedCount - defGroupedTotal);
    }
    pairedBatchCount = Array.from(mergedIncrements.values()).reduce((sum, v) => sum + v, 0) + ungroupedTotal;
  } else if (pairedBatchGroupIdsByDefinitionId != null) {
    // Legacy path: group IDs available but no increment tracking — count unique groups
    const mergedGroupIds = new Set<string>();
    let ungroupedCount = 0;
    for (const defId of uniqueDefinitionIds) {
      const groupIds = pairedBatchGroupIdsByDefinitionId.get(defId);
      if (groupIds != null) {
        for (const gid of groupIds) {
          mergedGroupIds.add(gid);
        }
      }
      const defPairedCount = pairedBatchCountByDefinitionId.get(defId) ?? 0;
      const defGroupedCount = groupIds?.size ?? 0;
      ungroupedCount += Math.max(0, defPairedCount - defGroupedCount);
    }
    pairedBatchCount = mergedGroupIds.size + ungroupedCount;
  } else {
    // Fallback: sum per-definition counts
    pairedBatchCount = uniqueDefinitionIds.reduce(
      (total, defId) => total + (pairedBatchCountByDefinitionId.get(defId) ?? 0),
      0,
    );
  }

  return {
    primaryDefinitionId: primaryDefinitionId === '' ? null : primaryDefinitionId,
    batchCount,
    pairedBatchCount,
  };
}

export function getCoverageBatchIncrement(samplesPerScenario: unknown): number {
  return Number.isInteger(samplesPerScenario) && (samplesPerScenario as number) >= 1
    ? (samplesPerScenario as number)
    : 1;
}

export type CoverageModelBreakdown = { modelId: string; label: string; trialCount: number };

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
