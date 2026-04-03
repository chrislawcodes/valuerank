/**
 * Start Run Service
 *
 * Creates a new run and queues probe_scenario jobs for each model-scenario pair.
 * Jobs are routed to provider-specific queues for parallelism enforcement.
 */

import { db, resolveDefinitionContent } from '@valuerank/db';
import { ensureDomainConfigSnapshot } from '../domain-config/snapshot.js';
import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { estimateCost, type CostEstimate } from '../cost/index.js';
import { getBoss } from '../../queue/boss.js';
import { signalRunActivity } from './scheduler.js';
import { planFinalTrial } from './plan-final-trial.js';
import { validateStartRunInput, type StartRunInput } from './start-validation.js';
import {
  asRecord,
  bulkEnqueueJobs,
  buildFindingsSnapshot,
  convertToAlpha,
  enqueueJobs,
  sampleScenarios,
  syncSurveyScenariosFromPlan,
  type JobEntry,
  type SurveyPlan,
  RETRY_ENQUEUE_CHUNK_SIZE,
} from './start-helpers.js';
import type { PriorityLevel } from '../../queue/types.js';
import { PRIORITY_VALUES, DEFAULT_JOB_OPTIONS } from '../../queue/types.js';
import { getQueueNameForModel } from '../parallelism/index.js';

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
  let selectedScenarioIds: string[] = [];
  const jobPlan: { modelId: string; scenarioId: string; samples: number }[] = [];

  if (finalTrial) {
    // Adaptive Sampling Strategy
    const plan = await planFinalTrial(definitionId, models, temperature ?? null);

    // Flatten plan into job entries
    plan.models.forEach(modelPlan => {
      modelPlan.conditions.forEach(condition => {
        if (condition.neededSamples > 0) {
          jobPlan.push({
            modelId: modelPlan.modelId,
            scenarioId: condition.scenarioId,
            samples: condition.neededSamples
          });
        }
      });
    });

    // Collect unique scenario IDs involved for the RunScenarioSelection linkage
    selectedScenarioIds = Array.from(new Set(jobPlan.map(j => j.scenarioId)));

    log.info({ runPlanSize: jobPlan.length, scenariosInvolved: selectedScenarioIds.length }, 'Final Trial plan generated');
  } else if (Array.isArray(scenarioIds) && scenarioIds.length > 0) {
    const allScenarioIds = definition.scenarios.map((s) => s.id);
    const allScenarioIdSet = new Set(allScenarioIds);
    selectedScenarioIds = Array.from(new Set(scenarioIds));

    const invalidScenarioIds = selectedScenarioIds.filter((scenarioId) => !allScenarioIdSet.has(scenarioId));
    if (invalidScenarioIds.length > 0) {
      throw new ValidationError(
        `Invalid scenarioIds for definition ${definitionId}: ${invalidScenarioIds.join(', ')}`
      );
    }

    for (const modelId of models) {
      for (const scenarioId of selectedScenarioIds) {
        jobPlan.push({
          modelId,
          scenarioId,
          samples: samplesPerScenario,
        });
      }
    }

    log.debug(
      { definitionId, selectedScenarios: selectedScenarioIds.length },
      'Using explicit scenario selection'
    );
  } else {
    // Standard Percentage Sampling
    const allScenarioIds = definition.scenarios.map((s) => s.id);
    selectedScenarioIds = sampleScenarios(allScenarioIds, samplePercentage, definitionId, sampleSeed);

    // Create uniform plan
    for (const modelId of models) {
      for (const scenarioId of selectedScenarioIds) {
        jobPlan.push({
          modelId,
          scenarioId,
          samples: samplesPerScenario
        });
      }
    }

    log.debug(
      { definitionId, totalScenarios: allScenarioIds.length, sampledScenarios: selectedScenarioIds.length },
      'Scenarios sampled'
    );
  }

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

  // Queue jobs
  const boss = getBoss();
  const priorityValue = PRIORITY_VALUES[priority as PriorityLevel];
  const baseJobOptions = {
    ...DEFAULT_JOB_OPTIONS['probe_scenario'],
    priority: priorityValue,
  };

  const jobs: JobEntry[] = [];

  // Parallel queue resolution cache
  const queueNameCache = new Map<string, string>();
  const getQueue = async (mId: string) => {
    if (queueNameCache.has(mId)) return queueNameCache.get(mId)!;
    const q = await getQueueNameForModel(mId);
    queueNameCache.set(mId, q);
    return q;
  };

  for (const item of jobPlan) {
    const queueName = await getQueue(item.modelId);

    // Create N jobs based on 'samples' count
    // For adaptive sampling, we might want to start index at existing count?
    // Job 'sampleIndex' assumes 0-based index for NEW jobs. 
    // It acts as a differentiator.
    // If we use it for seeding, we might want to offset it.
    // For now, let's just push 0..N-1.
    for (let i = 0; i < item.samples; i++) {
      jobs.push({
        queueName,
        data: {
          runId: run.id,
          scenarioId: item.scenarioId,
          modelId: item.modelId,
          sampleIndex: i, // TODO: Consider offsetting if appending to existing results?
          config: {
            maxTurns: 10,
            ...(temperature !== undefined ? { temperature } : {}),
          },
        },
        options: baseJobOptions
      });
    }
  }

  // Log distribution
  const queueCounts = new Map<string, number>();
  for (const job of jobs) {
    queueCounts.set(job.queueName, (queueCounts.get(job.queueName) ?? 0) + 1);
  }
  log.debug({ runId: run.id, queueDistribution: Object.fromEntries(queueCounts) }, 'Job queue distribution');

  // Bulk-insert all jobs in a single INSERT per queue. Falls back to
  // individual boss.send() retries only for any jobs that failed to insert.
  const firstPass = await bulkEnqueueJobs(jobs);
  let jobIds = firstPass.jobIds;
  let remainingFailures = firstPass.failures;

  if (remainingFailures.length > 0) {
    log.warn(
      {
        runId: run.id,
        failedCount: remainingFailures.length,
        sampleFailures: remainingFailures.slice(0, 5).map((failure) => ({
          queueName: failure.job.queueName,
          modelId: failure.job.data.modelId,
          scenarioId: failure.job.data.scenarioId,
          sampleIndex: failure.job.data.sampleIndex,
          error: failure.error,
        })),
      },
      'Initial enqueue had dropped jobs; retrying failed jobs'
    );

    const retryPass = await enqueueJobs(
      remainingFailures.map((failure) => failure.job),
      (queueName, data, options) => boss.send(queueName, data, options),
      // Retry in smaller batches to reduce provider/queue backpressure bursts.
      RETRY_ENQUEUE_CHUNK_SIZE
    );

    jobIds = jobIds.concat(retryPass.jobIds);
    remainingFailures = retryPass.failures;
  }

  if (remainingFailures.length > 0 || jobIds.length !== totalJobs) {
    const failureReason = remainingFailures.length > 0
      ? `${remainingFailures.length} jobs failed to enqueue after retry`
      : `Expected ${totalJobs} jobs but only ${jobIds.length} were enqueued`;

    await db.run.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        stalledModels: [],
      },
    });
    // Any jobs that were already enqueued before failure are safely ignored by workers:
    // probe_scenario checks isRunTerminal(), which treats FAILED as terminal.

    log.error(
      {
        runId: run.id,
        totalJobs,
        enqueuedJobs: jobIds.length,
        remainingFailures: remainingFailures.slice(0, 10).map((failure) => ({
          queueName: failure.job.queueName,
          modelId: failure.job.data.modelId,
          scenarioId: failure.job.data.scenarioId,
          sampleIndex: failure.job.data.sampleIndex,
          error: failure.error,
        })),
      },
      'Run failed during enqueue integrity check'
    );

    throw new Error(`Run initialization failed: ${failureReason}`);
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
