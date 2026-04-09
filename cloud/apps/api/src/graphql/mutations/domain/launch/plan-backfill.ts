import { estimateCost as estimateCostService } from '../../../../services/cost/estimate.js';
import { normalizeModelSet } from '../types.js';
import { coverageKey, getCoverageCount } from './resolve-backfill.js';
import type {
  LaunchGroup,
  BackfillEvaluationSnapshot,
  BackfillLaunchGroupRepetition,
} from './types.js';
import { COUNTABLE_RUN_STATUSES } from './types.js';

export async function planBackfillGroups(params: {
  groups: LaunchGroup[];
  requestedModelIds: string[];
  members: Array<{ definitionIdAtLaunch: string; run: { status: string; config: unknown } }>;
  snapshot: BackfillEvaluationSnapshot;
  effectiveTargetBatchCount: number;
}): Promise<{
  backfillGroups: BackfillLaunchGroupRepetition[];
  projectedCostUsd: number;
}> {
  const { groups, requestedModelIds, members, snapshot, effectiveTargetBatchCount } = params;

  const countableCoverage = new Map<string, number>();
  for (const member of members) {
    if (!COUNTABLE_RUN_STATUSES.includes(member.run.status as typeof COUNTABLE_RUN_STATUSES[number])) continue;
    const runConfig = member.run.config as { models?: unknown } | null;
    const runModelIds = normalizeModelSet(runConfig?.models);
    for (const modelId of runModelIds) {
      const key = coverageKey(member.definitionIdAtLaunch, modelId);
      countableCoverage.set(key, (countableCoverage.get(key) ?? 0) + 1);
    }
  }

  const backfillGroups: BackfillLaunchGroupRepetition[] = [];
  const costEstimateCache = new Map<string, number>();
  let projectedCostUsd = 0;

  for (const group of groups) {
    for (const modelId of requestedModelIds) {
      const existingDepth = group.pairKey !== null
        ? group.definitions.reduce(
          (min, definition) => Math.min(min, getCoverageCount(countableCoverage, definition.id, modelId)),
          Number.POSITIVE_INFINITY,
        )
        : getCoverageCount(countableCoverage, group.definitions[0]!.id, modelId);

      const normalizedExistingDepth = Number.isFinite(existingDepth) ? existingDepth : 0;
      const delta = Math.max(0, effectiveTargetBatchCount - normalizedExistingDepth);
      if (delta === 0) continue;

      for (let index = 0; index < delta; index += 1) {
        backfillGroups.push({
          pairKey: group.pairKey,
          definitions: group.definitions,
          modelId,
        });
      }

      for (const definition of group.definitions) {
        const costKey = coverageKey(definition.id, modelId);
        let estimatedCost = costEstimateCache.get(costKey);
        if (estimatedCost == null) {
          const estimate = await estimateCostService({
            definitionId: definition.id,
            modelIds: [modelId],
            samplePercentage: snapshot.samplePercentage,
            samplesPerScenario: snapshot.samplesPerScenario,
          });
          estimatedCost = estimate.total;
          costEstimateCache.set(costKey, estimatedCost);
        }
        projectedCostUsd += estimatedCost * delta;
      }
    }
  }

  return { backfillGroups, projectedCostUsd };
}
