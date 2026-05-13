import { db } from '@valuerank/db';
import { ValidationError } from '@valuerank/shared';
import { createAuditLog } from '../../../../services/audit/index.js';
import type {
  DomainEvaluationLaunchInput,
  DomainTrialRunEntry,
  DomainTrialRunResult,
} from '../types.js';
import { resolveDefinitionsForLaunch } from './resolve-definitions.js';
import { resolveModelsForLaunch } from './resolve-models.js';
import { checkForActiveEquivalentRun } from './active-run-check.js';
import { planLaunchSlots } from './plan-slots.js';

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
    throw new ValidationError('maxBudgetUsd must be greater than 0 when provided.');
  }
  const budgetCap = maxBudgetUsd ?? null;

  const launchGroups = targetedDefinitions.map((definition) => ({
    definitions: [definition],
  }));

  const {
    launchableDefinitions,
    projectedCostUsd,
    skippedForBudget,
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

  const startedRuns = 0;
  const failedDefinitions = 0;
  const runs: DomainTrialRunEntry[] = [];

  if (domainEvaluationId !== null) {
    const { getBoss } = await import('../../../../queue/boss.js');
    const { DEFAULT_JOB_OPTIONS } = await import('../../../../queue/types.js');
    const boss = getBoss();
    await boss.send(
      'start_domain_launch',
      { domainEvaluationId },
      {
        ...DEFAULT_JOB_OPTIONS['start_domain_launch'],
        singletonKey: domainEvaluationId,
      },
    );
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
      async: true,
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
    success: domainEvaluationId !== null,
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
