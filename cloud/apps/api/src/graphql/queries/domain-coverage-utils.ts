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
