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
// any worker reached it. We keep the existing batching at 25 runs per pass and check
// queue depth before every batch — including the first — so a launch fired on top of
// an already-saturated queue waits rather than piling on. The pg-boss query reads
// physical queue depth across all sources, so PAC backfills and direct `startRun`
// calls also count against the budget.
function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const BACKPRESSURE_PROBE_THRESHOLD = parsePositiveInt(
  process.env.DOMAIN_LAUNCH_BACKPRESSURE_THRESHOLD,
  300,
);
export const BACKPRESSURE_POLL_MS = parsePositiveInt(
  process.env.DOMAIN_LAUNCH_BACKPRESSURE_POLL_MS,
  5_000,
);
export const BACKPRESSURE_MAX_WAIT_MS = parsePositiveInt(
  process.env.DOMAIN_LAUNCH_BACKPRESSURE_MAX_WAIT_MS,
  5 * 60 * 1000,
);

export type ProbeQueueCapacityResult =
  | { ok: true; inFlight: number }
  | { ok: false; reason: 'timeout'; lastInFlight: number; waitedMs: number };

export async function waitForProbeQueueCapacity(): Promise<ProbeQueueCapacityResult> {
  // In test or pre-boot contexts there is no PgBoss instance — skip without blocking.
  if (!isBossRunning()) return { ok: true, inFlight: 0 };
  const boss = getBoss();
  const startedAt = Date.now();
  let lastInFlight = 0;
  while (Date.now() - startedAt < BACKPRESSURE_MAX_WAIT_MS) {
    const queues = await boss.getQueues();
    lastInFlight = queues
      .filter((q) => isActiveProbeQueueName(q.name))
      .reduce((sum, q) => sum + q.activeCount + q.queuedCount, 0);
    if (lastInFlight < BACKPRESSURE_PROBE_THRESHOLD) {
      return { ok: true, inFlight: lastInFlight };
    }
    backpressureLog.info(
      {
        inFlightProbes: lastInFlight,
        threshold: BACKPRESSURE_PROBE_THRESHOLD,
        waitedMs: Date.now() - startedAt,
      },
      'Domain launch waiting for probe queue to drain before next batch'
    );
    await new Promise((resolve) => setTimeout(resolve, BACKPRESSURE_POLL_MS));
  }
  const waitedMs = Date.now() - startedAt;
  backpressureLog.warn(
    {
      thresholdJobs: BACKPRESSURE_PROBE_THRESHOLD,
      maxWaitMs: BACKPRESSURE_MAX_WAIT_MS,
      lastInFlight,
    },
    'Domain launch backpressure timed out — aborting remaining batches'
  );
  return { ok: false, reason: 'timeout', lastInFlight, waitedMs };
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

    const capacity = await waitForProbeQueueCapacity();
    if (!capacity.ok) {
      const aborted = launchSlots.slice(offset);
      failedDefinitions += aborted.length;
      for (const slot of aborted) {
        log.error(
          {
            domainId,
            definitionId: slot.definition.id,
            scopeCategory,
            lastInFlight: capacity.lastInFlight,
            threshold: BACKPRESSURE_PROBE_THRESHOLD,
            waitedMs: capacity.waitedMs,
            error: 'probe queue backpressure timeout',
          },
          'Aborted domain evaluation member run due to backpressure timeout'
        );
      }
      break;
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

  let aborted = false;
  for (const group of backfillGroups) {
    if (aborted) {
      failedDefinitions += group.definitions.length;
      for (const definition of group.definitions) {
        log.error(
          {
            domainEvaluationId,
            definitionId: definition.id,
            modelId: group.modelId,
            error: 'probe queue backpressure timeout',
          },
          'Aborted evaluation model backfill run due to backpressure timeout',
        );
      }
      continue;
    }

    const capacity = await waitForProbeQueueCapacity();
    if (!capacity.ok) {
      aborted = true;
      failedDefinitions += group.definitions.length;
      for (const definition of group.definitions) {
        log.error(
          {
            domainEvaluationId,
            definitionId: definition.id,
            modelId: group.modelId,
            lastInFlight: capacity.lastInFlight,
            threshold: BACKPRESSURE_PROBE_THRESHOLD,
            waitedMs: capacity.waitedMs,
            error: 'probe queue backpressure timeout',
          },
          'Aborted evaluation model backfill run due to backpressure timeout',
        );
      }
      continue;
    }
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
