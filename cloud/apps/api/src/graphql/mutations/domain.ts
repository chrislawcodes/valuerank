import { builder } from '../builder.js';
import { db, Prisma } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { DomainRef } from '../types/domain.js';
import { createAuditLog } from '../../services/audit/index.js';
import { normalizeDomainName } from '../../utils/domain-name.js';
import { buildDefinitionWhere } from '../utils/definition-filters.js';
import { randomUUID } from 'crypto';
import { startRun as startRunService } from '../../services/run/index.js';
import { estimateCost as estimateCostService } from '../../services/cost/estimate.js';
import { parseTemperature } from '../../utils/temperature.js';
import {
  DOMAIN_TRIAL_DEFAULT_SAMPLE_PERCENTAGE,
  DOMAIN_TRIAL_DEFAULT_SAMPLES_PER_SCENARIO,
} from '../../services/run/config.js';

const MAX_DOMAIN_NAME_LENGTH = 120;
const MAX_BULK_ASSIGN_IDS = 5000;
const DOMAIN_TRIAL_RUN_BATCH_SIZE = 25;

type DomainMutationResult = {
  success: boolean;
  affectedDefinitions: number;
};

type DomainTrialRunResult = {
  domainEvaluationId: string | null;
  scopeCategory: string;
  success: boolean;
  totalDefinitions: number;
  targetedDefinitions: number;
  startedRuns: number;
  failedDefinitions: number;
  skippedForBudget: number;
  projectedCostUsd: number;
  blockedByActiveLaunch: boolean;
  runs: DomainTrialRunEntry[];
};

type DomainTrialRunEntry = {
  definitionId: string;
  runId: string;
  modelIds: string[];
};

type DomainEvaluationLaunchInput = {
  domainId: string;
  scopeCategory: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION';
  temperature?: number | null;
  maxBudgetUsd?: number | null;
  definitionIds?: string[];
  modelIds?: string[];
  samplePercentage: number;
  samplesPerScenario: number;
  userId: string;
  log: {
    error: (payload: Record<string, unknown>, message: string) => void;
  };
  auditOperationType: 'run-trials-for-domain' | 'start-domain-evaluation';
};

type RetryDomainTrialCellResult = {
  success: boolean;
  definitionId: string;
  modelId: string;
  runId: string | null;
  message: string | null;
};

const DomainMutationResultRef = builder.objectRef<DomainMutationResult>('DomainMutationResult');
const DomainTrialRunEntryRef = builder.objectRef<DomainTrialRunEntry>('DomainTrialRunEntry');
const DomainTrialRunResultRef = builder.objectRef<DomainTrialRunResult>('DomainTrialRunResult');
const RetryDomainTrialCellResultRef = builder.objectRef<RetryDomainTrialCellResult>('RetryDomainTrialCellResult');

builder.objectType(DomainMutationResultRef, {
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    affectedDefinitions: t.exposeInt('affectedDefinitions'),
  }),
});

builder.objectType(DomainTrialRunEntryRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    runId: t.exposeID('runId'),
    modelIds: t.exposeStringList('modelIds'),
  }),
});

builder.objectType(DomainTrialRunResultRef, {
  fields: (t) => ({
    domainEvaluationId: t.exposeID('domainEvaluationId', { nullable: true }),
    scopeCategory: t.exposeString('scopeCategory'),
    success: t.exposeBoolean('success'),
    totalDefinitions: t.exposeInt('totalDefinitions'),
    targetedDefinitions: t.exposeInt('targetedDefinitions'),
    startedRuns: t.exposeInt('startedRuns'),
    failedDefinitions: t.exposeInt('failedDefinitions'),
    skippedForBudget: t.exposeInt('skippedForBudget'),
    projectedCostUsd: t.exposeFloat('projectedCostUsd'),
    blockedByActiveLaunch: t.exposeBoolean('blockedByActiveLaunch'),
    runs: t.field({
      type: [DomainTrialRunEntryRef],
      resolve: (parent) => parent.runs,
    }),
  }),
});

builder.objectType(RetryDomainTrialCellResultRef, {
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    definitionId: t.exposeID('definitionId'),
    modelId: t.exposeString('modelId'),
    runId: t.exposeID('runId', { nullable: true }),
    message: t.exposeString('message', { nullable: true }),
  }),
});

function parseOptionalId(value: string | number | null | undefined, argName: string): string | null {
  if (value === undefined || value === null) return null;
  const id = String(value).trim();
  if (id === '') {
    throw new Error(`${argName} cannot be an empty string. Use null for unassignment.`);
  }
  return id;
}

function normalizeModelSet(models: unknown): string[] {
  if (!Array.isArray(models)) return [];
  return models
    .filter((model): model is string => typeof model === 'string')
    .sort((left, right) => left.localeCompare(right));
}

type DefinitionRow = {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId?: string | null;
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

async function launchDomainEvaluation(input: DomainEvaluationLaunchInput): Promise<DomainTrialRunResult> {
  const {
    domainId,
    scopeCategory,
    temperature = null,
    maxBudgetUsd = null,
    definitionIds = [],
    modelIds = [],
    samplePercentage,
    samplesPerScenario,
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
    throw new Error('Domain evaluation launch blocked: matching active work already exists for this scope, model selection, and temperature.');
  }

  if (maxBudgetUsd !== undefined && maxBudgetUsd !== null && maxBudgetUsd <= 0) {
    throw new Error('maxBudgetUsd must be greater than 0 when provided.');
  }
  const budgetCap = maxBudgetUsd ?? null;

  const launchableDefinitions: DefinitionRow[] = [];
  const estimatedCostByDefinitionId = new Map<string, number>();
  let skippedForBudget = 0;
  let projectedCostUsd = 0;

  for (const definition of targetedDefinitions) {
    if (budgetCap !== null) {
      const estimate = await estimateCostService({
        definitionId: definition.id,
        modelIds: selectedModels,
        samplePercentage,
        samplesPerScenario,
      });
      estimatedCostByDefinitionId.set(definition.id, estimate.total);
      if (projectedCostUsd + estimate.total > budgetCap) {
        skippedForBudget += 1;
        continue;
      }
      projectedCostUsd += estimate.total;
    }
    launchableDefinitions.push(definition);
  }

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

  for (let offset = 0; offset < launchableDefinitions.length; offset += DOMAIN_TRIAL_RUN_BATCH_SIZE) {
    const batch = launchableDefinitions.slice(offset, offset + DOMAIN_TRIAL_RUN_BATCH_SIZE);
    if (batch.length === 0) {
      continue;
    }

    const runResults = await Promise.allSettled(
      batch.map(async (definition) =>
        startRunService({
          definitionId: definition.id,
          models: selectedModels,
          samplePercentage,
          samplesPerScenario,
          temperature: temperature ?? undefined,
          priority: 'NORMAL',
          runCategory: scopeCategory,
          userId,
          finalTrial: false,
        })
      )
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
      const failedDefinition = batch[index];
      log.error(
        {
          domainId,
          definitionId: failedDefinition?.id ?? null,
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

builder.mutationField('createDomain', (t) =>
  t.field({
    type: DomainRef,
    args: {
      name: t.arg.string({
        required: true,
        validate: {
          minLength: [1, { message: 'Domain name is required' }],
          maxLength: [MAX_DOMAIN_NAME_LENGTH, { message: `Domain name must be ${MAX_DOMAIN_NAME_LENGTH} characters or less` }],
        },
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { displayName, normalizedName } = normalizeDomainName(args.name);
      if (displayName.length === 0) throw new Error('Domain name is required');
      let domain;
      try {
        domain = await db.domain.create({
          data: {
            name: displayName,
            normalizedName,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new Error(`Domain "${displayName}" already exists`);
        }
        throw error;
      }

      await createAuditLog({
        action: 'CREATE',
        entityType: 'Domain',
        entityId: domain.id,
        userId: ctx.user?.id ?? null,
        metadata: { name: domain.name },
      });

      return domain;
    },
  })
);

builder.mutationField('renameDomain', (t) =>
  t.field({
    type: DomainRef,
    args: {
      id: t.arg.id({ required: true }),
      name: t.arg.string({
        required: true,
        validate: {
          minLength: [1, { message: 'Domain name is required' }],
          maxLength: [MAX_DOMAIN_NAME_LENGTH, { message: `Domain name must be ${MAX_DOMAIN_NAME_LENGTH} characters or less` }],
        },
      }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const existing = await db.domain.findUnique({ where: { id } });
      if (!existing) throw new Error(`Domain not found: ${id}`);

      const { displayName, normalizedName } = normalizeDomainName(args.name);
      if (displayName.length === 0) throw new Error('Domain name is required');

      let updated;
      try {
        updated = await db.domain.update({
          where: { id },
          data: { name: displayName, normalizedName },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new Error(`Domain "${displayName}" already exists`);
        }
        throw error;
      }

      await createAuditLog({
        action: 'UPDATE',
        entityType: 'Domain',
        entityId: updated.id,
        userId: ctx.user?.id ?? null,
        metadata: { from: existing.name, to: updated.name },
      });

      return updated;
    },
  })
);

builder.mutationField('deleteDomain', (t) =>
  t.field({
    type: DomainMutationResultRef,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const existing = await db.domain.findUnique({ where: { id } });
      if (!existing) throw new Error(`Domain not found: ${id}`);

      const affectedDefinitions = await db.$transaction(async (tx) => {
        const unassignResult = await tx.definition.updateMany({
          where: { domainId: id, deletedAt: null },
          data: { domainId: null },
        });
        await tx.domain.delete({ where: { id } });
        return unassignResult.count;
      });

      await createAuditLog({
        action: 'DELETE',
        entityType: 'Domain',
        entityId: id,
        userId: ctx.user?.id ?? null,
        metadata: { name: existing.name, affectedDefinitions },
      });

      return { success: true, affectedDefinitions };
    },
  })
);

builder.mutationField('assignDomainToDefinitions', (t) =>
  t.field({
    type: DomainMutationResultRef,
    args: {
      definitionIds: t.arg.idList({ required: true }),
      domainId: t.arg.id({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const definitionIds = args.definitionIds.map(String);
      if (definitionIds.length === 0) return { success: true, affectedDefinitions: 0 };
      if (definitionIds.length > MAX_BULK_ASSIGN_IDS) {
        throw new Error(`Cannot assign more than ${MAX_BULK_ASSIGN_IDS} definitions in one request`);
      }

      const domainId = parseOptionalId(args.domainId, 'domainId');
      let domainName: string | null = null;
      if (domainId !== null) {
        const domain = await db.domain.findUnique({ where: { id: domainId } });
        if (!domain) throw new Error(`Domain not found: ${domainId}`);
        domainName = domain.name;
      }

      const result = await db.definition.updateMany({
        where: { id: { in: definitionIds }, deletedAt: null },
        data: { domainId },
      });

      await createAuditLog({
        action: 'ACTION',
        entityType: 'DefinitionDomain',
        entityId: randomUUID(),
        userId: ctx.user?.id ?? null,
        metadata: {
          operationType: 'bulk-ids',
          domainId,
          domainName,
          definitionIds,
          affectedDefinitions: result.count,
        },
      });

      return { success: true, affectedDefinitions: result.count };
    },
  })
);

builder.mutationField('assignDomainToDefinitionsByFilter', (t) =>
  t.field({
    type: DomainMutationResultRef,
    args: {
      domainId: t.arg.id({ required: false }),
      rootOnly: t.arg.boolean({ required: false }),
      search: t.arg.string({ required: false }),
      tagIds: t.arg.idList({ required: false }),
      hasRuns: t.arg.boolean({ required: false }),
      sourceDomainId: t.arg.id({ required: false }),
      withoutDomain: t.arg.boolean({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = parseOptionalId(args.domainId, 'domainId');
      let targetDomainName: string | null = null;
      if (domainId !== null) {
        const domain = await db.domain.findUnique({ where: { id: domainId } });
        if (!domain) throw new Error(`Domain not found: ${domainId}`);
        targetDomainName = domain.name;
      }

      const { where, empty } = await buildDefinitionWhere({
        rootOnly: args.rootOnly,
        search: args.search,
        tagIds: args.tagIds,
        hasRuns: args.hasRuns,
        domainId: parseOptionalId(args.sourceDomainId, 'sourceDomainId'),
        withoutDomain: args.withoutDomain,
      });
      if (empty) return { success: true, affectedDefinitions: 0 };

      const result = await db.definition.updateMany({
        where,
        data: { domainId },
      });

      await createAuditLog({
        action: 'ACTION',
        entityType: 'DefinitionDomain',
        entityId: randomUUID(),
        userId: ctx.user?.id ?? null,
        metadata: {
          operationType: 'bulk-filter',
          targetDomainId: domainId,
          targetDomainName,
          sourceDomainId: parseOptionalId(args.sourceDomainId, 'sourceDomainId'),
          withoutDomain: args.withoutDomain === true,
          search: args.search ?? null,
          tagIds: args.tagIds?.map(String) ?? [],
          rootOnly: args.rootOnly === true,
          hasRuns: args.hasRuns === true,
          affectedDefinitions: result.count,
        },
      });

      return { success: true, affectedDefinitions: result.count };
    },
  })
);

builder.mutationField('runTrialsForDomain', (t) =>
  t.field({
    type: DomainTrialRunResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      temperature: t.arg.float({ required: false }),
      maxBudgetUsd: t.arg.float({ required: false }),
      definitionIds: t.arg.idList({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }
      return launchDomainEvaluation({
        domainId: String(args.domainId),
        scopeCategory: 'PRODUCTION',
        temperature: args.temperature ?? null,
        maxBudgetUsd: args.maxBudgetUsd ?? null,
        definitionIds: args.definitionIds?.map(String) ?? [],
        samplePercentage: DOMAIN_TRIAL_DEFAULT_SAMPLE_PERCENTAGE,
        samplesPerScenario: DOMAIN_TRIAL_DEFAULT_SAMPLES_PER_SCENARIO,
        userId: ctx.user.id,
        log: ctx.log,
        auditOperationType: 'run-trials-for-domain',
      });
    },
  })
);

builder.mutationField('startDomainEvaluation', (t) =>
  t.field({
    type: DomainTrialRunResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      scopeCategory: t.arg.string({ required: false }),
      temperature: t.arg.float({ required: false }),
      maxBudgetUsd: t.arg.float({ required: false }),
      definitionIds: t.arg.idList({ required: false }),
      modelIds: t.arg.stringList({ required: false }),
      samplePercentage: t.arg.int({ required: false }),
      samplesPerScenario: t.arg.int({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const requestedScopeCategory = String(args.scopeCategory ?? 'PRODUCTION').trim().toUpperCase();
      const scopeCategory = ['PILOT', 'PRODUCTION', 'REPLICATION', 'VALIDATION'].includes(requestedScopeCategory)
        ? (requestedScopeCategory as DomainEvaluationLaunchInput['scopeCategory'])
        : 'PRODUCTION';

      return launchDomainEvaluation({
        domainId: String(args.domainId),
        scopeCategory,
        temperature: args.temperature ?? null,
        maxBudgetUsd: args.maxBudgetUsd ?? null,
        definitionIds: args.definitionIds?.map(String) ?? [],
        modelIds: args.modelIds?.map(String) ?? [],
        samplePercentage: args.samplePercentage ?? DOMAIN_TRIAL_DEFAULT_SAMPLE_PERCENTAGE,
        samplesPerScenario: args.samplesPerScenario ?? DOMAIN_TRIAL_DEFAULT_SAMPLES_PER_SCENARIO,
        userId: ctx.user.id,
        log: ctx.log,
        auditOperationType: 'start-domain-evaluation',
      });
    },
  }),
);

builder.mutationField('retryDomainTrialCell', (t) =>
  t.field({
    type: RetryDomainTrialCellResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      definitionId: t.arg.id({ required: true }),
      modelId: t.arg.string({ required: true }),
      temperature: t.arg.float({ required: false }),
      scopeCategory: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userId = ctx.user.id;
      const domainId = String(args.domainId);
      const definitionId = String(args.definitionId);
      const modelId = String(args.modelId);
      const requestedScopeCategory = String(args.scopeCategory ?? 'PRODUCTION').trim().toUpperCase();
      const scopeCategory = ['PILOT', 'PRODUCTION', 'REPLICATION', 'VALIDATION'].includes(requestedScopeCategory)
        ? (requestedScopeCategory as DomainEvaluationLaunchInput['scopeCategory'])
        : 'PRODUCTION';

      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw new Error(`Domain not found: ${domainId}`);

      const definition = await db.definition.findFirst({
        where: { id: definitionId, domainId, deletedAt: null },
        select: { id: true },
      });
      if (!definition) {
        throw new Error('Selected vignette is not part of this domain.');
      }

      const model = await db.llmModel.findFirst({
        where: { modelId, status: 'ACTIVE' },
        select: { modelId: true },
      });
      if (!model) {
        throw new Error(`Model is not active: ${modelId}`);
      }

      const activeRuns = await db.run.findMany({
        where: {
          definitionId,
          runCategory: scopeCategory,
          status: { in: ['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING'] },
          deletedAt: null,
        },
        select: { id: true, config: true },
      });
      const hasEquivalentActiveRun = activeRuns.some((run) => {
        const config = run.config as { models?: unknown; temperature?: unknown } | null;
        const runModels = normalizeModelSet(config?.models);
        const runTemperature = parseTemperature(config?.temperature);
        return runTemperature === (args.temperature ?? null)
          && runModels.length === 1
          && runModels[0] === modelId;
      });
      if (hasEquivalentActiveRun) {
        throw new Error('Retry blocked: this model/vignette cell already has an active run at the same temperature.');
      }

      const run = await startRunService({
        definitionId,
        models: [modelId],
        samplePercentage: DOMAIN_TRIAL_DEFAULT_SAMPLE_PERCENTAGE,
        samplesPerScenario: DOMAIN_TRIAL_DEFAULT_SAMPLES_PER_SCENARIO,
        temperature: args.temperature ?? undefined,
        priority: 'NORMAL',
        runCategory: scopeCategory,
        userId,
        finalTrial: false,
      });

      await createAuditLog({
        action: 'ACTION',
        entityType: 'Domain',
        entityId: domainId,
        userId,
        metadata: {
          operationType: 'retry-domain-trial-cell',
          domainName: domain.name,
          definitionId,
          modelId,
          scopeCategory,
          runId: run.run.id,
          temperature: args.temperature ?? null,
        },
      });

      return {
        success: true,
        definitionId,
        modelId,
        runId: run.run.id,
        message: null,
      };
    },
  })
);
