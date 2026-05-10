import type { db } from '@valuerank/db';
import type { RunCategory } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { startRun as startRunService } from '../../../../services/run/index.js';
import { getBoss, isBossRunning } from '../../../../queue/boss.js';
import { isActiveProbeQueueName } from '../../../../services/queue/probe-queues.js';
import { runMatchesSingleModel } from './resolve-backfill.js';
import type {
  LaunchSlot,
  BackfillEvaluationSnapshot,
  BackfillLaunchGroupRepetition,
  DomainTrialRunEntry,
} from './types.js';
import { ACTIVE_RUN_STATUSES } from './types.js';

const backpressureLog = createLogger('domain-launch:backpressure');

// Domain-level launches (e.g. "Run all 90 definitions") used to dump every probe job
// for every run into PgBoss in a 3-second window. With 8 models × 200 probes × 90 runs
// that is ~144k jobs hitting a 150-slot worker pool — most of the tail expired before
// any worker reached it. We keep the existing batching at 25 runs per pass and add a
// poll between batches that waits for the probe queue to drop below ~2x total
// parallelism before submitting the next batch.
const BACKPRESSURE_PROBE_THRESHOLD = 300;
const BACKPRESSURE_POLL_MS = 5000;
const BACKPRESSURE_MAX_WAIT_MS = 5 * 60 * 1000;

async function waitForProbeQueueCapacity(): Promise<void> {
  // In test or pre-boot contexts there is no PgBoss instance — skip without blocking.
  if (!isBossRunning()) return;
  const boss = getBoss();
  const startedAt = Date.now();
  while (Date.now() - startedAt < BACKPRESSURE_MAX_WAIT_MS) {
    const queues = await boss.getQueues();
    const inFlight = queues
      .filter((q) => isActiveProbeQueueName(q.name))
      .reduce((sum, q) => sum + q.activeCount + q.queuedCount, 0);
    if (inFlight < BACKPRESSURE_PROBE_THRESHOLD) {
      return;
    }
    backpressureLog.info(
      {
        inFlightProbes: inFlight,
        threshold: BACKPRESSURE_PROBE_THRESHOLD,
        waitedMs: Date.now() - startedAt,
      },
      'Domain launch waiting for probe queue to drain before next batch'
    );
    await new Promise((resolve) => setTimeout(resolve, BACKPRESSURE_POLL_MS));
  }
  backpressureLog.warn(
    {
      thresholdJobs: BACKPRESSURE_PROBE_THRESHOLD,
      maxWaitMs: BACKPRESSURE_MAX_WAIT_MS,
    },
    'Domain launch backpressure timed out — proceeding to next batch anyway'
  );
}

type PrismaTransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export async function executeLaunchRuns(params: {
  launchSlots: LaunchSlot[];
  selectedModels: string[];
  samplePercentage: number;
  samplesPerScenario: number;
  temperature: number | null;
  scopeCategory: RunCategory;
  userId: string;
  log: { error: (payload: Record<string, unknown>, message: string) => void };
  domainId: string;
}): Promise<{ startedRuns: number; failedDefinitions: number; runs: DomainTrialRunEntry[] }> {
  const {
    launchSlots,
    selectedModels,
    samplePercentage,
    samplesPerScenario,
    temperature,
    scopeCategory,
    userId,
    log,
    domainId,
  } = params;

  let startedRuns = 0;
  let failedDefinitions = 0;
  const runs: DomainTrialRunEntry[] = [];

  for (let offset = 0; offset < launchSlots.length; offset += 25) {
    const batch = launchSlots.slice(offset, offset + 25);
    if (batch.length === 0) {
      continue;
    }

    if (offset > 0) {
      await waitForProbeQueueCapacity();
    }

    const runResults = await Promise.allSettled(
      batch.map(async (slot) => {
        return startRunService({
          definitionId: slot.definition.id,
          models: selectedModels,
          samplePercentage,
          samplesPerScenario,
          temperature: temperature ?? undefined,
          priority: 'NORMAL',
          runCategory: scopeCategory,
          userId,
        });
      })
    );

    runResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        startedRuns += 1;
        runs.push({
          definitionId: result.value.run.definitionId,
          runId: result.value.run.id,
          modelIds: selectedModels,
        });
        return;
      }
      failedDefinitions += 1;
      const failedSlot = batch[index];
      log.error(
        {
          domainId,
          definitionId: failedSlot?.definition.id ?? null,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          scopeCategory,
        },
        'Failed to start domain evaluation member run'
      );
    });
  }

  return { startedRuns, failedDefinitions, runs };
}

export async function executeBackfillRuns(params: {
  backfillGroups: BackfillLaunchGroupRepetition[];
  snapshot: BackfillEvaluationSnapshot;
  scopeCategory: RunCategory;
  userId: string;
  log: { error: (payload: Record<string, unknown>, message: string) => void };
  domainEvaluationId: string;
  tx: PrismaTransactionClient;
}): Promise<{ startedRuns: number; failedDefinitions: number; runs: DomainTrialRunEntry[] }> {
  const { backfillGroups, snapshot, scopeCategory, userId, log, domainEvaluationId, tx } = params;

  let startedRuns = 0;
  let failedDefinitions = 0;
  const runs: DomainTrialRunEntry[] = [];

  let groupIndex = 0;
  for (const group of backfillGroups) {
    if (groupIndex > 0) {
      await waitForProbeQueueCapacity();
    }
    groupIndex += 1;
    const activeEquivalentRuns = await tx.run.findMany({
      where: {
        definitionId: { in: group.definitions.map((definition) => definition.id) },
        runCategory: scopeCategory,
        status: { in: ACTIVE_RUN_STATUSES },
        deletedAt: null,
      },
      select: {
        definitionId: true,
        config: true,
      },
    });
    const hasActiveEquivalentRun = activeEquivalentRuns.some((run) => runMatchesSingleModel(run.config, group.modelId, snapshot.temperature));
    if (hasActiveEquivalentRun) {
      continue;
    }

    const runResults = await Promise.allSettled(
      group.definitions.map(async (definition) => {
        return startRunService({
          definitionId: definition.id,
          models: [group.modelId],
          samplePercentage: snapshot.samplePercentage,
          samplesPerScenario: snapshot.samplesPerScenario,
          temperature: snapshot.temperature ?? undefined,
          priority: 'NORMAL',
          runCategory: scopeCategory,
          userId,
        });
      }),
    );

    runResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        startedRuns += 1;
        runs.push({
          definitionId: result.value.run.definitionId,
          runId: result.value.run.id,
          modelIds: [group.modelId],
        });
        return;
      }

      failedDefinitions += 1;
      const failedDefinition = group.definitions[index];
      log.error(
        {
          domainEvaluationId,
          definitionId: failedDefinition?.id ?? null,
          modelId: group.modelId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        },
        'Failed to start evaluation model backfill run',
      );
    });
  }

  return { startedRuns, failedDefinitions, runs };
}
