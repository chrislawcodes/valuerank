import { db } from '@valuerank/db';
import { NotFoundError, ValidationError } from '@valuerank/shared';
import { createAuditLog } from '../../../../services/audit/index.js';
import type {
  DomainEvaluationModelBackfillInput,
  DomainTrialRunResult,
} from '../types.js';
import type { DefinitionRow } from './types.js';
import { groupDefinitionsByPairKey } from './pair-grouping.js';
import { getBackfillSnapshot } from './resolve-backfill.js';
import { planBackfillGroups } from './plan-backfill.js';
import { executeBackfillRuns } from './execute-runs.js';
import { recordBackfillResults } from './record-results.js';

export async function backfillDomainEvaluationModels(input: DomainEvaluationModelBackfillInput): Promise<DomainTrialRunResult> {
  const {
    domainEvaluationId,
    modelIds,
    definitionIds = [],
    targetBatchCount = null,
    userId,
    log,
    auditOperationType,
  } = input;

  if (modelIds.length === 0) {
    throw new ValidationError('Select at least one model to backfill.');
  }

  const effectiveTargetBatchCount = targetBatchCount != null && targetBatchCount > 0 ? targetBatchCount : 1;
  const uniqueRequestedModelIds = Array.from(new Set(modelIds.map((modelId) => modelId.trim()).filter((modelId) => modelId !== '')));
  if (uniqueRequestedModelIds.length === 0) {
    throw new ValidationError('Select at least one model to backfill.');
  }

  const execution = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('domain-evaluation-backfill'), hashtext(${domainEvaluationId}))`;

    const evaluation = await tx.domainEvaluation.findUnique({
      where: { id: domainEvaluationId },
      include: {
        members: {
          include: {
            run: {
              select: {
                id: true,
                status: true,
                config: true,
              },
            },
          },
        },
      },
    });
    if (!evaluation) {
      throw new NotFoundError('Domain evaluation', domainEvaluationId);
    }

    const snapshot = getBackfillSnapshot(evaluation.configSnapshot);
    if (!snapshot) {
      throw new ValidationError('This evaluation does not have enough saved launch settings to support model backfill.');
    }

    const allowedModelIds = new Set(snapshot.models);
    const invalidRequestedModels = uniqueRequestedModelIds.filter((modelId) => !allowedModelIds.has(modelId));
    if (invalidRequestedModels.length > 0) {
      throw new ValidationError(`Selected models are not part of this evaluation: ${invalidRequestedModels.join(', ')}`);
    }

    const activeModels = await tx.llmModel.findMany({
      where: {
        modelId: { in: uniqueRequestedModelIds },
        status: 'ACTIVE',
      },
      select: { modelId: true },
    });
    const activeModelIdSet = new Set(activeModels.map((model) => model.modelId));
    const inactiveRequestedModels = uniqueRequestedModelIds.filter((modelId) => !activeModelIdSet.has(modelId));
    if (inactiveRequestedModels.length > 0) {
      throw new ValidationError(`Selected models are not active: ${inactiveRequestedModels.join(', ')}`);
    }

    const launchableDefinitionIdSet = new Set(snapshot.launchableDefinitionIds);
    const uniqueRequestedDefinitionIds = Array.from(new Set(definitionIds.map((definitionId) => definitionId.trim()).filter((definitionId) => definitionId !== '')));
    const selectedDefinitionIds = uniqueRequestedDefinitionIds.length > 0 ? uniqueRequestedDefinitionIds : snapshot.launchableDefinitionIds;
    const outOfScopeDefinitionIds = selectedDefinitionIds.filter((definitionId) => !launchableDefinitionIdSet.has(definitionId));
    if (outOfScopeDefinitionIds.length > 0) {
      throw new ValidationError(`Selected vignettes are not part of this evaluation: ${outOfScopeDefinitionIds.join(', ')}`);
    }

    const domain = await tx.domain.findUnique({ where: { id: evaluation.domainId } });
    if (!domain) {
      throw new NotFoundError('Domain', evaluation.domainId);
    }

    const totalDefinitions = await tx.definition.count({
      where: { domainId: evaluation.domainId, deletedAt: null },
    });
    const selectedDefinitions: DefinitionRow[] = await tx.definition.findMany({
      where: {
        domainId: evaluation.domainId,
        deletedAt: null,
        id: { in: selectedDefinitionIds },
      },
      select: {
        id: true,
        name: true,
        parentId: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        content: true,
      },
    });
    const selectedDefinitionIdSet = new Set(selectedDefinitions.map((definition) => definition.id));
    const missingDefinitions = selectedDefinitionIds.filter((definitionId) => !selectedDefinitionIdSet.has(definitionId));
    if (missingDefinitions.length > 0) {
      throw new ValidationError(`Selected vignettes are missing or deleted: ${missingDefinitions.join(', ')}`);
    }

    const { groups: launchGroups, incompletePairKeys } = groupDefinitionsByPairKey(selectedDefinitions);
    if (incompletePairKeys.length > 0) {
      throw new ValidationError(`Backfill requires complete vignette pairs. Include both sides for: ${incompletePairKeys.join(', ')}`);
    }

    const { backfillGroups, projectedCostUsd } = await planBackfillGroups({
      groups: launchGroups,
      requestedModelIds: uniqueRequestedModelIds,
      members: evaluation.members,
      snapshot,
      effectiveTargetBatchCount,
    });

    if (backfillGroups.length === 0) {
      return {
        domainId: evaluation.domainId,
        domainName: domain.name,
        result: {
          domainEvaluationId: evaluation.id,
          scopeCategory: evaluation.scopeCategory,
          success: true,
          totalDefinitions,
          targetedDefinitions: selectedDefinitions.length,
          startedRuns: 0,
          failedDefinitions: 0,
          skippedForBudget: 0,
          projectedCostUsd: 0,
          blockedByActiveLaunch: false,
          runs: [],
        },
        selectedDefinitionIds,
      };
    }

    const { startedRuns, failedDefinitions, runs } = await executeBackfillRuns({
      backfillGroups,
      snapshot,
      scopeCategory: evaluation.scopeCategory,
      userId,
      log,
      domainEvaluationId,
      tx,
    });

    await recordBackfillResults({
      tx,
      evaluationId: evaluation.id,
      runs,
      selectedDefinitions,
      domainId: evaluation.domainId,
      snapshot,
      startedRuns,
      failedDefinitions,
      projectedCostUsd,
      evaluation,
    });

    return {
      domainId: evaluation.domainId,
      domainName: domain.name,
      result: {
        domainEvaluationId: evaluation.id,
        scopeCategory: evaluation.scopeCategory,
        success: failedDefinitions === 0,
        totalDefinitions,
        targetedDefinitions: selectedDefinitions.length,
        startedRuns,
        failedDefinitions,
        skippedForBudget: 0,
        projectedCostUsd,
        blockedByActiveLaunch: false,
        runs,
      },
      selectedDefinitionIds,
    };
  }, {
    timeout: 300_000,
    maxWait: 30_000,
  });

  await createAuditLog({
    action: 'ACTION',
    entityType: 'Domain',
    entityId: execution.domainId,
    userId,
    metadata: {
      operationType: auditOperationType,
      domainName: execution.domainName,
      domainEvaluationId,
      scopeCategory: execution.result.scopeCategory,
      requestedDefinitionIds: execution.selectedDefinitionIds,
      modelIds: uniqueRequestedModelIds,
      targetBatchCount: effectiveTargetBatchCount,
      startedRuns: execution.result.startedRuns,
      failedDefinitions: execution.result.failedDefinitions,
      projectedCostUsd: execution.result.projectedCostUsd,
    },
  });

  return execution.result;
}
