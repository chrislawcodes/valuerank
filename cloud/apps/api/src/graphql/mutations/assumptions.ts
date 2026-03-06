import { db } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { startRun as startRunService } from '../../services/run/index.js';
import { createAuditLog } from '../../services/audit/index.js';
import { parseTemperature } from '../../utils/temperature.js';
import { LOCKED_ASSUMPTION_VIGNETTES } from '../assumptions-constants.js';

type LaunchAssumptionsTempZeroPayload = {
  startedRuns: number;
  totalVignettes: number;
  modelCount: number;
  runIds: string[];
  failedVignetteIds: string[];
};

type ReviewOrderInvariancePairPayload = {
  pairId: string;
  reviewStatus: string;
  reviewedAt: Date;
};

type LaunchOrderInvariancePayload = {
  startedRuns: number;
  baselineRunsStarted: number;
  flippedRunsStarted: number;
  approvedPairs: number;
  modelCount: number;
  runIds: string[];
  failedDefinitionIds: string[];
};

type ExistingTranscriptRecord = {
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  createdAt: Date;
  run: {
    config: unknown;
    tags: Array<{ tag: { name: string } }>;
  };
};

function normalizeModelSet(models: unknown): string[] {
  if (!Array.isArray(models)) return [];
  return models
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .slice()
    .sort((left, right) => left.localeCompare(right));
}

function matchesAssumptionsTempZeroPackage(runConfig: unknown, modelIds: string[]): boolean {
  const config = runConfig as {
    assumptionKey?: unknown;
    models?: unknown;
    temperature?: unknown;
    samplePercentage?: unknown;
    runMode?: unknown;
  } | null;
  const configModels = normalizeModelSet(config?.models);
  const normalizedModelIds = [...modelIds].sort((left, right) => left.localeCompare(right));

  if (config?.assumptionKey === 'temp_zero_determinism') {
    return parseTemperature(config.temperature) === 0
      && configModels.length === normalizedModelIds.length
      && configModels.every((modelId, index) => modelId === normalizedModelIds[index]);
  }

  const samplePercentage = typeof config?.samplePercentage === 'number'
    ? config.samplePercentage
    : typeof config?.samplePercentage === 'string'
      ? Number(config.samplePercentage)
      : null;

  return parseTemperature(config?.temperature) === 0
    && config?.runMode === 'PERCENTAGE'
    && samplePercentage === 100
    && configModels.length === normalizedModelIds.length
    && configModels.every((modelId, index) => modelId === normalizedModelIds[index]);
}

type ScenarioRecord = {
  id: string;
  definitionId: string;
};

type TranscriptRecord = {
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  createdAt: Date;
};

const LaunchAssumptionsTempZeroPayloadRef = builder.objectRef<LaunchAssumptionsTempZeroPayload>('LaunchAssumptionsTempZeroPayload');
const ReviewOrderInvariancePairPayloadRef = builder.objectRef<ReviewOrderInvariancePairPayload>('ReviewOrderInvariancePairPayload');
const LaunchOrderInvariancePayloadRef = builder.objectRef<LaunchOrderInvariancePayload>('LaunchOrderInvariancePayload');

builder.objectType(LaunchAssumptionsTempZeroPayloadRef, {
  fields: (t) => ({
    startedRuns: t.exposeInt('startedRuns'),
    totalVignettes: t.exposeInt('totalVignettes'),
    modelCount: t.exposeInt('modelCount'),
    runIds: t.exposeStringList('runIds'),
    failedVignetteIds: t.exposeStringList('failedVignetteIds'),
  }),
});

builder.objectType(ReviewOrderInvariancePairPayloadRef, {
  fields: (t) => ({
    pairId: t.exposeID('pairId'),
    reviewStatus: t.exposeString('reviewStatus'),
    reviewedAt: t.expose('reviewedAt', { type: 'DateTime' }),
  }),
});

builder.objectType(LaunchOrderInvariancePayloadRef, {
  fields: (t) => ({
    startedRuns: t.exposeInt('startedRuns'),
    baselineRunsStarted: t.exposeInt('baselineRunsStarted'),
    flippedRunsStarted: t.exposeInt('flippedRunsStarted'),
    approvedPairs: t.exposeInt('approvedPairs'),
    modelCount: t.exposeInt('modelCount'),
    runIds: t.exposeStringList('runIds'),
    failedDefinitionIds: t.exposeStringList('failedDefinitionIds'),
  }),
});

function getAssumptionKey(config: unknown): string | null {
  if (!config || typeof config !== 'object') {
    return null;
  }
  const value = (config as Record<string, unknown>).assumptionKey;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function hasAssumptionRunTag(tags: Array<{ tag: { name: string } }>): boolean {
  return tags.some((entry) => entry.tag.name === 'assumption-run');
}

function createTranscriptGroupMap(records: ExistingTranscriptRecord[]): Map<string, ExistingTranscriptRecord[]> {
  const groups = new Map<string, ExistingTranscriptRecord[]>();

  for (const record of records) {
    if (record.scenarioId == null) continue;
    const key = `${record.modelId}::${record.scenarioId}`;
    const existing = groups.get(key) ?? [];
    existing.push(record);
    groups.set(key, existing);
  }

  for (const [key, group] of groups.entries()) {
    group.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const latestModelVersion = group[0]?.modelVersion ?? null;
    const sameVersionGroup = group.filter((record) => record.modelVersion === latestModelVersion);
    groups.set(key, sameVersionGroup);
  }

  return groups;
}

async function ensureAssumptionRunTag(runId: string, userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const tag = await tx.tag.upsert({
      where: { name: 'assumption-run' },
      update: {},
      create: {
        name: 'assumption-run',
        createdByUserId: userId,
      },
    });

    await tx.runTag.createMany({
      data: [{ runId, tagId: tag.id }],
      skipDuplicates: true,
    });
  });
}

builder.mutationField('launchAssumptionsTempZero', (t) =>
  t.field({
    type: LaunchAssumptionsTempZeroPayloadRef,
    args: {
      force: t.arg.boolean({ required: false, defaultValue: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userId = ctx.user.id;
      const domain = await db.domain.findFirst({
        where: { normalizedName: 'professional' },
        select: { id: true, name: true },
      });
      if (!domain) {
        throw new Error('Professional domain not found');
      }

      const definitions = await db.definition.findMany({
        where: {
          id: { in: LOCKED_ASSUMPTION_VIGNETTES.map((vignette) => vignette.id) },
          domainId: domain.id,
          deletedAt: null,
        },
        select: {
          id: true,
          scenarios: {
            where: { deletedAt: null },
            select: {
              id: true,
              definitionId: true,
            },
          },
        },
      });
      if (definitions.length === 0) {
        throw new Error('No locked professional-domain vignettes are available for temp=0 confirmation.');
      }

      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: { modelId: true, isDefault: true },
      });
      const defaultModels = activeModels.filter((model) => model.isDefault).map((model) => model.modelId);
      const fallbackModels = activeModels.map((model) => model.modelId);
      const models = (defaultModels.length > 0 ? defaultModels : fallbackModels).slice().sort((left, right) => left.localeCompare(right));
      if (models.length === 0) {
        throw new Error('No active models are configured. Add an active model before launching temp=0 confirmation runs.');
      }

      const activeRuns = await db.run.findMany({
        where: {
          definitionId: { in: definitions.map((definition) => definition.id) },
          status: { in: ['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING'] },
          deletedAt: null,
        },
        select: {
          config: true,
        },
      });

      const hasActiveEquivalentRun = activeRuns.some((run) => {
        return matchesAssumptionsTempZeroPackage(run.config, models);
      });
      if (hasActiveEquivalentRun) {
        throw new Error('Temp=0 confirmation launch blocked: matching dedicated runs are already active.');
      }

      const runIds: string[] = [];
      const failedVignetteIds: string[] = [];
      const skippedVignetteIds: string[] = [];

      let definitionsToLaunch: Array<{ definitionId: string; samplesPerScenario: number }>;

      if (args.force !== true) {
        const completedRuns = await db.run.findMany({
          where: {
            definitionId: { in: definitions.map((definition) => definition.id) },
            status: 'COMPLETED',
            deletedAt: null,
          },
          select: {
            id: true,
            definitionId: true,
            config: true,
          },
        });
        const qualifyingCompletedRunIds = completedRuns
          .filter((run) => matchesAssumptionsTempZeroPackage(run.config, models))
          .map((run) => run.id);

        const transcripts = qualifyingCompletedRunIds.length > 0 ? await db.transcript.findMany({
          where: {
            runId: { in: qualifyingCompletedRunIds },
            modelId: { in: models },
            scenarioId: { not: null },
            deletedAt: null,
            decisionCode: { in: ['1', '2', '3', '4', '5'] },
          },
          select: {
            scenarioId: true,
            modelId: true,
            modelVersion: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }) : [];

        const transcriptGroups = new Map<string, TranscriptRecord[]>();
        for (const transcript of transcripts) {
          if (transcript.scenarioId === null) continue;
          const key = `${transcript.modelId}::${transcript.scenarioId}`;
          const existing = transcriptGroups.get(key) ?? [];
          existing.push(transcript);
          transcriptGroups.set(key, existing);
        }
        for (const [key, group] of transcriptGroups.entries()) {
          group.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
          const latestModelVersion = group[0]?.modelVersion ?? null;
          const sameVersionGroup = group.filter((transcript) => transcript.modelVersion === latestModelVersion);
          transcriptGroups.set(key, sameVersionGroup.slice(0, 3));
        }

        definitionsToLaunch = definitions.map((definition) => {
          const scenarios = definition.scenarios as ScenarioRecord[];
          let existingBatchFloor = 3;

          if (scenarios.length === 0 || models.length === 0) {
            existingBatchFloor = 0;
          } else {
            for (const scenario of scenarios) {
              for (const modelId of models) {
                const count = (transcriptGroups.get(`${modelId}::${scenario.id}`) ?? []).length;
                if (count < existingBatchFloor) {
                  existingBatchFloor = count;
                }
                if (existingBatchFloor === 0) break;
              }
              if (existingBatchFloor === 0) break;
            }
          }

          return {
            definitionId: definition.id,
            samplesPerScenario: Math.max(0, 3 - Math.min(existingBatchFloor, 3)),
          };
        });
      } else {
        definitionsToLaunch = definitions.map((definition) => ({
          definitionId: definition.id,
          samplesPerScenario: 3,
        }));
      }

      const results = await Promise.allSettled(
        definitionsToLaunch
          .filter((definition) => {
            if (definition.samplesPerScenario === 0) {
              skippedVignetteIds.push(definition.definitionId);
              return false;
            }
            return true;
          })
          .map(async (definition) => {
          const result = await startRunService({
            definitionId: definition.definitionId,
            models,
            samplePercentage: 100,
            samplesPerScenario: definition.samplesPerScenario,
            temperature: 0,
            priority: 'NORMAL',
            userId,
            finalTrial: false,
            configExtras: {
              assumptionKey: 'temp_zero_determinism',
            },
          });

          return result.run.id;
        }),
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          runIds.push(result.value);
          return;
        }
        const launchedDefinitions = definitionsToLaunch.filter((definition) => definition.samplesPerScenario > 0);
        failedVignetteIds.push(launchedDefinitions[index]!.definitionId);
        ctx.log.error(
          {
            definitionId: launchedDefinitions[index]!.definitionId,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          },
          'Failed to launch temp=0 confirmation run',
        );
      });

      void createAuditLog({
        action: 'ACTION',
        entityType: 'Domain',
        entityId: domain.id,
        userId,
        metadata: {
          operationType: 'launch-assumptions-temp-zero',
          domainName: domain.name,
          definitionIds: definitions.map((definition) => definition.id),
          startedRuns: runIds.length,
          failedVignetteIds,
          skippedVignetteIds,
          models,
          temperature: 0,
          launchedSamplesPerScenario: definitionsToLaunch
            .filter((definition) => definition.samplesPerScenario > 0)
            .map((definition) => ({
              definitionId: definition.definitionId,
              samplesPerScenario: definition.samplesPerScenario,
            })),
        },
      });

      return {
        startedRuns: runIds.length,
        totalVignettes: definitions.length,
        modelCount: models.length,
        runIds,
        failedVignetteIds,
      };
    },
  }),
);

builder.mutationField('launchOrderInvariance', (t) =>
  t.field({
    type: LaunchOrderInvariancePayloadRef,
    args: {
      force: t.arg.boolean({ required: false, defaultValue: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userId = ctx.user.id;
      const lockedDefinitionIds = LOCKED_ASSUMPTION_VIGNETTES.map((vignette) => vignette.id);
      const expectedSourceScenarios = await db.scenario.findMany({
        where: {
          definitionId: { in: lockedDefinitionIds },
          deletedAt: null,
          orientationFlipped: false,
        },
        select: {
          id: true,
          definitionId: true,
        },
      });
      const expectedPairCount = expectedSourceScenarios.length;
      const expectedByDefinition = new Map<string, number>();
      for (const scenario of expectedSourceScenarios) {
        expectedByDefinition.set(
          scenario.definitionId,
          (expectedByDefinition.get(scenario.definitionId) ?? 0) + 1,
        );
      }

      const approvedPairs = await db.assumptionScenarioPair.findMany({
        where: {
          assumptionKey: 'order_invariance',
          equivalenceReviewStatus: 'APPROVED',
          equivalenceReviewedAt: { not: null },
          sourceScenario: {
            definitionId: { in: lockedDefinitionIds },
            deletedAt: null,
          },
          variantScenario: {
            deletedAt: null,
          },
        },
        select: {
          sourceScenario: {
            select: {
              id: true,
              definitionId: true,
            },
          },
          variantScenario: {
            select: {
              id: true,
              definitionId: true,
            },
          },
        },
      });

      if (approvedPairs.length === 0) {
        throw new Error('No approved order-invariance pairs are available to launch.');
      }

      const domain = await db.domain.findFirst({
        where: { normalizedName: 'professional' },
        select: { id: true },
      });
      if (!domain) {
        throw new Error('Professional domain not found');
      }

      const approvedPairCount = approvedPairs.length;
      const approvedByDefinition = new Map<string, { sourceScenarioIds: Set<string>; variantScenarioIds: Set<string> }>();
      const approvedCountsByDefinition = new Map<string, number>();
      for (const pair of approvedPairs) {
        const definitionId = pair.sourceScenario.definitionId;
        const existing = approvedByDefinition.get(definitionId) ?? {
          sourceScenarioIds: new Set<string>(),
          variantScenarioIds: new Set<string>(),
        };
        existing.sourceScenarioIds.add(pair.sourceScenario.id);
        existing.variantScenarioIds.add(pair.variantScenario.id);
        approvedByDefinition.set(definitionId, existing);
        approvedCountsByDefinition.set(
          definitionId,
          (approvedCountsByDefinition.get(definitionId) ?? 0) + 1,
        );
      }

      const hasCompleteApprovedSet = approvedPairCount === expectedPairCount
        && approvedByDefinition.size === lockedDefinitionIds.length
        && expectedByDefinition.size === lockedDefinitionIds.length
        && lockedDefinitionIds.every((definitionId) => (
          (approvedCountsByDefinition.get(definitionId) ?? 0) === (expectedByDefinition.get(definitionId) ?? 0)
        ));
      if (!hasCompleteApprovedSet && args.force !== true) {
        throw new Error('Launch blocked: all generated order-invariance condition pairs must be approved across the full locked vignette set.');
      }

      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: { modelId: true, isDefault: true },
      });
      const defaultModels = activeModels.filter((model) => model.isDefault).map((model) => model.modelId);
      const fallbackModels = activeModels.map((model) => model.modelId);
      const models = (defaultModels.length > 0 ? defaultModels : fallbackModels)
        .slice()
        .sort((left, right) => left.localeCompare(right));
      if (models.length === 0) {
        throw new Error('No active models are configured. Add an active model before launching order-invariance runs.');
      }

      const requiredScenarioIds = Array.from(new Set(approvedPairs.flatMap((pair) => [
        pair.sourceScenario.id,
        pair.variantScenario.id,
      ])));

      const activeRuns = await db.run.findMany({
        where: {
          definitionId: { in: Array.from(approvedByDefinition.keys()) },
          status: { in: ['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING'] },
          deletedAt: null,
        },
        select: {
          config: true,
        },
      });
      const hasActiveEquivalentRun = activeRuns.some((run) => {
        const config = run.config as { scenarioIds?: unknown; assumptionKey?: unknown } | null;
        if (config?.assumptionKey !== 'order_invariance') {
          return false;
        }
        if (!Array.isArray(config?.scenarioIds)) {
          return true;
        }
        return config.scenarioIds.some((scenarioId) => (
          typeof scenarioId === 'string' && requiredScenarioIds.includes(scenarioId)
        ));
      });
      if (hasActiveEquivalentRun) {
        throw new Error('Order-invariance launch blocked: matching dedicated runs are already active.');
      }

      const completedTranscripts = await db.transcript.findMany({
        where: {
          deletedAt: null,
          decisionCode: { in: ['1', '2', '3', '4', '5'] },
          scenarioId: { in: requiredScenarioIds },
          modelId: { in: models },
          run: {
            status: 'COMPLETED',
            deletedAt: null,
            definitionId: { in: Array.from(approvedByDefinition.keys()) },
          },
        },
        select: {
          scenarioId: true,
          modelId: true,
          modelVersion: true,
          createdAt: true,
          run: {
            select: {
              config: true,
              tags: {
                select: {
                  tag: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      const baselineRecords = (completedTranscripts as ExistingTranscriptRecord[]).filter((record) => {
        const assumptionKey = getAssumptionKey(record.run.config);
        if (assumptionKey === 'temp_zero_determinism') {
          return true;
        }
        return assumptionKey === 'order_invariance' && hasAssumptionRunTag(record.run.tags);
      });
      const flippedRecords = (completedTranscripts as ExistingTranscriptRecord[]).filter((record) => (
        getAssumptionKey(record.run.config) === 'order_invariance' && hasAssumptionRunTag(record.run.tags)
      ));

      const baselineGroups = createTranscriptGroupMap(baselineRecords);
      const flippedGroups = createTranscriptGroupMap(flippedRecords);

      const launches: Array<{
        definitionId: string;
        scenarioIds: string[];
        samplesPerScenario: number;
        runType: 'baseline' | 'fully_flipped';
      }> = [];

      for (const [definitionId, definitionGroup] of approvedByDefinition.entries()) {
        let baselineFloor = 5;
        let flippedFloor = 5;

        for (const scenarioId of definitionGroup.sourceScenarioIds) {
          for (const modelId of models) {
            const count = (baselineGroups.get(`${modelId}::${scenarioId}`) ?? []).length;
            if (count < baselineFloor) {
              baselineFloor = count;
            }
            if (baselineFloor === 0) break;
          }
          if (baselineFloor === 0) break;
        }

        for (const scenarioId of definitionGroup.variantScenarioIds) {
          for (const modelId of models) {
            const count = (flippedGroups.get(`${modelId}::${scenarioId}`) ?? []).length;
            if (count < flippedFloor) {
              flippedFloor = count;
            }
            if (flippedFloor === 0) break;
          }
          if (flippedFloor === 0) break;
        }

        const baselineNeeded = Math.max(0, 5 - Math.min(baselineFloor, 5));
        const flippedNeeded = Math.max(0, 5 - Math.min(flippedFloor, 5));

        if (baselineNeeded > 0) {
          launches.push({
            definitionId,
            scenarioIds: Array.from(definitionGroup.sourceScenarioIds).sort(),
            samplesPerScenario: baselineNeeded,
            runType: 'baseline',
          });
        }

        if (flippedNeeded > 0) {
          launches.push({
            definitionId,
            scenarioIds: Array.from(definitionGroup.variantScenarioIds).sort(),
            samplesPerScenario: flippedNeeded,
            runType: 'fully_flipped',
          });
        }
      }

      if (launches.length === 0) {
        return {
          startedRuns: 0,
          baselineRunsStarted: 0,
          flippedRunsStarted: 0,
          approvedPairs: approvedPairCount,
          modelCount: models.length,
          runIds: [],
          failedDefinitionIds: [],
        };
      }

      const runIds: string[] = [];
      const failedDefinitionIds: string[] = [];
      let baselineRunsStarted = 0;
      let flippedRunsStarted = 0;

      const results = await Promise.allSettled(
        launches.map(async (launch) => {
          const result = await startRunService({
            definitionId: launch.definitionId,
            models,
            samplePercentage: 100,
            samplesPerScenario: launch.samplesPerScenario,
            scenarioIds: launch.scenarioIds,
            temperature: 0,
            priority: 'NORMAL',
            userId,
            finalTrial: false,
            configExtras: {
              assumptionKey: 'order_invariance',
              assumptionRunType: launch.runType,
            },
          });

          await ensureAssumptionRunTag(result.run.id, userId);

          return {
            runId: result.run.id,
            runType: launch.runType,
            definitionId: launch.definitionId,
          };
        }),
      );

      results.forEach((result, index) => {
        const launch = launches[index]!;
        if (result.status === 'fulfilled') {
          runIds.push(result.value.runId);
          if (result.value.runType === 'baseline') {
            baselineRunsStarted += 1;
          } else {
            flippedRunsStarted += 1;
          }
          return;
        }

        failedDefinitionIds.push(launch.definitionId);
        ctx.log.error(
          {
            definitionId: launch.definitionId,
            runType: launch.runType,
            scenarioCount: launch.scenarioIds.length,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          },
          'Failed to launch order-invariance run',
        );
      });

      void createAuditLog({
        action: 'ACTION',
        entityType: 'Domain',
        entityId: domain.id,
        userId,
        metadata: {
          operationType: 'launch-order-invariance',
          approvedPairs: approvedPairCount,
          models,
          temperature: 0,
          launches,
          startedRuns: runIds.length,
          failedDefinitionIds,
        },
      });

      return {
        startedRuns: runIds.length,
        baselineRunsStarted,
        flippedRunsStarted,
        approvedPairs: approvedPairCount,
        modelCount: models.length,
        runIds,
        failedDefinitionIds: Array.from(new Set(failedDefinitionIds)).sort(),
      };
    },
  }),
);

builder.mutationField('reviewOrderInvariancePair', (t) =>
  t.field({
    type: ReviewOrderInvariancePairPayloadRef,
    args: {
      pairId: t.arg.id({ required: true }),
      reviewStatus: t.arg.string({ required: true }),
      reviewNotes: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const pairId = String(args.pairId);

      const reviewStatus = args.reviewStatus === 'APPROVED' || args.reviewStatus === 'REJECTED'
        ? args.reviewStatus
        : null;
      if (reviewStatus == null) {
        throw new Error('Review status must be APPROVED or REJECTED.');
      }

      const existingPair = await db.assumptionScenarioPair.findUnique({
        where: { id: pairId },
        select: {
          id: true,
          assumptionKey: true,
          sourceScenarioId: true,
        },
      });
      if (!existingPair || existingPair.assumptionKey !== 'order_invariance') {
        throw new Error('Order-invariance pair not found.');
      }
      const sourceScenario = await db.scenario.findUnique({
        where: { id: existingPair.sourceScenarioId },
        select: { definitionId: true },
      });
      if (!sourceScenario || !LOCKED_ASSUMPTION_VIGNETTES.some((vignette) => vignette.id === sourceScenario.definitionId)) {
        throw new Error('Order-invariance review is limited to the locked vignette package.');
      }

      const siblingPairs = await db.assumptionScenarioPair.findMany({
        where: {
          assumptionKey: 'order_invariance',
          sourceScenario: {
            definitionId: sourceScenario.definitionId,
            deletedAt: null,
          },
          variantScenario: {
            deletedAt: null,
          },
        },
        select: { id: true },
      });
      if (siblingPairs.length === 0) {
        throw new Error('No reviewable order-invariance pairs were found for this vignette.');
      }

      const reviewedAt = new Date();
      const trimmedNotes = args.reviewNotes?.trim() ?? '';
      const reviewer = await db.user.findUnique({
        where: { id: ctx.user.id },
        select: { id: true, name: true, email: true },
      });

      await db.assumptionScenarioPair.updateMany({
        where: {
          id: { in: siblingPairs.map((pair) => pair.id) },
        },
        data: {
          equivalenceReviewStatus: reviewStatus,
          equivalenceReviewedBy: reviewer?.name?.trim() || reviewer?.email || ctx.user.id,
          equivalenceReviewedAt: reviewedAt,
          equivalenceReviewNotes: trimmedNotes === '' ? null : trimmedNotes,
        },
      });

      return {
        pairId,
        reviewStatus,
        reviewedAt,
      };
    },
  }),
);
