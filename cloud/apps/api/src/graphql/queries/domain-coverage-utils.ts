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

  // Deduplicate paired batch group IDs across all definitions for this value pair.
  // A_first and B_first companion definitions share the same group ID, so summing
  // per-definition counts would double-count. Merge all group ID sets and count unique.
  let pairedBatchCount: number;
  if (pairedBatchGroupIdsByDefinitionId != null) {
    const mergedGroupIds = new Set<string>();
    let ungroupedCount = 0;
    for (const defId of uniqueDefinitionIds) {
      const groupIds = pairedBatchGroupIdsByDefinitionId.get(defId);
      if (groupIds != null) {
        for (const gid of groupIds) {
          mergedGroupIds.add(gid);
        }
      }
      // Add any ungrouped runs (pairedBatchCount minus grouped count)
      const defPairedCount = pairedBatchCountByDefinitionId.get(defId) ?? 0;
      const defGroupedCount = groupIds?.size ?? 0;
      ungroupedCount += Math.max(0, defPairedCount - defGroupedCount);
    }
    pairedBatchCount = mergedGroupIds.size + ungroupedCount;
  } else {
    // Fallback: sum per-definition counts (legacy behavior)
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
