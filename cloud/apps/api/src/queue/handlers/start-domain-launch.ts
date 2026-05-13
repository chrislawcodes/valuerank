import { setTimeout as sleep } from 'node:timers/promises';
import type { PgBoss } from 'pg-boss';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { getBoss } from '../boss.js';
import type { StartDomainLaunchJobData } from '../types.js';
import { startRun as startRunService } from '../../services/run/index.js';
import { isActiveProbeQueueName } from '../../services/queue/probe-queues.js';
import type { DomainTrialRunEntry } from '../../graphql/mutations/domain/types.js';
import {
  BACKPRESSURE_POLL_MS,
  BACKPRESSURE_THRESHOLD,
  FLUSH_EVERY,
  INTER_LAUNCH_DELAY_MS,
  MAX_CONSECUTIVE_QUEUE_ERRORS,
  buildSnapshotUpdate,
  parseLaunchSnapshot,
  type LaunchSnapshot,
} from './start-domain-launch-snapshot.js';
const log = createLogger('queue:start-domain-launch');

async function flushProgress(params: {
  domainEvaluationId: string;
  pendingRuns: DomainTrialRunEntry[];
  definitionNameById: Map<string, string>;
  domainId: string;
  snapshot: LaunchSnapshot;
  startedRuns: number;
  failedDefinitions: number;
  baselineStartedRuns: number;
  baselineFailedDefinitions: number;
  status?: 'RUNNING' | 'FAILED';
  completedAt?: Date | null;
}): Promise<void> {
  const {
    domainEvaluationId,
    pendingRuns,
    definitionNameById,
    domainId,
    snapshot,
    startedRuns,
    failedDefinitions,
    baselineStartedRuns,
    baselineFailedDefinitions,
    status,
    completedAt,
  } = params;

  await db.$transaction(async (tx) => {
    if (pendingRuns.length > 0) {
      await tx.domainEvaluationRun.createMany({
        data: pendingRuns.map((run) => ({
          domainEvaluationId,
          runId: run.runId,
          definitionIdAtLaunch: run.definitionId,
          definitionNameAtLaunch: definitionNameById.get(run.definitionId) ?? 'Untitled vignette',
          domainIdAtLaunch: domainId,
        })),
      });
    }

    await tx.domainEvaluation.update({
      where: { id: domainEvaluationId },
      data: {
        ...(status === undefined ? {} : { status }),
        ...(completedAt === undefined ? {} : { completedAt }),
        configSnapshot: buildSnapshotUpdate(
          snapshot.raw,
          baselineStartedRuns + startedRuns,
          baselineFailedDefinitions + failedDefinitions,
        ),
      },
    });
  });
}

async function markEvaluationFailed(params: {
  domainEvaluationId: string;
  snapshot: LaunchSnapshot | null;
  startedRuns: number;
  failedDefinitions: number;
  baselineStartedRuns: number;
  baselineFailedDefinitions: number;
}): Promise<void> {
  const {
    domainEvaluationId,
    snapshot,
    startedRuns,
    failedDefinitions,
    baselineStartedRuns,
    baselineFailedDefinitions,
  } = params;
  await db.domainEvaluation.update({
    where: { id: domainEvaluationId },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      ...(snapshot === null
        ? {}
        : {
            configSnapshot: buildSnapshotUpdate(
              snapshot.raw,
              baselineStartedRuns + startedRuns,
              baselineFailedDefinitions + failedDefinitions,
            ),
          }),
    },
  });
}

type SnapshotCounters = {
  startedRuns: number;
  failedDefinitions: number;
};

function readSnapshotCounters(configSnapshot: unknown): SnapshotCounters {
  if (configSnapshot == null || typeof configSnapshot !== 'object' || Array.isArray(configSnapshot)) {
    return {
      startedRuns: 0,
      failedDefinitions: 0,
    };
  }

  const snapshot = configSnapshot as Record<string, unknown>;
  return {
    startedRuns:
      typeof snapshot.startedRuns === 'number' && Number.isFinite(snapshot.startedRuns)
        ? snapshot.startedRuns
        : 0,
    failedDefinitions:
      typeof snapshot.failedDefinitions === 'number' && Number.isFinite(snapshot.failedDefinitions)
        ? snapshot.failedDefinitions
        : 0,
  };
}

class ProbeQueueUnhealthyError extends Error {
  readonly consecutiveErrors: number;
  readonly lastError: unknown;

  constructor(consecutiveErrors: number, lastError: unknown) {
    super('Probe queue inspection failed 5 consecutive times; refusing to launch against potentially unhealthy queue');
    this.name = 'ProbeQueueUnhealthyError';
    this.consecutiveErrors = consecutiveErrors;
    this.lastError = lastError;
  }
}

async function waitForProbeQueueCapacity(
  boss: PgBoss,
  domainEvaluationId: string,
  definitionId: string,
): Promise<void> {
  let pollCount = 0;
  let consecutiveFailures = 0;
  let waitingForCapacity = true;

  while (waitingForCapacity) {
    try {
      const queues = await boss.getQueues();
      consecutiveFailures = 0;
      pollCount += 1;

      const inFlight = queues
        .filter((queue) => isActiveProbeQueueName(queue.name))
        .reduce((sum, queue) => sum + queue.activeCount + queue.queuedCount, 0);

      if (inFlight < BACKPRESSURE_THRESHOLD) {
        waitingForCapacity = false;
        continue;
      }

      if (pollCount % 6 === 0) {
        log.info(
          {
            domainEvaluationId,
            definitionId,
            inFlightProbes: inFlight,
            threshold: BACKPRESSURE_THRESHOLD,
            waitedMs: pollCount * BACKPRESSURE_POLL_MS,
          },
          'Waiting for probe queue capacity before launching next domain run'
        );
      }
    } catch (error) {
      consecutiveFailures += 1;
      log.warn(
        {
          domainEvaluationId,
          definitionId,
          consecutiveFailures,
          err: error,
        },
        'Failed to inspect probe queue depth while pacing domain launch'
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_QUEUE_ERRORS) {
        throw new ProbeQueueUnhealthyError(consecutiveFailures, error);
      }
    }

    if (waitingForCapacity) {
      await sleep(BACKPRESSURE_POLL_MS);
    }
  }
}

export function createStartDomainLaunchHandler(): (data: StartDomainLaunchJobData) => Promise<void> {
  return async ({ domainEvaluationId }) => {
    let snapshot: LaunchSnapshot | null = null;
    let baselineStartedRuns = 0;
    let baselineFailedDefinitions = 0;
    let startedRuns = 0;
    let failedDefinitions = 0;

    try {
      const evaluation = await db.domainEvaluation.findUnique({
        where: { id: domainEvaluationId },
        select: {
          id: true,
          domainId: true,
          status: true,
          deletedAt: true,
          configSnapshot: true,
          createdByUserId: true,
        },
      });

      if (evaluation === null) {
        log.warn({ domainEvaluationId }, 'Skipping domain launch job for missing evaluation');
        return;
      }

      if (evaluation.deletedAt !== null) {
        log.warn({ domainEvaluationId }, 'Skipping domain launch job for deleted evaluation');
        return;
      }

      if (evaluation.status !== 'PENDING') {
        log.warn(
          {
            domainEvaluationId,
            status: evaluation.status,
          },
          'Skipping domain launch job for non-pending evaluation'
        );
        return;
      }

      const initialCounters = readSnapshotCounters(evaluation.configSnapshot);
      baselineStartedRuns = initialCounters.startedRuns;
      baselineFailedDefinitions = initialCounters.failedDefinitions;

      const claim = await db.domainEvaluation.updateMany({
        where: {
          id: domainEvaluationId,
          status: 'PENDING',
          deletedAt: null,
        },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      if (claim.count === 0) {
        log.info({ domainEvaluationId }, 'Another worker already claimed this domain launch job');
        return;
      }

      snapshot = parseLaunchSnapshot(evaluation.configSnapshot);
      if (snapshot === null || evaluation.createdByUserId === null) {
        log.error(
          {
            domainEvaluationId,
            hasSnapshot: snapshot !== null,
            hasCreatedByUserId: evaluation.createdByUserId !== null,
          },
          'Domain evaluation launch snapshot is incomplete'
        );
        await markEvaluationFailed({
          domainEvaluationId,
          snapshot,
          startedRuns,
          failedDefinitions,
          baselineStartedRuns,
          baselineFailedDefinitions,
        });
        return;
      }

      const definitions = await db.definition.findMany({
        where: {
          id: { in: snapshot.launchableDefinitionIds },
        },
        select: {
          id: true,
          name: true,
        },
      });
      const definitionNameById = new Map(
        definitions.map((definition) => [definition.id, definition.name ?? 'Untitled vignette']),
      );
      const existingRuns = await db.domainEvaluationRun.findMany({
        where: { domainEvaluationId },
        select: { definitionIdAtLaunch: true },
      });
      const alreadyLaunched = new Set(existingRuns.map((run) => run.definitionIdAtLaunch));

      log.info(
        {
          domainEvaluationId,
          totalDefinitions: snapshot.launchableDefinitionIds.length,
        },
        'Starting asynchronous domain evaluation launch'
      );

      const boss = getBoss();
      const pendingRuns: DomainTrialRunEntry[] = [];

      if (baselineStartedRuns >= snapshot.launchableDefinitionIds.length) {
        await db.domainEvaluation.update({
          where: { id: domainEvaluationId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            configSnapshot: buildSnapshotUpdate(
              snapshot.raw,
              baselineStartedRuns,
              baselineFailedDefinitions,
            ),
          },
        });
        return;
      }

      for (let index = 0; index < snapshot.launchableDefinitionIds.length; index += 1) {
        const definitionId = snapshot.launchableDefinitionIds[index]!;
        if (alreadyLaunched.has(definitionId)) {
          // Resumed run — this definition was launched on a prior handler attempt.
          // Don't re-launch (would create a duplicate Run).
          continue;
        }
        await waitForProbeQueueCapacity(boss, domainEvaluationId, definitionId);

        try {
          const result = await startRunService({
            definitionId,
            models: snapshot.models,
            samplePercentage: snapshot.samplePercentage,
            samplesPerScenario: snapshot.samplesPerScenario,
            temperature: snapshot.temperature ?? undefined,
            priority: 'NORMAL',
            runCategory: snapshot.scopeCategory,
            userId: evaluation.createdByUserId,
          });
          pendingRuns.push({
            definitionId,
            runId: result.run.id,
            modelIds: snapshot.models,
          });
          startedRuns += 1;
        } catch (error) {
          failedDefinitions += 1;
          log.error(
            {
              domainEvaluationId,
              definitionId,
              error,
            },
            'Failed to start domain evaluation member run'
          );
        }

        if ((index + 1) % FLUSH_EVERY === 0) {
          await flushProgress({
            domainEvaluationId,
            pendingRuns: [...pendingRuns],
            definitionNameById,
            domainId: evaluation.domainId,
            snapshot,
            startedRuns,
            failedDefinitions,
            baselineStartedRuns,
            baselineFailedDefinitions,
          });
          pendingRuns.length = 0;
        }

        if (index < snapshot.launchableDefinitionIds.length - 1) {
          await sleep(INTER_LAUNCH_DELAY_MS);
        }
      }

      const totalStartedRuns = baselineStartedRuns + startedRuns;
      const finalStatus = totalStartedRuns > 0 ? 'RUNNING' : 'FAILED';
      const completedAt = totalStartedRuns > 0 ? null : new Date();
      await flushProgress({
        domainEvaluationId,
        pendingRuns,
        definitionNameById,
        domainId: evaluation.domainId,
        snapshot,
        startedRuns,
        failedDefinitions,
        baselineStartedRuns,
        baselineFailedDefinitions,
        status: finalStatus,
        completedAt,
      });

      log.info(
        {
          domainEvaluationId,
          totalDefinitions: snapshot.launchableDefinitionIds.length,
          startedRuns,
          failedDefinitions,
        },
        'Finished asynchronous domain evaluation launch'
      );
    } catch (error) {
      if (error instanceof ProbeQueueUnhealthyError) {
        log.error(
          {
            domainEvaluationId,
            consecutiveErrors: error.consecutiveErrors,
            lastError: error.lastError,
          },
          'Probe queue inspection failed 5 consecutive times; refusing to launch against potentially unhealthy queue'
        );
        try {
          await markEvaluationFailed({
            domainEvaluationId,
            snapshot,
            startedRuns,
            failedDefinitions,
            baselineStartedRuns,
            baselineFailedDefinitions,
          });
        } catch (markFailedError) {
          log.error(
            {
              domainEvaluationId,
              err: markFailedError,
            },
            'Failed to mark domain evaluation launch as failed after probe queue health error'
          );
        }
        throw error;
      }

      log.error({ domainEvaluationId, error }, 'Domain launch handler failed unexpectedly');
      try {
        await markEvaluationFailed({
          domainEvaluationId,
          snapshot,
          startedRuns,
          failedDefinitions,
          baselineStartedRuns,
          baselineFailedDefinitions,
        });
      } catch (markFailedError) {
        log.error(
          {
            domainEvaluationId,
            err: markFailedError,
          },
          'Failed to mark domain evaluation launch as failed after handler error'
        );
      }
      throw error;
    }
  };
}
