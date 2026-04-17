import type * as PgBoss from 'pg-boss';
import type { JobInsert } from 'pg-boss';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { getBoss } from '../boss.js';
import {
  DEFAULT_JOB_OPTIONS,
  PRIORITY_VALUES,
  type JobOptions,
  type PriorityLevel,
  type ProbeScenarioJobData,
  type TopUpProbesJobData,
} from '../types.js';
import { buildRunJobPlan } from '../../services/run/start-plan.js';
import { PROBE_QUEUE_DEPTH_PER_PROVIDER } from '../../services/run/start-queue.js';
import { getQueueNameForModel } from '../../services/parallelism/index.js';

const log = createLogger('queue:top-up-probes');

type RunConfig = {
  models?: string[];
  samplePercentage?: number;
  sampleSeed?: number;
  samplesPerScenario?: number;
  temperature?: number | null;
  priority?: string;
};

type RunForTopUp = {
  id: string;
  status: string;
  definitionId: string;
  config: unknown;
  scenarioSelections: Array<{ scenarioId: string }>;
};

type ProbeKey = {
  scenarioId: string;
  modelId: string;
  sampleIndex: number;
};

type PendingJobRow = {
  scenario_id: string;
  model_id: string;
  sample_index: number;
};

function isPriorityLevel(value: string | undefined): value is PriorityLevel {
  return value === 'LOW' || value === 'NORMAL' || value === 'HIGH';
}

function parseRunConfig(config: unknown): RunConfig {
  return config !== null && typeof config === 'object' ? (config as RunConfig) : {};
}

function parseModels(config: RunConfig): string[] {
  return Array.isArray(config.models)
    ? config.models.filter((model): model is string => typeof model === 'string' && model.length > 0)
    : [];
}

function probeKey({ scenarioId, modelId, sampleIndex }: ProbeKey): string {
  return `${scenarioId}:${modelId}:${sampleIndex}`;
}

async function getPendingJobs(queueName: string, runId: string): Promise<PendingJobRow[]> {
  return db.$queryRaw<PendingJobRow[]>`
    SELECT
      data->>'scenarioId' AS scenario_id,
      data->>'modelId' AS model_id,
      COALESCE((data->>'sampleIndex')::int, 0) AS sample_index
    FROM pgboss.job
    WHERE name = ${queueName}
      AND data->>'runId' = ${runId}
      AND state IN ('created', 'retry', 'active')
  `;
}

export async function enqueueTopUpProbesSingleton(runId: string): Promise<void> {
  try {
    const boss = getBoss();
    const jobOptions: JobOptions = {
      ...DEFAULT_JOB_OPTIONS.top_up_probes,
      singletonKey: runId,
    };
    const jobId = await boss.send('top_up_probes', { runId }, jobOptions);
    if (jobId === null) {
      log.debug({ runId }, 'Top-up probes job already queued');
      return;
    }
    log.debug({ runId, jobId }, 'Queued top-up probes job');
  } catch (error) {
    log.warn({ runId, error }, 'Failed to enqueue top-up probes job');
  }
}

async function topUpRun(run: RunForTopUp | null): Promise<void> {
  if (run === null) {
    return;
  }

  if (run.status !== 'RUNNING') {
    log.debug({ runId: run.id, status: run.status }, 'Skipping top-up for non-running run');
    return;
  }

  const runConfig = parseRunConfig(run.config);
  const models = parseModels(runConfig);
  const scenarioIds = run.scenarioSelections.map((selection) => selection.scenarioId);
  if (models.length === 0 || scenarioIds.length === 0) {
    return;
  }

  const samplesPerScenario =
    typeof runConfig.samplesPerScenario === 'number' && runConfig.samplesPerScenario >= 1
      ? runConfig.samplesPerScenario
      : 1;
  const samplePercentage =
    typeof runConfig.samplePercentage === 'number' ? runConfig.samplePercentage : 100;
  const sampleSeed = typeof runConfig.sampleSeed === 'number' ? runConfig.sampleSeed : undefined;
  const temperature =
    typeof runConfig.temperature === 'number' ? runConfig.temperature : null;
  const { jobPlan } = await buildRunJobPlan({
    definitionId: run.definitionId,
    models,
    definitionScenarioIds: scenarioIds,
    scenarioIds,
    samplePercentage,
    sampleSeed,
    samplesPerScenario,
  });

  const queueNameCache = new Map<string, string>();
  const jobsByQueue = new Map<string, ProbeKey[]>();
  const getQueue = async (modelId: string): Promise<string> => {
    const cached = queueNameCache.get(modelId);
    if (cached !== undefined) {
      return cached;
    }
    const queueName = await getQueueNameForModel(modelId);
    queueNameCache.set(modelId, queueName);
    return queueName;
  };

  for (const item of jobPlan) {
    const queueName = await getQueue(item.modelId);
    const queueJobs = jobsByQueue.get(queueName) ?? [];
    for (let sampleIndex = 0; sampleIndex < item.samples; sampleIndex++) {
      queueJobs.push({ scenarioId: item.scenarioId, modelId: item.modelId, sampleIndex });
    }
    jobsByQueue.set(queueName, queueJobs);
  }

  const terminalProbeResults = await db.probeResult.findMany({
    where: { runId: run.id, status: { in: ['SUCCESS', 'FAILED'] } },
    select: { scenarioId: true, modelId: true, sampleIndex: true },
  });
  const terminalKeys = new Set(
    terminalProbeResults.map((result) =>
      probeKey({ scenarioId: result.scenarioId, modelId: result.modelId, sampleIndex: result.sampleIndex })
    )
  );

  const boss = getBoss();
  const baseJobOptions: JobOptions = {
    ...DEFAULT_JOB_OPTIONS.probe_scenario,
    priority: PRIORITY_VALUES[isPriorityLevel(runConfig.priority) ? runConfig.priority : 'NORMAL'],
  };
  const jobConfig = {
    maxTurns: 10,
    ...(temperature !== null ? { temperature } : {}),
  };

  for (const [queueName, queueJobs] of jobsByQueue) {
    const pendingJobs = await getPendingJobs(queueName, run.id);
    const pendingKeys = new Set(
      pendingJobs.map((job) =>
        probeKey({
          scenarioId: job.scenario_id,
          modelId: job.model_id,
          sampleIndex: job.sample_index,
        })
      )
    );
    const missingJobs = queueJobs.filter(
      (job) => !terminalKeys.has(probeKey(job)) && !pendingKeys.has(probeKey(job))
    );
    const launchLimit = Math.max(0, PROBE_QUEUE_DEPTH_PER_PROVIDER - pendingJobs.length);
    const jobsToInsert = missingJobs.slice(0, launchLimit);

    if (jobsToInsert.length === 0) {
      continue;
    }

    const insertPayloads: JobInsert<ProbeScenarioJobData>[] = jobsToInsert.map((job) => ({
      data: {
        runId: run.id,
        scenarioId: job.scenarioId,
        modelId: job.modelId,
        sampleIndex: job.sampleIndex,
        config: jobConfig,
      },
      ...baseJobOptions,
    }));

    const jobIds = await boss.insert(queueName, insertPayloads);
    log.debug(
      {
        runId: run.id,
        queueName,
        pendingJobs: pendingJobs.length,
        insertedJobs: jobIds?.length ?? 0,
        missingJobs: missingJobs.length,
      },
      'Top-up probes queued'
    );
  }
}

export function createTopUpProbesHandler(): PgBoss.WorkHandler<TopUpProbesJobData> {
  return async (jobs: PgBoss.Job<TopUpProbesJobData>[]) => {
    for (const job of jobs) {
      const run = await db.run.findUnique({
        where: { id: job.data.runId },
        select: {
          id: true,
          status: true,
          definitionId: true,
          config: true,
          scenarioSelections: { select: { scenarioId: true } },
        },
      });
      await topUpRun(run);
    }
  };
}
