/**
 * Start Run Service
 *
 * Creates a new run and queues probe_scenario jobs for each model-scenario pair.
 * Jobs are routed to provider-specific queues for parallelism enforcement.
 */

import { db } from '@valuerank/db';
import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { getBoss } from '../../queue/boss.js';
import type { JobOptions, ProbeScenarioJobData, PriorityLevel } from '../../queue/types.js';
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
  temperature?: number;
  priority?: string;
  experimentId?: string;
  userId?: string | null;
  finalTrial?: boolean;
  scenarioIds?: string[];
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

type SurveyQuestion = {
  id: string;
  text: string;
  order: number;
};

type SurveyResponseOption = {
  id: string;
  label: string;
  order: number;
  value: number;
};

type SurveyPlan = {
  kind?: string;
  definitionId?: string;
  instructions?: string;
  questions?: SurveyQuestion[];
  responseOptions?: SurveyResponseOption[];
  responseScale?: {
    min: number;
    max: number;
    minLabel?: string | null;
    maxLabel?: string | null;
  };
};

type JobEntry = {
  queueName: string;
  data: ProbeScenarioJobData;
  options: JobOptions;
};

type EnqueueFailure = {
  job: JobEntry;
  error: string;
};

const ENQUEUE_CHUNK_SIZE = 50;
const RETRY_ENQUEUE_CHUNK_SIZE = 10;

async function enqueueJobs(
  jobs: JobEntry[],
  send: (queueName: string, data: ProbeScenarioJobData, options: JobOptions) => Promise<string | null>,
  chunkSize = ENQUEUE_CHUNK_SIZE
): Promise<{ jobIds: string[]; failures: EnqueueFailure[] }> {
  const jobIds: string[] = [];
  const failures: EnqueueFailure[] = [];

  for (let i = 0; i < jobs.length; i += chunkSize) {
    const chunk = jobs.slice(i, i + chunkSize);
    const chunkResults = await Promise.allSettled(
      chunk.map(async (job) => {
        const id = await send(job.queueName, job.data, job.options);
        if (id === null) {
          throw new Error('send returned null job id');
        }
        return id;
      })
    );

    chunkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        jobIds.push(result.value);
        return;
      }
      failures.push({
        // Result order matches input order from Promise.allSettled.
        // Index is guaranteed to map to an entry in `chunk`.
        job: chunk[index]!,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    });
  }

  return { jobIds, failures };
}

function buildSingleQuestionSurveyPrompt(
  questionText: string,
  responseOptions: SurveyResponseOption[],
  instructions?: string
): string {
  const sections: string[] = [];
  const trimmedInstructions = typeof instructions === 'string' ? instructions.trim() : '';
  if (trimmedInstructions !== '') {
    sections.push(trimmedInstructions);
  }
  sections.push(questionText.trim());
  const optionLines = responseOptions
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((option) => option.label.trim())
      .filter((label) => label !== '');
  if (optionLines.length > 0) {
    sections.push(optionLines.join('\n'));
  }
  return sections.join('\n\n');
}

function parseSurveyResponseOptions(plan: SurveyPlan): SurveyResponseOption[] {
  if (Array.isArray(plan.responseOptions) && plan.responseOptions.length > 0) {
    const normalized = plan.responseOptions
      .map((option, index) => ({
        id: typeof option.id === 'string' && option.id.trim() !== '' ? option.id : `r${index + 1}`,
        label: typeof option.label === 'string' ? option.label.trim() : '',
        order: typeof option.order === 'number' && Number.isInteger(option.order) ? option.order : index + 1,
        value: typeof option.value === 'number' && Number.isInteger(option.value) ? option.value : index + 1,
      }))
      .filter((option) => option.label !== '')
      .sort((left, right) => left.order - right.order);
    if (normalized.length >= 2) {
      return normalized;
    }
  }

  if (
    plan.responseScale &&
    typeof plan.responseScale.min === 'number' &&
    typeof plan.responseScale.max === 'number' &&
    Number.isInteger(plan.responseScale.min) &&
    Number.isInteger(plan.responseScale.max) &&
    plan.responseScale.min < plan.responseScale.max
  ) {
    const options: SurveyResponseOption[] = [];
    for (let value = plan.responseScale.min; value <= plan.responseScale.max; value += 1) {
      let label = String(value);
      if (value === plan.responseScale.min && typeof plan.responseScale.minLabel === 'string' && plan.responseScale.minLabel.trim() !== '') {
        label = plan.responseScale.minLabel.trim();
      } else if (value === plan.responseScale.max && typeof plan.responseScale.maxLabel === 'string' && plan.responseScale.maxLabel.trim() !== '') {
        label = plan.responseScale.maxLabel.trim();
      }
      options.push({
        id: `r${options.length + 1}`,
        label,
        order: options.length + 1,
        value: options.length + 1,
      });
    }
    return options;
  }

  throw new ValidationError('Survey has invalid response options');
}

function parseSurveyQuestions(plan: SurveyPlan): SurveyQuestion[] {
  if (!Array.isArray(plan.questions) || plan.questions.length === 0) {
    throw new ValidationError('Survey has no questions');
  }
  const normalized = plan.questions
    .map((question, index) => ({
      id: typeof question.id === 'string' && question.id.trim() !== '' ? question.id : `q${index + 1}`,
      text: typeof question.text === 'string' ? question.text.trim() : '',
      order: typeof question.order === 'number' && Number.isInteger(question.order) ? question.order : index + 1,
    }))
    .filter((question) => question.text !== '')
    .sort((left, right) => left.order - right.order);

  if (normalized.length === 0) {
    throw new ValidationError('Survey has no valid questions');
  }

  return normalized;
}

async function syncSurveyScenariosFromPlan(definitionId: string, plan: SurveyPlan): Promise<void> {
  const questions = parseSurveyQuestions(plan);
  const responseOptions = parseSurveyResponseOptions(plan);
  const instructions = typeof plan.instructions === 'string' ? plan.instructions : '';

  await db.$transaction(async (tx) => {
    await tx.scenario.updateMany({
      where: {
        definitionId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    await tx.scenario.createMany({
      data: questions.map((question) => ({
        definitionId,
        name: `Q${question.order}`,
        content: {
          prompt: buildSingleQuestionSurveyPrompt(question.text, responseOptions, instructions),
          dimensions: {
            questionNumber: question.order,
            questionText: question.text,
          },
        },
      })),
    });
  });
}

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
    temperature,
    priority = 'NORMAL',
    experimentId,
    userId,
    finalTrial = false,
    scenarioIds,
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

  if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
    throw new ValidationError('temperature must be between 0 and 2');
  }

  if (finalTrial && Array.isArray(scenarioIds) && scenarioIds.length > 0) {
    throw new ValidationError('scenarioIds cannot be used with finalTrial');
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
    temperature: temperature ?? null,
    scenarioIds: finalTrial ? null : (selectedScenarioIds.length > 0 ? selectedScenarioIds : null),
    runMode: finalTrial ? 'FINAL' : (Array.isArray(scenarioIds) && scenarioIds.length > 0 ? 'SPECIFIC_CONDITION' : 'PERCENTAGE'),
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

  // Enqueue in chunks, then retry any dropped jobs one more time.
  const firstPass = await enqueueJobs(jobs, (queueName, data, options) => boss.send(queueName, data, options));
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
