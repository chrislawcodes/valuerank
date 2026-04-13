import { AppError, createLogger } from '@valuerank/shared';
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
import type { RunJobPlanItem } from './start-plan.js';

const log = createLogger('services:run:start');

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
          config: {
            maxTurns: 10,
            ...(temperature !== undefined && temperature !== null ? { temperature } : {}),
          },
        },
        options: baseJobOptions,
      });
    }
  }

  const queueCounts = new Map<string, number>();
  for (const job of jobs) {
    queueCounts.set(job.queueName, (queueCounts.get(job.queueName) ?? 0) + 1);
  }
  log.debug({ runId, queueDistribution: Object.fromEntries(queueCounts) }, 'Job queue distribution');

  const firstPass = await bulkEnqueueJobs(jobs);
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

  if (remainingFailures.length > 0 || jobIds.length !== totalJobs) {
    const failureReason = remainingFailures.length > 0
      ? `${remainingFailures.length} jobs failed to enqueue after retry`
      : `Expected ${totalJobs} jobs but only ${jobIds.length} were enqueued`;

    log.error(
      {
        runId,
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

    throw new AppError(`Run initialization failed: ${failureReason}`, 'RUN_INIT_FAILED');
  }

  return jobIds;
}
