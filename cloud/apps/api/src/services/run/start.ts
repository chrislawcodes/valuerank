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
 * Starts a new evaluation run.
 *
 * 1. Validates the definition exists and has scenarios
 * 2. Creates a Run record with PENDING status
 * 3. Samples scenarios if samplePercentage < 100
 * 4. Creates RunScenarioSelection records
 * 5. Queues probe_scenario jobs for each model-scenario pair
 * 6. Initializes progress tracking
 */
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
  } = input;

  log.info(
    { definitionId, modelCount: models.length, samplePercentage, sampleSeed, samplesPerScenario, experimentId, userId },
    'Starting new run'
  );

  // Validate models list
  if (models.length === 0) {
    throw new ValidationError('At least one model must be specified');
  }

  // Validate samplePercentage
  if (samplePercentage < 1 || samplePercentage > 100) {
    throw new ValidationError('samplePercentage must be between 1 and 100');
  }

  // Validate samplesPerScenario
  if (samplesPerScenario < 1 || samplesPerScenario > 100) {
    throw new ValidationError('samplesPerScenario must be between 1 and 100');
  }

  // Validate priority
  const validPriorities = ['LOW', 'NORMAL', 'HIGH'];
  if (!validPriorities.includes(priority)) {
    throw new ValidationError(`Invalid priority: ${priority}. Must be one of: ${validPriorities.join(', ')}`);
  }

  // Fetch definition with scenarios (filtering out deleted)
  const definition = await db.definition.findUnique({
    where: { id: definitionId },
    include: {
      scenarios: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  });

  if (!definition || definition.deletedAt !== null) {
    throw new NotFoundError('Definition', definitionId);
  }

  if (definition.scenarios.length === 0) {
    throw new ValidationError(`Definition ${definitionId} has no scenarios`);
  }

  // Validate experiment if provided
  if (experimentId) {
    const experiment = await db.experiment.findUnique({
      where: { id: experimentId },
    });
    if (!experiment) {
      throw new NotFoundError('Experiment', experimentId);
    }
  }

  // Sample scenarios (deterministic by default - same definition + % = same sample)
  const allScenarioIds = definition.scenarios.map((s) => s.id);
  const selectedScenarioIds = sampleScenarios(allScenarioIds, samplePercentage, definitionId, sampleSeed);

  log.debug(
    { definitionId, totalScenarios: allScenarioIds.length, sampledScenarios: selectedScenarioIds.length },
    'Scenarios sampled'
  );

  // Calculate total job count (scenarios × models × samples)
  const totalJobs = selectedScenarioIds.length * models.length * samplesPerScenario;

  // Calculate cost estimate before creating run
  const costEstimate = await estimateCost({
    definitionId,
    modelIds: models,
    samplePercentage,
    samplesPerScenario,
  });

  log.debug(
    { definitionId, totalCost: costEstimate.total, isUsingFallback: costEstimate.isUsingFallback },
    'Cost estimate calculated'
  );

  // Create run config including cost estimate for historical reference
  const config = {
    models,
    samplePercentage,
    sampleSeed,
    samplesPerScenario,
    priority,
    definitionSnapshot: definition.content,
    estimatedCosts: costEstimate,
  };

  // Initial progress
  const initialProgress = {
    total: totalJobs,
    completed: 0,
    failed: 0,
  };

  // Create run in transaction
  const run = await db.$transaction(async (tx) => {
    // Create the run
    const newRun = await tx.run.create({
      data: {
        definitionId,
        experimentId: experimentId ?? null,
        status: 'PENDING',
        config,
        progress: initialProgress,
        createdByUserId: userId ?? null,
      },
    });

    // Create scenario selections
    await tx.runScenarioSelection.createMany({
      data: selectedScenarioIds.map((scenarioId) => ({
        runId: newRun.id,
        scenarioId,
      })),
    });

    return newRun;
  });

  log.info({ runId: run.id, totalJobs }, 'Run created, queuing jobs');

  // Queue jobs using PgBoss
  const boss = getBoss();
  const priorityValue = PRIORITY_VALUES[priority as PriorityLevel];
  const jobOptions = {
    ...DEFAULT_JOB_OPTIONS['probe_scenario'],
    priority: priorityValue,
  };

  // Create jobs with provider-specific queue routing for parallelism enforcement
  // For multi-sample runs, create samplesPerScenario jobs per scenario-model pair
  type JobEntry = { queueName: string; data: ProbeScenarioJobData; options: typeof jobOptions };
  const jobs: JobEntry[] = [];

  for (const modelId of models) {
    // Get the provider-specific queue for this model
    const queueName = await getQueueNameForModel(modelId);

    for (const scenarioId of selectedScenarioIds) {
      // Create N jobs for multi-sample runs (one per sample)
      for (let sampleIndex = 0; sampleIndex < samplesPerScenario; sampleIndex++) {
        jobs.push({
          queueName,
          data: {
            runId: run.id,
            scenarioId,
            modelId,
            sampleIndex,
            config: {
              temperature: 0.7, // Default, can be configured later
              maxTurns: 10,
            },
          },
          options: jobOptions,
        });
      }
    }
  }

  // Log queue distribution for debugging
  const queueCounts = new Map<string, number>();
  for (const job of jobs) {
    queueCounts.set(job.queueName, (queueCounts.get(job.queueName) ?? 0) + 1);
  }
  log.debug({ runId: run.id, queueDistribution: Object.fromEntries(queueCounts) }, 'Job queue distribution');

  // Send jobs to provider-specific queues in parallel chunks
  // This improves startup time for large multi-sample runs (e.g., 10 scenarios × 5 models × 10 samples = 500 jobs)
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

  // Signal run activity to ensure recovery scheduler is running
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
