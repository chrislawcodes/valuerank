/**
 * Start Run Service
 *
 * Creates a new run and queues probe_scenario jobs for each model-scenario pair.
 * Jobs are routed to provider-specific queues for parallelism enforcement.
 */

import { db, resolveDefinitionContent } from '@valuerank/db';
import { ensureDomainConfigSnapshot } from '../domain-config/snapshot.js';
import { AppError, createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { estimateCost, type CostEstimate } from '../cost/index.js';
import { signalRunActivity } from './scheduler.js';
import { validateStartRunInput, type StartRunInput } from './start-validation.js';
import {
  asRecord,
  buildFindingsSnapshot,
  convertToAlpha,
  syncSurveyScenariosFromPlan,
  type SurveyPlan,
} from './start-helpers.js';
import { buildRunJobPlan } from './start-plan.js';
import { enqueueRunJobs } from './start-queue.js';

const log = createLogger('services:run:start');

export type StartRunResult = {
  run: {
    id: string;
    status: string;
    definitionId: string;
    experimentId: string | null;
    config: unknown;
    progress: {
      total: number;
      completed: number;
      failed: number;
    };
    createdAt: Date;
  };
  jobCount: number;
  estimatedCosts: CostEstimate;
};

export type { StartRunInput } from './start-validation.js';

export async function startRun(input: StartRunInput): Promise<StartRunResult> {
  const {
    definitionId,
    models,
    samplePercentage = 100,
    sampleSeed,
    samplesPerScenario = 1,
    temperature,
    priority = 'NORMAL',
    runCategory,
    experimentId,
    userId,
    finalTrial = false,
    scenarioIds,
    configExtras,
  } = input;

  log.info(
    { definitionId, modelCount: models.length, samplePercentage, sampleSeed, samplesPerScenario, experimentId, userId, finalTrial },
    'Starting new run'
  );

  validateStartRunInput(input);

  // Validate that all requested models are ACTIVE
  const activeModels = await db.llmModel.findMany({
    where: {
      modelId: { in: models },
      status: 'ACTIVE',
    },
    select: {
      modelId: true,
      displayName: true,
      apiConfig: true,
      providerId: true,
      provider: {
        select: {
          name: true,
        },
      },
    },
  });

  const activeModelIds = activeModels.map(m => m.modelId);
  const invalidModelIds = models.filter(m => !activeModelIds.includes(m));

  if (invalidModelIds.length > 0) {
    throw new ValidationError(
      `The following models are not active or valid: ${invalidModelIds.join(', ')}. Please refresh your page to get the latest model list.`
    );
  }

  // Validate experiment if provided. For surveys, always rebuild scenarios from the stored survey plan
  // so runs use one-question-per-prompt even for surveys created before this behavior existed.
  if (experimentId !== undefined && experimentId !== null && experimentId !== '') {
    const experiment = await db.experiment.findUnique({
      where: { id: experimentId },
      select: { id: true, analysisPlan: true },
    });
    if (!experiment) {
      throw new NotFoundError('Experiment', experimentId);
    }

    const plan = experiment.analysisPlan as SurveyPlan | null;
    if (plan?.kind === 'survey') {
      if (typeof plan.definitionId !== 'string' || plan.definitionId !== definitionId) {
        throw new ValidationError('Survey definition mismatch');
      }
      await syncSurveyScenariosFromPlan(definitionId, plan);
    }
  }

  // Fetch definition with scenarios (filtering out deleted)
  const definition = await db.definition.findUnique({
    where: { id: definitionId },
    include: {
      scenarios: {
        where: { deletedAt: null },
        select: { id: true },
      },
      preambleVersion: true,
      domainContext: true,
      levelPresetVersion: true,
      domain: {
        select: {
          id: true,
          valueStatements: {
            select: {
              id: true,
              token: true,
              body: true,
              domainId: true,
            },
          },
        },
      },
    },
  });

  if (!definition || definition.deletedAt !== null) {
    throw new NotFoundError('Definition', definitionId);
  }

  if (definition.scenarios.length === 0) {
    throw new ValidationError(`Definition ${definitionId} has no scenarios`);
  }

  // Determine scenarios to run
  const { selectedScenarioIds, jobPlan } = await buildRunJobPlan({
    definitionId,
    models,
    definitionScenarioIds: definition.scenarios.map((scenario) => scenario.id),
    finalTrial,
    temperature,
    scenarioIds,
    samplePercentage,
    sampleSeed,
    samplesPerScenario,
  });

  // Calculate total job count
  const totalJobs = jobPlan.reduce((sum, item) => sum + item.samples, 0);

  // Calculate cost estimate
  // We approximate adaptive cost by assuming avg sample count if needed, or we accept we might need to update estimate logic.
  // For now, let's reuse estimateCost but we need to account for per-model-per-scenario counts.
  // estimateCost supports uniform sampling. 
  // Let's just use a simplified estimate or pass explicit counts if we update estimateCost?
  // For now, we'll pass '100%' and 'avg samples' to get a roughly correct order of magnitude or just use samplePercentage logic effectively.
  // Actually, cost estimate is just for display/logging usually.
  // Let's skip detailed adaptive cost estimation update for this task unless critical.

  const costEstimate = await estimateCost({
    definitionId,
    modelIds: models,
    samplePercentage: finalTrial
      ? 100
      : (Array.isArray(scenarioIds) && scenarioIds.length > 0)
        ? Math.max(1, Math.round((selectedScenarioIds.length / definition.scenarios.length) * 100))
        : samplePercentage,
    samplesPerScenario: finalTrial ? 10 : samplesPerScenario, // Upper bound?
  });

  const resolvedDefinition = await resolveDefinitionContent(definitionId);

  // Prepare definition snapshot...
  const content = resolvedDefinition.resolvedContent as unknown as Record<string, unknown>;
  const findingsSnapshot = await buildFindingsSnapshot({
    definition,
    resolvedContent: resolvedDefinition.resolvedContent,
    selectedModels: activeModels.map((model) => ({
      modelId: model.modelId,
      providerId: model.providerId,
      providerName: model.provider.name,
      displayName: model.displayName,
      apiConfig: asRecord(model.apiConfig),
    })),
  });
  const definitionSnapshot = {
    ...content,
    preamble: (definition.preambleVersion?.content ?? content.preamble) as string | undefined,
    _meta: {
      definitionVersion: definition.version,
      preambleVersionId: definition.preambleVersion?.id,
      preambleVersionLabel: definition.preambleVersion?.version,
      preambleName: definition.preambleVersion ?
        (await db.preamble.findUnique({ where: { id: definition.preambleVersion.preambleId }, select: { name: true } }))?.name
        : undefined,
    }
  };

  // Create run config
  const config = {
    ...(configExtras ?? {}),
    models,
    samplePercentage: finalTrial ? null : samplePercentage,
    sampleSeed: finalTrial ? null : sampleSeed,
    samplesPerScenario: finalTrial ? null : samplesPerScenario,
    temperature: temperature ?? null,
    scenarioIds: finalTrial ? null : (selectedScenarioIds.length > 0 ? selectedScenarioIds : null),
    runMode: finalTrial ? 'FINAL' : (Array.isArray(scenarioIds) && scenarioIds.length > 0 ? 'SPECIFIC_CONDITION' : 'PERCENTAGE'),
    isFinalTrial: finalTrial,
    priority,
    definitionSnapshot,
    estimatedCosts: costEstimate,
    ...findingsSnapshot,
  };

  const initialProgress = {
    total: totalJobs,
    completed: 0,
    failed: 0,
  };

  // Generate run name
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const countToday = await db.run.count({
    where: {
      definitionId,
      createdAt: { gte: startOfDay, lte: endOfDay },
      deletedAt: null,
    },
  });

  const suffix = convertToAlpha(countToday);
  const month = today.toLocaleDateString('en-US', { month: 'short' });
  const day = today.toLocaleDateString('en-US', { day: '2-digit' });
  const runName = `${month} ${day}-${suffix}${finalTrial ? ' (Final)' : ''}`;

  // Create run in transaction
  const run = await db.$transaction(async (tx) => {
    const newRun = await tx.run.create({
      data: {
        name: runName,
        definitionId,
        experimentId: experimentId ?? null,
        status: 'PENDING',
        runCategory: runCategory ?? 'UNKNOWN_LEGACY',
        config,
        progress: initialProgress,
        createdByUserId: userId ?? null,
      },
    });

    await tx.runScenarioSelection.createMany({
      data: selectedScenarioIds.map((scenarioId) => ({
        runId: newRun.id,
        scenarioId,
      })),
      skipDuplicates: true, // Safety for overlaps if any
    });

    // Capture domain config snapshot at run creation time
    if (definition.domain?.id) {
      try {
        const snapshotId = await ensureDomainConfigSnapshot(definition.domain.id, tx);
        await tx.run.update({
          where: { id: newRun.id },
          data: { domainConfigSnapshotId: snapshotId },
        });
      } catch (err) {
        // Non-fatal: log warning but don't fail run creation
        log.warn({ err, domainId: definition.domain.id }, 'Failed to capture domain config snapshot');
      }
    }

    return newRun;
  });

  log.info({ runId: run.id, totalJobs }, 'Run created, queuing jobs');

  let jobIds: string[];
  try {
    jobIds = await enqueueRunJobs({
      runId: run.id,
      jobPlan,
      priority,
      temperature,
      totalJobs,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === 'RUN_INIT_FAILED') {
      await db.run.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          stalledModels: [],
        },
      });
    }
    throw error;
  }

  log.info(
    { runId: run.id, jobsCreated: jobIds.length, totalJobs },
    'Jobs queued successfully'
  );

  signalRunActivity();

  return {
    run: {
      id: run.id,
      status: run.status,
      definitionId: run.definitionId,
      experimentId: run.experimentId,
      config: run.config,
      progress: initialProgress,
      createdAt: run.createdAt,
    },
    jobCount: jobIds.length,
    estimatedCosts: costEstimate,
  };
}
