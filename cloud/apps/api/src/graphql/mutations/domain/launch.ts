import { randomUUID } from 'crypto';
import { db } from '@valuerank/db';
import type { Prisma } from '@valuerank/db';
import { createAuditLog } from '../../../services/audit/index.js';
import { startRun as startRunService } from '../../../services/run/index.js';
import { estimateCost as estimateCostService } from '../../../services/cost/estimate.js';
import { parseTemperature } from '../../../utils/temperature.js';
import { isValidPair, getComponentTokens } from '../../../utils/auto-pair.js';
import {
  type DomainEvaluationLaunchInput,
  type DomainTrialRunEntry,
  type DomainTrialRunResult,
  normalizeModelSet,
} from './types.js';
type DefinitionRow = {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId?: string | null;
  content: unknown;
};

function getLineageRootId(definition: DefinitionRow, definitionsById: Map<string, DefinitionRow>): string {
  let current = definition;
  const visited = new Set<string>([current.id]);

  while (current.parentId !== null) {
    const parent = definitionsById.get(current.parentId);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
  }

  return current.id;
}

function isNewerDefinition(left: DefinitionRow, right: DefinitionRow): boolean {
  if (left.version !== right.version) return left.version > right.version;
  const leftUpdated = left.updatedAt.getTime();
  const rightUpdated = right.updatedAt.getTime();
  if (leftUpdated !== rightUpdated) return leftUpdated > rightUpdated;
  return left.createdAt.getTime() > right.createdAt.getTime();
}

function selectLatestDefinitionPerLineage(
  definitions: DefinitionRow[],
  definitionsById: Map<string, DefinitionRow> = new Map(definitions.map((definition) => [definition.id, definition]))
): DefinitionRow[] {
  const latestByLineage = new Map<string, DefinitionRow>();

  for (const definition of definitions) {
    const lineageRootId = getLineageRootId(definition, definitionsById);
    const existing = latestByLineage.get(lineageRootId);
    if (!existing || isNewerDefinition(definition, existing)) {
      latestByLineage.set(lineageRootId, definition);
    }
  }

  return Array.from(latestByLineage.values());
}

async function hydrateDefinitionAncestors(definitions: DefinitionRow[]): Promise<Map<string, DefinitionRow>> {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));

  let missingParentIds = new Set(
    definitions
      .map((definition) => definition.parentId)
      .filter((parentId): parentId is string => parentId !== null && !definitionsById.has(parentId))
  );

  while (missingParentIds.size > 0) {
    const parentIdsBatch = Array.from(missingParentIds);
    missingParentIds = new Set<string>();

    const missingParents = await db.definition.findMany({
      where: { id: { in: parentIdsBatch } },
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

    for (const parent of missingParents) {
      if (definitionsById.has(parent.id)) continue;
      definitionsById.set(parent.id, parent);
      if (parent.parentId !== null && !definitionsById.has(parent.parentId)) {
        missingParentIds.add(parent.parentId);
      }
    }
  }

  return definitionsById;
}

type JobChoiceMethodology = {
  family: string;
  pair_key: string;
};

function extractJobChoiceMethodology(content: unknown): JobChoiceMethodology | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const m = (content as Record<string, unknown>).methodology;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const rec = m as Record<string, unknown>;
  if (
    rec.family !== 'job-choice' ||
    typeof rec.pair_key !== 'string' ||
    rec.pair_key === ''
  ) {
    return null;
  }
  return {
    family: 'job-choice',
    pair_key: rec.pair_key,
  };
}

type LaunchGroup = {
  pairKey: string | null;
  definitions: DefinitionRow[];
};

function groupDefinitionsByPairKey(definitions: DefinitionRow[]): {
  groups: LaunchGroup[];
  incompletePairKeys: string[];
} {
  const byPairKey = new Map<string, DefinitionRow[]>();
  const singles: DefinitionRow[] = [];

  for (const def of definitions) {
    const methodology = extractJobChoiceMethodology(def.content);
    if (methodology) {
      const bucket = byPairKey.get(methodology.pair_key) ?? [];
      bucket.push(def);
      byPairKey.set(methodology.pair_key, bucket);
    } else {
      singles.push(def);
    }
  }

  const groups: LaunchGroup[] = [];
  const incompletePairKeys: string[] = [];

  for (const [pairKey, defs] of byPairKey) {
    if (isValidPair(defs)) {
      groups.push({ pairKey, definitions: defs });
    } else {
      incompletePairKeys.push(pairKey);
      for (const def of defs) {
        singles.push(def);
      }
    }
  }

  for (const def of singles) {
    groups.push({ pairKey: null, definitions: [def] });
  }

  return { groups, incompletePairKeys };
}

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

  const domain = await db.domain.findUnique({ where: { id: domainId } });
  if (!domain) throw new Error(`Domain not found: ${domainId}`);

  const definitions = await db.definition.findMany({
    where: { domainId, deletedAt: null },
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

  if (definitions.length === 0) {
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

  const definitionsById = await hydrateDefinitionAncestors(definitions);
  const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
  const latestDefinitionById = new Map(latestDefinitions.map((definition) => [definition.id, definition]));
  const targetedDefinitions = definitionIds.length > 0
    ? definitionIds
      .map((definitionId) => latestDefinitionById.get(definitionId))
      .filter((definition): definition is DefinitionRow => definition !== undefined)
    : latestDefinitions;
  const latestDefinitionIds = targetedDefinitions.map((definition) => definition.id);

  const activeModels = await db.llmModel.findMany({
    where: {
      status: 'ACTIVE',
      ...(modelIds.length > 0 ? { modelId: { in: modelIds } } : {}),
    },
    select: { modelId: true, isDefault: true },
  });
  const defaultModels = activeModels.filter((model) => model.isDefault).map((model) => model.modelId);
  const fallbackModels = activeModels.map((model) => model.modelId);
  const selectedModels = modelIds.length > 0
    ? fallbackModels
    : (defaultModels.length > 0 ? defaultModels : fallbackModels);
  if (selectedModels.length === 0) {
    throw new Error('No active models are configured. Add an active model before starting a domain evaluation.');
  }
  const normalizedModels = selectedModels.slice().sort((left, right) => left.localeCompare(right));

  if (targetBatchCount == null || targetBatchCount <= 0) {
    const activeRuns = await db.run.findMany({
      where: {
        definitionId: { in: latestDefinitionIds },
        runCategory: scopeCategory,
        status: { in: ['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING'] },
        deletedAt: null,
      },
      select: {
        id: true,
        definitionId: true,
        config: true,
      },
    });
    const hasActiveEquivalentRun = activeRuns.some((run) => {
      const config = run.config as {
        models?: unknown;
        temperature?: unknown;
        samplePercentage?: unknown;
        samplesPerScenario?: unknown;
      } | null;
      const runModels = normalizeModelSet(config?.models);
      const runTemperature = parseTemperature(config?.temperature);
      const runSamplePercentage =
        typeof config?.samplePercentage === 'number' && Number.isFinite(config.samplePercentage)
          ? config.samplePercentage
          : null;
      const runSamplesPerScenario =
        typeof config?.samplesPerScenario === 'number' && Number.isFinite(config.samplesPerScenario)
          ? config.samplesPerScenario
          : null;

      return runTemperature === temperature
        && runModels.length === normalizedModels.length
        && runModels.every((modelId, index) => modelId === normalizedModels[index])
        && runSamplePercentage === samplePercentage
        && runSamplesPerScenario === samplesPerScenario;
    });
    if (hasActiveEquivalentRun) {
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

  const existingBatchCountByDefinitionId = new Map<string, number>();
  if (targetBatchCount != null && targetBatchCount > 0) {
    const COUNTABLE_STATUSES = ['COMPLETED', 'PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING'] as const;
    const existingRuns = await db.run.findMany({
      where: {
        definitionId: { in: latestDefinitionIds },
        runCategory: scopeCategory,
        status: { in: [...COUNTABLE_STATUSES] },
        deletedAt: null,
      },
      select: { definitionId: true, config: true },
    });
    for (const run of existingRuns) {
      const runConfig = run.config as {
        temperature?: unknown;
        models?: unknown;
        samplesPerScenario?: unknown;
      } | null;
      const runTemperature = parseTemperature(runConfig?.temperature);
      if (runTemperature !== temperature) continue;
      const runModels = normalizeModelSet(runConfig?.models);
      if (
        runModels.length !== normalizedModels.length ||
        !runModels.every((modelId, index) => modelId === normalizedModels[index])
      ) continue;
      const runSamplesPerScenario =
        typeof runConfig?.samplesPerScenario === 'number' && Number.isFinite(runConfig.samplesPerScenario)
          ? runConfig.samplesPerScenario
          : 1;
      if (runSamplesPerScenario !== samplesPerScenario) continue;
      const prev = existingBatchCountByDefinitionId.get(run.definitionId) ?? 0;
      existingBatchCountByDefinitionId.set(run.definitionId, prev + 1);
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
      'Incomplete job-choice pair: companion definition not found. Launching as individual run.'
    );
  }

  type LaunchSlot = { definition: DefinitionRow; configExtras: Record<string, unknown> | undefined };

  const launchSlots: LaunchSlot[] = [];
  const estimatedCostByDefinitionId = new Map<string, number>();
  let skippedForBudget = 0;
  let projectedCostUsd = 0;

  for (const group of launchGroups) {
    let delta = 1;
    if (targetBatchCount != null && targetBatchCount > 0) {
      if (group.pairKey !== null) {
        const pairMin = group.definitions.reduce(
          (min, def) => Math.min(min, existingBatchCountByDefinitionId.get(def.id) ?? 0),
          Number.POSITIVE_INFINITY,
        );
        delta = Math.max(0, targetBatchCount - (Number.isFinite(pairMin) ? pairMin : 0));
      } else {
        const def = group.definitions[0];
        const existing = def !== undefined ? (existingBatchCountByDefinitionId.get(def.id) ?? 0) : 0;
        delta = Math.max(0, targetBatchCount - existing);
      }
    }

    if (delta === 0) continue;

    if (budgetCap !== null) {
      let groupBaseCost = 0;
      for (const definition of group.definitions) {
        const estimate = await estimateCostService({
          definitionId: definition.id,
          modelIds: selectedModels,
          samplePercentage,
          samplesPerScenario,
        });
        estimatedCostByDefinitionId.set(definition.id, estimate.total);
        groupBaseCost += estimate.total;
      }
      const groupCost = groupBaseCost * delta;
      if (projectedCostUsd + groupCost > budgetCap) {
        skippedForBudget += group.definitions.length * delta;
        continue;
      }
      projectedCostUsd += groupCost;
    }

    for (let i = 0; i < delta; i++) {
      if (group.pairKey !== null) {
        const batchGroupId = randomUUID();
        for (const def of group.definitions) {
          const tokens = getComponentTokens(def.content);
          launchSlots.push({
            definition: def,
            configExtras: {
              jobChoiceLaunchMode: 'PAIRED_BATCH',
              jobChoiceBatchGroupId: batchGroupId,
              jobChoiceValueFirst: tokens?.value_first.token,
              methodologySafe: true,
            },
          });
        }
      } else {
        for (const def of group.definitions) {
          launchSlots.push({ definition: def, configExtras: undefined });
        }
      }
    }
  }

  const launchableDefinitions: DefinitionRow[] = Array.from(
    new Map(launchSlots.map((slot) => [slot.definition.id, slot.definition])).values(),
  );

  let domainEvaluationId: string | null = null;
  if (launchableDefinitions.length > 0) {
    const evaluation = await db.domainEvaluation.create({
      data: {
        domainId,
        domainNameAtLaunch: domain.name,
        scopeCategory,
        status: 'PENDING',
        configSnapshot: {
          totalDefinitions: definitions.length,
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
          defaultsOnly: modelIds.length === 0 && defaultModels.length > 0,
          runCategory: scopeCategory,
        },
        createdByUserId: userId,
      },
    });
    domainEvaluationId = evaluation.id;
  }

  let startedRuns = 0;
  let failedDefinitions = 0;
  const runs: DomainTrialRunEntry[] = [];

  for (let offset = 0; offset < launchSlots.length; offset += 25) {
    const batch = launchSlots.slice(offset, offset + 25);
    if (batch.length === 0) {
      continue;
    }

    const runResults = await Promise.allSettled(
      batch.map(async (slot) => {
        const { definition, configExtras } = slot;
        return startRunService({
          definitionId: definition.id,
          models: selectedModels,
          samplePercentage,
          samplesPerScenario,
          temperature: temperature ?? undefined,
          priority: 'NORMAL',
          runCategory: scopeCategory,
          userId,
          finalTrial: false,
          ...(configExtras !== undefined ? { configExtras } : {}),
        });
      })
    );

    runResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        startedRuns += 1;
        runs.push({
          definitionId: result.value.run.definitionId,
          runId: result.value.run.id,
          modelIds: selectedModels,
        });
        return;
      }
      failedDefinitions += 1;
      const failedSlot = batch[index];
      log.error(
        {
          domainId,
          definitionId: failedSlot?.definition.id ?? null,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          scopeCategory,
        },
        'Failed to start domain evaluation member run'
      );
    });
  }

  if (domainEvaluationId !== null) {
    const definitionById = new Map(
      launchableDefinitions.map((definition) => [definition.id, definition]),
    );

    if (runs.length > 0) {
      await db.domainEvaluationRun.createMany({
        data: runs.map((run) => {
          const definition = definitionById.get(run.definitionId);
          return {
            domainEvaluationId,
            runId: run.runId,
            definitionIdAtLaunch: run.definitionId,
            definitionNameAtLaunch: definition?.name ?? 'Untitled vignette',
            domainIdAtLaunch: domainId,
          };
        }),
      });
    }

    const status = startedRuns > 0 ? 'RUNNING' : 'FAILED';
    await db.domainEvaluation.update({
      where: { id: domainEvaluationId },
      data: {
        status,
        startedAt: startedRuns > 0 ? new Date() : null,
        completedAt: startedRuns > 0 ? null : new Date(),
        configSnapshot: {
          totalDefinitions: definitions.length,
          targetedDefinitions: targetedDefinitions.length,
          requestedDefinitionIds: definitionIds,
          targetedDefinitionIds: latestDefinitionIds,
          launchableDefinitionIds: launchableDefinitions.map((definition) => definition.id),
          projectedCostUsd,
          skippedForBudget,
          startedRuns,
          failedDefinitions,
          launchableDefinitionEstimatesUsd: Object.fromEntries(estimatedCostByDefinitionId),
          models: selectedModels,
          temperature,
          maxBudgetUsd: budgetCap,
          samplePercentage,
          samplesPerScenario,
          defaultsOnly: modelIds.length === 0 && defaultModels.length > 0,
          runCategory: scopeCategory,
        } as Prisma.InputJsonValue,
      },
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
      totalDefinitions: definitions.length,
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
      defaultsOnly: modelIds.length === 0 && defaultModels.length > 0,
    },
  });

  return {
    domainEvaluationId,
    scopeCategory,
    success: failedDefinitions === 0,
    totalDefinitions: definitions.length,
    targetedDefinitions: targetedDefinitions.length,
    startedRuns,
    failedDefinitions,
    skippedForBudget,
    projectedCostUsd,
    blockedByActiveLaunch: false,
    runs,
  };
}
