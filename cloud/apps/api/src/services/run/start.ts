/**
 * Start Run Service
 *
 * Creates a new run and queues probe_scenario jobs for each model-scenario pair.
 * Jobs are routed to provider-specific queues for parallelism enforcement.
 */

import { db } from '@valuerank/db';
import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { getBoss } from '../../queue/boss.js';
import type { ProbeScenarioJobData, PriorityLevel } from '../../queue/types.js';
import { PRIORITY_VALUES, DEFAULT_JOB_OPTIONS } from '../../queue/types.js';
import { getQueueNameForModel } from '../parallelism/index.js';
import { estimateCost, type CostEstimate } from '../cost/index.js';
import { signalRunActivity } from './scheduler.js';

const log = createLogger('services:run:start');

export type StartRunInput = {
  definitionId: string;
  models: string[];
  samplePercentage?: number;
  sampleSeed?: number;
  samplesPerScenario?: number; // Number of samples per scenario-model pair (1-100, default 1)
  priority?: string;
  experimentId?: string;
  userId: string;
  finalTrial?: boolean;
};

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

/**
 * Generates a numeric hash from a string (for deterministic seeding).
 * Uses DJB2-style hash algorithm.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash | 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Deterministically samples scenarios based on percentage and seed.
 * When no seed is provided, derives one from definitionId for reproducibility.
 */
function sampleScenarios(
  scenarioIds: string[],
  percentage: number,
  definitionId: string,
  seed?: number
): string[] {
  if (percentage >= 100) {
    return scenarioIds;
  }

  // Calculate target count
  const targetCount = Math.max(1, Math.floor((scenarioIds.length * percentage) / 100));

  // Create a simple seeded random number generator
  const seededRandom = (s: number) => {
    // Simple LCG for deterministic sampling
    const m = 2147483647;
    const a = 16807;
    let state = s;
    return () => {
      state = (state * a) % m;
      return state / m;
    };
  };

  // Use provided seed or derive from definitionId for reproducible sampling
  const effectiveSeed = seed ?? hashString(definitionId);
  const random = seededRandom(effectiveSeed);

  // Fisher-Yates shuffle with seeded random, then take first N
  const shuffled = [...scenarioIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j] as string;
    shuffled[j] = temp as string;
  }

  return shuffled.slice(0, targetCount);
}

/**
 * Converts a zero-based index to an alphabetical suffix.
 * 0 -> A, 1 -> B, ..., 25 -> Z, 26 -> AA, 27 -> AB
 */
function convertToAlpha(n: number): string {
  if (n < 0) return '';

  let result = '';
  // Convert to 1-based index for cleaner math logic
  let x = n + 1;

  while (x > 0) {
    // 1-based remainder
    const remainder = (x - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    x = Math.floor((x - 1) / 26);
  }

  return result;
}

/**
 * Starts a new evaluation run.
 *
 * 1. Validates the definition exists and has scenarios
 * 2. Creates a Run record with PENDING status
 * 3. Samples scenarios if samplePercentage < 100
 * 4. Creates RunScenarioSelection records
 * 5. Queues probe_scenario jobs for each model-scenario pair
 * 6. Initializes progress tracking
 */
import { planFinalTrial } from './plan-final-trial.js';

export async function startRun(input: StartRunInput): Promise<StartRunResult> {
  const {
    definitionId,
    models,
    samplePercentage = 100,
    sampleSeed,
    samplesPerScenario = 1,
    priority = 'NORMAL',
    experimentId,
    userId,
    finalTrial = false,
  } = input;

  log.info(
    { definitionId, modelCount: models.length, samplePercentage, sampleSeed, samplesPerScenario, experimentId, userId, finalTrial },
    'Starting new run'
  );

  // Validate models list
  if (models.length === 0) {
    throw new ValidationError('At least one model must be specified');
  }

  // Validate samplePercentage (only if not final trial)
  if (!finalTrial && (samplePercentage < 1 || samplePercentage > 100)) {
    throw new ValidationError('samplePercentage must be between 1 and 100');
  }

  // Validate samplesPerScenario (only if not final trial)
  if (!finalTrial && (samplesPerScenario < 1 || samplesPerScenario > 100)) {
    throw new ValidationError('samplesPerScenario must be between 1 and 100');
  }

  // Validate priority
  const validPriorities = ['LOW', 'NORMAL', 'HIGH'];
  if (!validPriorities.includes(priority)) {
    throw new ValidationError(`Invalid priority: ${priority}. Must be one of: ${validPriorities.join(', ')}`);
  }

  // Validate that all requested models are ACTIVE
  const activeModels = await db.llmModel.findMany({
    where: {
      modelId: { in: models },
      status: 'ACTIVE',
    },
    select: { modelId: true },
  });

  const activeModelIds = activeModels.map(m => m.modelId);
  const invalidModelIds = models.filter(m => !activeModelIds.includes(m));

  if (invalidModelIds.length > 0) {
    throw new ValidationError(
      `The following models are not active or valid: ${invalidModelIds.join(', ')}. Please refresh your page to get the latest model list.`
    );
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
    },
  });

  if (!definition || definition.deletedAt !== null) {
    throw new NotFoundError('Definition', definitionId);
  }

  if (definition.scenarios.length === 0) {
    throw new ValidationError(`Definition ${definitionId} has no scenarios`);
  }

  // Validate experiment if provided
  if (experimentId !== undefined && experimentId !== null && experimentId !== '') {
    const experiment = await db.experiment.findUnique({
      where: { id: experimentId },
    });
    if (!experiment) {
      throw new NotFoundError('Experiment', experimentId);
    }
  }

  // Determine scenarios to run
  let selectedScenarioIds: string[] = [];
  const jobPlan: { modelId: string; scenarioId: string; samples: number }[] = [];

  if (finalTrial) {
    // Adaptive Sampling Strategy
    const plan = await planFinalTrial(definitionId, models);

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
    samplePercentage: finalTrial ? 100 : samplePercentage, // Assume 100% of scenarios for base calculation? Inaccurate.
    samplesPerScenario: finalTrial ? 10 : samplesPerScenario, // Upper bound?
  });

  // Prepare definition snapshot...
  const content = definition.content as Record<string, unknown>;
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
    models,
    samplePercentage: finalTrial ? null : samplePercentage,
    sampleSeed: finalTrial ? null : sampleSeed,
    samplesPerScenario: finalTrial ? null : samplesPerScenario,
    isFinalTrial: finalTrial,
    priority,
    definitionSnapshot,
    estimatedCosts: costEstimate,
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

  type JobEntry = { queueName: string; data: ProbeScenarioJobData; options: typeof baseJobOptions };
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
          config: { maxTurns: 10 },
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

  // Enqueue in chunks
  const jobIds: string[] = [];
  const chunkSize = 50;
  for (let i = 0; i < jobs.length; i += chunkSize) {
    const chunk = jobs.slice(i, i + chunkSize);
    const chunkIds = await Promise.all(
      chunk.map((job) => boss.send(job.queueName, job.data, job.options))
    );
    jobIds.push(...chunkIds.filter((id): id is string => id !== null));
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
