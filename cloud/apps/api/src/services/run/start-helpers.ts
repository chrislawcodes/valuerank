import { db, type DefinitionContent } from '@valuerank/db';
import { AppError, createLogger, ValidationError } from '@valuerank/shared';
import type { JobInsert } from 'pg-boss';
import { getBoss } from '../../queue/boss.js';
import type { JobOptions, ProbeScenarioJobData } from '../../queue/types.js';
import { getJudgeModel, getSummarizerModel } from '../infra-models.js';

const log = createLogger('services:run:start');

export type SurveyQuestion = {
  id: string;
  text: string;
  order: number;
};

export type SurveyResponseOption = {
  id: string;
  label: string;
  order: number;
  value: number;
};

export type SurveyPlan = {
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

export type JobEntry = {
  queueName: string;
  data: ProbeScenarioJobData;
  options: JobOptions;
};

export type FindingsSnapshotModelConfig = {
  modelId: string;
  providerId: string;
  providerName: string;
  displayName: string;
  apiConfig: Record<string, unknown> | null;
};

export type EnqueueFailure = {
  job: JobEntry;
  error: string;
};

const ENQUEUE_CHUNK_SIZE = 50;
export const RETRY_ENQUEUE_CHUNK_SIZE = 10;

export async function enqueueJobs(
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
          throw new AppError('send returned null job id', 'QUEUE_SEND_FAILED');
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

/**
 * Bulk-inserts all jobs for a run using boss.insert(), grouped by queue name.
 *
 * A single INSERT ... VALUES (...), (...) round-trip per queue replaces the
 * N individual boss.send() calls that were the primary bottleneck when
 * launching many runs at once (e.g. target-batch top-up across 75 vignettes).
 */
export async function bulkEnqueueJobs(
  jobs: JobEntry[],
): Promise<{ jobIds: string[]; failures: EnqueueFailure[] }> {
  if (jobs.length === 0) return { jobIds: [], failures: [] };

  const boss = getBoss();

  // Group by queue name — boss.insert() takes a single queue name per call.
  const jobsByQueue = new Map<string, JobEntry[]>();
  for (const job of jobs) {
    const existing = jobsByQueue.get(job.queueName) ?? [];
    existing.push(job);
    jobsByQueue.set(job.queueName, existing);
  }

  const jobIds: string[] = [];
  const failures: EnqueueFailure[] = [];

  for (const [queueName, queueJobs] of jobsByQueue) {
    const insertPayloads: JobInsert<ProbeScenarioJobData>[] = queueJobs.map((job) => ({
      data: job.data,
      priority: job.options.priority,
      retryLimit: job.options.retryLimit,
      retryDelay: job.options.retryDelay,
      retryBackoff: job.options.retryBackoff,
      expireInSeconds: job.options.expireInSeconds,
      ...(job.options.singletonKey !== undefined ? { singletonKey: job.options.singletonKey } : {}),
    }));

    try {
      const ids = await boss.insert(queueName, insertPayloads);
      if (ids === null || ids.length === 0) {
        failures.push(
          ...queueJobs.map((job) => ({ job, error: 'bulk insert returned no ids' })),
        );
      } else {
        jobIds.push(...ids);
        if (ids.length < queueJobs.length) {
          log.warn(
            { queueName, expected: queueJobs.length, got: ids.length },
            'Bulk insert dropped some jobs (possible singleton dedup)',
          );
          // We cannot identify which specific jobs were dropped; surface the
          // count discrepancy so the caller's integrity check catches it.
          const droppedCount = queueJobs.length - ids.length;
          for (let i = 0; i < droppedCount; i++) {
            failures.push({ job: queueJobs[i]!, error: 'dropped by bulk insert' });
          }
        }
      }
    } catch (err) {
      failures.push(
        ...queueJobs.map((job) => ({
          job,
          error: err instanceof Error ? err.message : String(err),
        })),
      );
    }
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

export async function syncSurveyScenariosFromPlan(definitionId: string, plan: SurveyPlan): Promise<void> {
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
export function hashString(str: string): number {
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
export function sampleScenarios(
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
export function convertToAlpha(n: number): string {
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

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function buildResolvedValueStatements(
  resolvedContent: DefinitionContent,
  availableStatements: Array<{ id: string; token: string; body: string; domainId: string }>,
): Array<Record<string, unknown>> | null {
  const components = resolvedContent.components;
  if (!components) return null;

  return [
    components.value_first,
    components.value_second,
  ].map((component) => {
    const matched = availableStatements.find((statement) => statement.token === component.token);
    return {
      id: matched?.id ?? null,
      domainId: matched?.domainId ?? null,
      token: component.token,
      body: matched?.body ?? component.body,
      intensity: component.intensity ?? null,
    };
  });
}

export async function buildFindingsSnapshot(input: {
  definition: {
    domainId: string | null;
    domainContext: { id: string; domainId: string; text: string; version: number } | null;
    levelPresetVersion: {
      id: string;
      version: string;
      levelPresetId: string;
      l1: string;
      l2: string;
      l3: string;
      l4: string;
      l5: string;
    } | null;
    preambleVersion: { id: string; version: string; content: string; preambleId: string } | null;
    domain: {
      id: string;
      valueStatements: Array<{ id: string; token: string; body: string; domainId: string }>;
    } | null;
  };
  resolvedContent: DefinitionContent;
  selectedModels: FindingsSnapshotModelConfig[];
}): Promise<Record<string, unknown>> {
  const { definition, resolvedContent, selectedModels } = input;
  const [judgeModel, summarizerModel] = await Promise.all([
    getJudgeModel(),
    getSummarizerModel(),
  ]);

  const resolvedContext = definition.domainContext
    ? {
      id: definition.domainContext.id,
      domainId: definition.domainContext.domainId,
      text: definition.domainContext.text,
      version: definition.domainContext.version,
    }
    : null;

  const resolvedValueStatements = definition.domain
    ? buildResolvedValueStatements(resolvedContent, definition.domain.valueStatements)
    : null;

  const resolvedLevelWords = definition.levelPresetVersion
    ? {
      id: definition.levelPresetVersion.id,
      levelPresetId: definition.levelPresetVersion.levelPresetId,
      version: definition.levelPresetVersion.version,
      words: [
        definition.levelPresetVersion.l1,
        definition.levelPresetVersion.l2,
        definition.levelPresetVersion.l3,
        definition.levelPresetVersion.l4,
        definition.levelPresetVersion.l5,
      ],
    }
    : null;

  return {
    findingsSnapshotVersion: 'v1',
    resolvedPreamble: definition.preambleVersion
      ? {
        id: definition.preambleVersion.id,
        preambleId: definition.preambleVersion.preambleId,
        version: definition.preambleVersion.version,
        content: definition.preambleVersion.content,
      }
      : null,
    resolvedContext,
    resolvedValueStatements,
    resolvedLevelWords,
    targetModelConfigs: selectedModels.map((model) => ({
      modelId: model.modelId,
      providerId: model.providerId,
      providerName: model.providerName,
      displayName: model.displayName,
      apiConfig: model.apiConfig,
    })),
    evaluatorConfig: {
      modelId: judgeModel.modelId,
      providerId: judgeModel.providerId,
      providerName: judgeModel.providerName,
      displayName: judgeModel.displayName,
      apiConfig: judgeModel.apiConfig ?? null,
    },
    summarizerConfig: {
      modelId: summarizerModel.modelId,
      providerId: summarizerModel.providerId,
      providerName: summarizerModel.providerName,
      displayName: summarizerModel.displayName,
      apiConfig: summarizerModel.apiConfig ?? null,
    },
  };
}
