import { AppError, NotFoundError, createLogger } from '@valuerank/shared';
import type { PriorityLevel } from '../../queue/types.js';
import { DEFAULT_JOB_OPTIONS, PRIORITY_VALUES } from '../../queue/types.js';
import { getBoss } from '../../queue/boss.js';
import { getQueueNameForModel } from '../parallelism/index.js';
import {
  bulkEnqueueJobs,
  enqueueJobs,
  type JobEntry,
  RETRY_ENQUEUE_CHUNK_SIZE,
} from './start-helpers.js';
import { maybeAdvanceRunStatus } from './progress.js';
import type { RunJobPlanItem } from './start-plan.js';

const log = createLogger('services:run:start');
export const PROBE_QUEUE_DEPTH_PER_PROVIDER = 15;

type EnqueueRunJobsInput = {
  runId: string;
  jobPlan: RunJobPlanItem[];
  priority: string;
  temperature?: number | null;
  totalJobs: number;
};

export async function enqueueRunJobs(input: EnqueueRunJobsInput): Promise<string[]> {
  const { runId, jobPlan, priority, temperature, totalJobs } = input;
  const boss = getBoss();
  const priorityValue = PRIORITY_VALUES[priority as PriorityLevel];
  const baseJobOptions = {
    ...DEFAULT_JOB_OPTIONS['probe_scenario'],
    priority: priorityValue,
  };

  try {
    await maybeAdvanceRunStatus(runId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      log.warn({ runId, err: error }, 'Run missing during immediate status advance, skipping');
    } else {
      throw error;
    }
  }

  const jobs: JobEntry[] = [];
  const queueNameCache = new Map<string, string>();
  const getQueue = async (modelId: string) => {
    if (queueNameCache.has(modelId)) return queueNameCache.get(modelId)!;
    const queueName = await getQueueNameForModel(modelId);
    queueNameCache.set(modelId, queueName);
    return queueName;
  };

  for (const item of jobPlan) {
    const queueName = await getQueue(item.modelId);
    for (let i = 0; i < item.samples; i++) {
      jobs.push({
        queueName,
        data: {
          runId,
          scenarioId: item.scenarioId,
          modelId: item.modelId,
          sampleIndex: i,
          enqueuedAt: new Date().toISOString(),
          config: {
            maxTurns: 10,
            ...(temperature !== undefined && temperature !== null ? { temperature } : {}),
          },
        },
        options: baseJobOptions,
      });
    }
  }

  const jobsByQueue = new Map<string, JobEntry[]>();
  for (const job of jobs) {
    const queueJobs = jobsByQueue.get(job.queueName) ?? [];
    queueJobs.push(job);
    jobsByQueue.set(job.queueName, queueJobs);
  }

  const launchJobs: JobEntry[] = [];
  let expectedInitialCount = 0;
  const launchQueueCounts = new Map<string, number>();
  for (const [queueName, queueJobs] of jobsByQueue) {
    const cappedJobs = queueJobs.slice(0, PROBE_QUEUE_DEPTH_PER_PROVIDER);
    expectedInitialCount += cappedJobs.length;
    launchJobs.push(...cappedJobs);
    launchQueueCounts.set(queueName, cappedJobs.length);
  }

  log.debug(
    {
      runId,
      queueDistribution: Object.fromEntries(
        Array.from(jobsByQueue.entries(), ([queueName, queueJobs]) => [queueName, queueJobs.length])
      ),
      launchDistribution: Object.fromEntries(launchQueueCounts),
      expectedInitialCount,
    },
    'Job queue distribution'
  );

  const firstPass = await bulkEnqueueJobs(launchJobs);
  let jobIds = firstPass.jobIds;
  let remainingFailures = firstPass.failures;

  if (remainingFailures.length > 0) {
    log.warn(
      {
        runId,
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
      RETRY_ENQUEUE_CHUNK_SIZE
    );

    jobIds = jobIds.concat(retryPass.jobIds);
    remainingFailures = retryPass.failures;
  }

  if (jobIds.length === 0) {
    // Total enqueue failure — nothing got queued. Run cannot proceed.
    const failureReason = remainingFailures.length > 0
      ? `${remainingFailures.length} jobs failed to enqueue after retry`
      : 'No jobs were enqueued';

    log.error(
      {
        runId,
        totalJobs,
        expectedInitialCount,
        enqueuedJobs: 0,
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

    throw new AppError(`Run initialization failed: ${failureReason}`, 'RUN_INIT_FAILED');
  }

  if (jobIds.length < expectedInitialCount) {
    // Partial enqueue — some jobs queued and may already be executing.
    // The orphan-recovery service (services/run/recovery.ts) will detect
    // missing probes via findMissingProbes and re-queue them. Do not
    // throw or mark the run FAILED; let the partial launch proceed.
    //
    // Recovery timeline note: detectOrphanedRuns requires pending+active
    // jobs to be zero. So this run is not immediately recoverable — it
    // becomes recoverable only after the partially-queued probes drain.
    // Drain typically completes in minutes; recovery then runs on its
    // 5-minute schedule and tops up missing probes. Net effect:
    // partial-enqueue runs self-heal in roughly (drain + 5min) instead
    // of failing terminally.
    log.warn(
      {
        runId,
        totalJobs,
        expectedInitialCount,
        enqueuedJobs: jobIds.length,
        missingCount: expectedInitialCount - jobIds.length,
        remainingFailures: remainingFailures.slice(0, 10).map((failure) => ({
          queueName: failure.job.queueName,
          modelId: failure.job.data.modelId,
          scenarioId: failure.job.data.scenarioId,
          sampleIndex: failure.job.data.sampleIndex,
          error: failure.error,
        })),
      },
      'Partial enqueue success — accepting partial launch; orphan recovery will top up missing probes'
    );
  }

  return jobIds;
}
