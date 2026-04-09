import { db } from '@valuerank/db';
import { createAuditLog } from '../../../../services/audit/index.js';
import type {
  DomainEvaluationLaunchInput,
  DomainTrialRunResult,
} from '../types.js';
import { groupDefinitionsByPairKey } from './pair-grouping.js';
import { resolveDefinitionsForLaunch } from './resolve-definitions.js';
import { resolveModelsForLaunch } from './resolve-models.js';
import { checkForActiveEquivalentRun } from './active-run-check.js';
import { planLaunchSlots } from './plan-slots.js';
import { executeLaunchRuns } from './execute-runs.js';
import { recordLaunchResults } from './record-results.js';

export async function launchDomainEvaluation(input: DomainEvaluationLaunchInput): Promise<DomainTrialRunResult> {
  const {
    domainId,
    scopeCategory,
    temperature = null,
    maxBudgetUsd = null,
    definitionIds = [],
    modelIds = [],
    samplePercentage,
    samplesPerScenario,
    targetBatchCount = null,
    userId,
    log,
    auditOperationType,
  } = input;

  const {
    domain,
    allDefinitions,
    targetedDefinitions,
    latestDefinitionIds,
  } = await resolveDefinitionsForLaunch({
    domainId,
    requestedDefinitionIds: definitionIds,
  });

  if (allDefinitions.length === 0) {
    return {
      domainEvaluationId: null,
      scopeCategory,
      success: true,
      totalDefinitions: 0,
      targetedDefinitions: 0,
      startedRuns: 0,
      failedDefinitions: 0,
      skippedForBudget: 0,
      projectedCostUsd: 0,
      blockedByActiveLaunch: false,
      runs: [],
    };
  }

  const {
    selectedModels,
    normalizedModels,
    defaultModels,
  } = await resolveModelsForLaunch({
    requestedModelIds: modelIds,
  });

  if (targetBatchCount == null || targetBatchCount <= 0) {
    const blocked = await checkForActiveEquivalentRun({
      latestDefinitionIds,
      scopeCategory,
      temperature,
      normalizedModels,
      samplePercentage,
      samplesPerScenario,
    });
    if (blocked) {
      return {
        domainEvaluationId: null,
        scopeCategory,
        success: false,
        totalDefinitions: 0,
        targetedDefinitions: 0,
        startedRuns: 0,
        failedDefinitions: 0,
        skippedForBudget: 0,
        projectedCostUsd: 0,
        blockedByActiveLaunch: true,
        runs: [],
      };
    }
  }

  if (maxBudgetUsd !== undefined && maxBudgetUsd !== null && maxBudgetUsd <= 0) {
    throw new Error('maxBudgetUsd must be greater than 0 when provided.');
  }
  const budgetCap = maxBudgetUsd ?? null;

  const { groups: launchGroups, incompletePairKeys } = groupDefinitionsByPairKey(targetedDefinitions);
  for (const pairKey of incompletePairKeys) {
    log.warn(
      { domainId, pairKey },
      'Incomplete pair: companion definition not found. Launching as individual run.'
    );
  }

  const {
    launchSlots,
    launchableDefinitions,
    projectedCostUsd,
    skippedForBudget,
    estimatedCostByDefinitionId,
  } = await planLaunchSlots({
    groups: launchGroups,
    selectedModels,
    latestDefinitionIds,
    scopeCategory,
    temperature,
    samplePercentage,
    samplesPerScenario,
    targetBatchCount,
    budgetCap,
    normalizedModels,
  });

  let domainEvaluationId: string | null = null;
  if (launchableDefinitions.length > 0) {
    const evaluation = await db.domainEvaluation.create({
      data: {
        domainId,
        domainNameAtLaunch: domain.name,
        scopeCategory,
        status: 'PENDING',
        configSnapshot: {
          totalDefinitions: allDefinitions.length,
          targetedDefinitions: targetedDefinitions.length,
          requestedDefinitionIds: definitionIds,
          targetedDefinitionIds: latestDefinitionIds,
          launchableDefinitionIds: launchableDefinitions.map((definition) => definition.id),
          projectedCostUsd,
          skippedForBudget,
          models: selectedModels,
          temperature,
          maxBudgetUsd: budgetCap,
          samplePercentage,
          samplesPerScenario,
          targetBatchCount,
          defaultsOnly: modelIds.length === 0 && defaultModels.length > 0,
          runCategory: scopeCategory,
        },
        createdByUserId: userId,
      },
    });
    domainEvaluationId = evaluation.id;
  }

  const { startedRuns, failedDefinitions, runs } = await executeLaunchRuns({
    launchSlots,
    selectedModels,
    samplePercentage,
    samplesPerScenario,
    temperature,
    scopeCategory,
    userId,
    log,
    domainId,
  });

  if (domainEvaluationId !== null) {
    await recordLaunchResults({
      domainEvaluationId,
      runs,
      launchableDefinitions,
      domainId,
      startedRuns,
      failedDefinitions,
      allDefinitions,
      targetedDefinitions,
      latestDefinitionIds,
      definitionIds,
      projectedCostUsd,
      skippedForBudget,
      estimatedCostByDefinitionId,
      selectedModels,
      temperature,
      budgetCap,
      samplePercentage,
      samplesPerScenario,
      targetBatchCount,
      modelIds,
      defaultModels,
      scopeCategory,
    });
  }

  await createAuditLog({
    action: 'ACTION',
    entityType: 'Domain',
    entityId: domainId,
    userId,
    metadata: {
      operationType: auditOperationType,
      domainName: domain.name,
      scopeCategory,
      totalDefinitions: allDefinitions.length,
      targetedDefinitions: targetedDefinitions.length,
      requestedDefinitionIds: definitionIds,
      startedRuns,
      failedDefinitions,
      skippedForBudget,
      projectedCostUsd,
      blockedByActiveLaunch: false,
      models: selectedModels,
      temperature,
      maxBudgetUsd: budgetCap,
      samplePercentage,
      samplesPerScenario,
      targetBatchCount,
      defaultsOnly: modelIds.length === 0 && defaultModels.length > 0,
    },
  });

  return {
    domainEvaluationId,
    scopeCategory,
    success: failedDefinitions === 0,
    totalDefinitions: allDefinitions.length,
    targetedDefinitions: targetedDefinitions.length,
    startedRuns,
    failedDefinitions,
    skippedForBudget,
    projectedCostUsd,
    blockedByActiveLaunch: false,
    runs,
  };
}
