import type * as PgBoss from 'pg-boss';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { DEFAULT_JOB_OPTIONS, type RunStateReconcileJobData } from '../types.js';
import { maybeAdvanceRunStatus } from '../../services/run/index.js';
import {
  detectModelTranscriptShortfall,
  detectResummarizeFailed,
  detectScheduledCountMismatch,
  detectStrandedTranscript,
  detectSummarizingStall,
  countOrphanTranscripts,
  findOrphanTranscripts,
  type RunSnapshot,
} from '../../services/run/anomaly-detection.js';
import { detectInvalidResponseFailures } from '../../services/run/anomaly-invalid-response-detection.js';
import {
  repairScheduledCount,
  syncAnomalies,
} from '../../services/run/anomaly-persistence.js';
import { ORPHAN_RECONSTRUCTION_CAP_PER_TICK } from '../../services/run/anomaly-thresholds.js';
import { recordProbeSuccess } from '../../services/probe-result/index.js';

const log = createLogger('queue:run-state-reconcile');

type TokenUsageResult =
  | { kind: 'ok'; inputTokens: number; outputTokens: number }
  | { kind: 'malformed'; reason: string };

function extractTranscriptTokenUsage(content: unknown, fallbackTokenCount: number): TokenUsageResult {
  if (content === null || content === undefined || typeof content !== 'object') {
    return { kind: 'malformed', reason: 'content-not-object' };
  }

  const record = content as Record<string, unknown>;
  const snapshot = record.costSnapshot;
  if (snapshot !== null && snapshot !== undefined && typeof snapshot === 'object') {
    const snap = snapshot as Record<string, unknown>;
    if (typeof snap.inputTokens === 'number' && typeof snap.outputTokens === 'number') {
      return { kind: 'ok', inputTokens: snap.inputTokens, outputTokens: snap.outputTokens };
    }
  }

  const turns = Array.isArray(record.turns) ? record.turns : [];
  let inputTokens = 0;
  let outputTokens = 0;
  let foundInputTokens = false;
  let foundOutputTokens = false;

  for (const turn of turns) {
    if (turn === null || typeof turn !== 'object') {
      continue;
    }

    const turnRecord = turn as Record<string, unknown>;
    if (typeof turnRecord.inputTokens === 'number') {
      inputTokens += turnRecord.inputTokens;
      foundInputTokens = true;
    }
    if (typeof turnRecord.outputTokens === 'number') {
      outputTokens += turnRecord.outputTokens;
      foundOutputTokens = true;
    }
  }

  if (!foundInputTokens && !foundOutputTokens) {
    return { kind: 'malformed', reason: 'no-cost-data' };
  }

  return {
    kind: 'ok',
    inputTokens: foundInputTokens ? inputTokens : fallbackTokenCount,
    outputTokens: foundOutputTokens ? outputTokens : fallbackTokenCount,
  };
}

async function enqueueSummarizeTranscriptJob(runId: string, transcriptId: string): Promise<void> {
  const bossModule = await import('../boss.js');
  if (!bossModule.isBossRunning()) {
    log.warn({ runId, transcriptId }, 'Boss not running, skipping summarize enqueue');
    return;
  }
  const boss = bossModule.getBoss();
  await boss.send(
    'summarize_transcript',
    { runId, transcriptId, enqueuedAt: new Date().toISOString() },
    {
      ...DEFAULT_JOB_OPTIONS['summarize_transcript'],
      singletonKey: transcriptId,
    }
  );
}

async function reconstructOrphans(runId: string): Promise<{ orphanIds: string[]; failedIds: string[]; reconstructedCount: number }> {
  const orphans = await findOrphanTranscripts(runId, ORPHAN_RECONSTRUCTION_CAP_PER_TICK);
  const failedIds: string[] = [];
  let reconstructedCount = 0;

  for (const orphan of orphans) {
    if (orphan.scenarioId === null) {
      failedIds.push(orphan.id);
      continue;
    }

    try {
      const tokenUsage = extractTranscriptTokenUsage(orphan.content, orphan.tokenCount);
      if (tokenUsage.kind === 'ok') {
        await recordProbeSuccess({
          runId,
          scenarioId: orphan.scenarioId,
          modelId: orphan.modelId,
          sampleIndex: orphan.sampleIndex,
          transcriptId: orphan.id,
          durationMs: orphan.durationMs,
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
        });
        reconstructedCount++;
      } else {
        failedIds.push(orphan.id);
        log.warn({ runId, transcriptId: orphan.id, reason: tokenUsage.reason }, 'Malformed orphan transcript content');
      }
    } catch (error) {
      failedIds.push(orphan.id);
      log.warn({ runId, transcriptId: orphan.id, err: error }, 'Failed to reconstruct orphan transcript');
    }
  }

  if (orphans.length === ORPHAN_RECONSTRUCTION_CAP_PER_TICK) {
    const total = await countOrphanTranscripts(runId);
    if (total > ORPHAN_RECONSTRUCTION_CAP_PER_TICK) {
      log.info(
        {
          runId,
          total,
          processing: ORPHAN_RECONSTRUCTION_CAP_PER_TICK,
          overflow: total - ORPHAN_RECONSTRUCTION_CAP_PER_TICK,
        },
        'Orphan backlog exceeds per-tick cap'
      );
    }
  }

  return {
    orphanIds: orphans.map((orphan) => orphan.id),
    failedIds,
    reconstructedCount,
  };
}

async function getRunSnapshot(runId: string): Promise<RunSnapshot | null> {
  return db.run.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      config: true,
      progress: true,
      deletedAt: true,
    },
  });
}

export function createRunStateReconcileHandler(): PgBoss.WorkHandler<RunStateReconcileJobData> {
  return async (jobs: PgBoss.Job<RunStateReconcileJobData>[]) => {
    if (jobs.length === 0) {
      return;
    }

    await Promise.all(
      jobs.map(async (job) => {
        const runId = job.data.runId;
        log.debug({ jobId: job.id, runId }, 'Reconciling run state');

        let run = await getRunSnapshot(runId);
        if (run === null || run.deletedAt !== null) {
          log.debug({ runId }, 'Skipping reconcile for missing or deleted run');
          return;
        }

        if (run.status === 'FAILED' || run.status === 'CANCELLED') {
          log.debug({ runId, status: run.status }, 'Skipping reconcile for terminal run');
          return;
        }

        // Reconstruct orphan transcripts FIRST so their ProbeResult rows exist
        // before we compute derived progress (maybeAdvanceRunStatus) and before
        // the stranded-transcript rescue fans out summarize jobs. Without this
        // ordering, orphans reconstructed on COMPLETED runs would wait a full
        // sweep cycle (5-10 min) before getting summarized.
        try {
          const orphanResult = await reconstructOrphans(runId);
          if (orphanResult.failedIds.length > 0) {
            await syncAnomalies(runId, 'ORPHAN_TRANSCRIPT', [{
              type: 'ORPHAN_TRANSCRIPT',
              subject: '',
              details: {
                transcriptIds: orphanResult.orphanIds,
                malformedTranscriptIds: orphanResult.failedIds,
              },
            }], 'default');
          } else {
            await syncAnomalies(runId, 'ORPHAN_TRANSCRIPT', [], 'default');
          }
        } catch (error) {
          log.warn({ runId, err: error }, 'Orphan transcript reconciliation failed');
        }

        try {
          const stranded = await detectStrandedTranscript(runId);
          if (stranded !== null) {
            const transcripts = await db.transcript.findMany({
              where: {
                runId,
                deletedAt: null,
                summarizedAt: null,
                summarizeFailedAt: null,
              },
              select: { id: true },
              orderBy: { createdAt: 'asc' },
            });

            for (const transcript of transcripts) {
              await enqueueSummarizeTranscriptJob(runId, transcript.id);
            }

            await syncAnomalies(runId, stranded.type, [stranded], 'default');
          } else {
            await syncAnomalies(runId, 'STRANDED_TRANSCRIPT', [], 'default');
          }
        } catch (error) {
          log.warn({ runId, err: error }, 'Late transcript rescue failed');
        }

        try {
          const resummarizeFailed = await detectResummarizeFailed(runId);
          await syncAnomalies(runId, 'RESUMMARIZE_FAILED', resummarizeFailed, 'default');
        } catch (error) {
          log.warn({ runId, err: error }, 'Re-summarize failure detection failed');
        }

        // PENDING is included as defense-in-depth: non-empty runs are now
        // created directly in `RUNNING` (start.ts), but if anything ever
        // leaves a run stuck in `PENDING` we still want the reconciler to
        // attempt status advancement (the empty-run CAS will catch zero-probe
        // runs; non-empty PENDING runs will not advance via maybeAdvanceRunStatus
        // today, but will still trigger anomaly detection here).
        if (
          run.status === 'PENDING' ||
          run.status === 'RUNNING' ||
          run.status === 'SUMMARIZING' ||
          run.status === 'PAUSED'
        ) {
          try {
            const advanceResult = await maybeAdvanceRunStatus(runId);
            log.debug({ runId, advanceResult }, 'Reconciled run state');
            run = (await getRunSnapshot(runId)) ?? run;
          } catch (error) {
            log.warn({ runId, err: error }, 'Failed to advance run state during reconciliation');
          }
        }

        if (run.status === 'COMPLETED') {
          try {
            const shortfalls = await detectModelTranscriptShortfall(run);
            await syncAnomalies(runId, 'MODEL_TRANSCRIPT_SHORTFALL', shortfalls, 'default');
          } catch (error) {
            log.warn({ runId, err: error }, 'Model shortfall detection failed');
          }

          // INVALID_RESPONSE_FAILURE detection runs in both branches because empty
          // responses can arise during a run (forward path: post-PR #760 FAILED probes)
          // AND can persist as historical empty transcripts on already-completed runs.
          try {
            const invalidResponseFailures = await detectInvalidResponseFailures(runId, 'default');
            await syncAnomalies(runId, 'INVALID_RESPONSE_FAILURE', invalidResponseFailures, 'default');
          } catch (error) {
            log.warn({ runId, err: error }, 'Invalid response failure detection failed');
          }
        } else {
          try {
            const stall = detectSummarizingStall(run);
            await syncAnomalies(runId, 'SUMMARIZING_STALL', stall === null ? [] : [stall], 'default');
          } catch (error) {
            log.warn({ runId, err: error }, 'Summarizing stall detection failed');
          }

          try {
            const scheduled = await detectScheduledCountMismatch(run);
            await syncAnomalies(runId, 'SCHEDULED_COUNT_MISMATCH', scheduled.draft === null ? [] : [scheduled.draft], 'default');
            if (scheduled.draft !== null) {
              await repairScheduledCount(runId, scheduled.canonicalTotal);
            }
          } catch (error) {
            log.warn({ runId, err: error }, 'Scheduled count mismatch detection failed');
          }

          try {
            const invalidResponseFailures = await detectInvalidResponseFailures(runId, 'default');
            await syncAnomalies(runId, 'INVALID_RESPONSE_FAILURE', invalidResponseFailures, 'default');
          } catch (error) {
            log.warn({ runId, err: error }, 'Invalid response failure detection failed');
          }

          try {
            const shortfalls = await detectModelTranscriptShortfall(run);
            await syncAnomalies(runId, 'MODEL_TRANSCRIPT_SHORTFALL', shortfalls, 'default');
          } catch (error) {
            log.warn({ runId, err: error }, 'Model shortfall detection failed');
          }
        }

        log.info({ runId }, 'Run reconciliation completed');
      })
    );
  };
}
