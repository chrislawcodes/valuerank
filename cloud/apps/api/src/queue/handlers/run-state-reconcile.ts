import type * as PgBoss from 'pg-boss';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { DEFAULT_JOB_OPTIONS, type RunStateReconcileJobData } from '../types.js';
import { maybeAdvanceRunStatus } from '../../services/run/index.js';
import {
  detectModelTranscriptShortfall,
  detectPairAsymmetry,
  detectScheduledCountMismatch,
  detectStrandedTranscript,
  detectSummarizingStall,
  findOrphanTranscripts,
  type AnomalyDraft,
  type RunSnapshot,
} from '../../services/run/anomaly-detection.js';
import {
  persistAnomalyDrafts,
  repairScheduledCount,
  resolveAnomaly,
} from '../../services/run/anomaly-persistence.js';
import { recordProbeSuccess } from '../../services/probe-result/index.js';

const log = createLogger('queue:run-state-reconcile');

function extractTranscriptTokenUsage(
  content: unknown,
  fallbackTokenCount: number,
): { inputTokens: number; outputTokens: number } {
  if (content === null || content === undefined || typeof content !== 'object') {
    return { inputTokens: 0, outputTokens: fallbackTokenCount };
  }

  const record = content as Record<string, unknown>;
  const snapshot = record.costSnapshot;
  if (snapshot !== null && snapshot !== undefined && typeof snapshot === 'object') {
    const snap = snapshot as Record<string, unknown>;
    if (typeof snap.inputTokens === 'number' && typeof snap.outputTokens === 'number') {
      return { inputTokens: snap.inputTokens, outputTokens: snap.outputTokens };
    }
  }

  const turns = Array.isArray(record.turns) ? record.turns : [];
  let inputTokens = 0;
  let outputTokens = 0;
  let found = false;

  for (const turn of turns) {
    if (turn === null || typeof turn !== 'object') {
      continue;
    }

    const turnRecord = turn as Record<string, unknown>;
    if (typeof turnRecord.inputTokens === 'number') {
      inputTokens += turnRecord.inputTokens;
      found = true;
    }
    if (typeof turnRecord.outputTokens === 'number') {
      outputTokens += turnRecord.outputTokens;
      found = true;
    }
  }

  if (!found) {
    return { inputTokens: 0, outputTokens: fallbackTokenCount };
  }

  return { inputTokens, outputTokens };
}

async function enqueueSummarizeTranscriptJob(runId: string, transcriptId: string): Promise<void> {
  const boss = (await import('../boss.js')).getBoss();
  await boss.send(
    'summarize_transcript',
    { runId, transcriptId },
    {
      ...DEFAULT_JOB_OPTIONS['summarize_transcript'],
      singletonKey: transcriptId,
    }
  );
}

async function syncAnomalies(runId: string, type: AnomalyDraft['type'], drafts: AnomalyDraft[]): Promise<void> {
  await persistAnomalyDrafts(runId, drafts);

  const currentSubjects = new Set(drafts.map((draft) => draft.subject));
  const existing = await db.runAnomaly.findMany({
    where: { runId, type },
    select: { subject: true },
  });

  for (const anomaly of existing) {
    if (!currentSubjects.has(anomaly.subject)) {
      await resolveAnomaly({ runId, type, subject: anomaly.subject });
    }
  }
}

async function reconstructOrphans(runId: string): Promise<{ orphanIds: string[]; failedIds: string[]; reconstructedCount: number }> {
  const orphans = await findOrphanTranscripts(runId);
  const failedIds: string[] = [];
  let reconstructedCount = 0;

  for (const orphan of orphans) {
    if (orphan.scenarioId === null) {
      failedIds.push(orphan.id);
      continue;
    }

    try {
      const tokenUsage = extractTranscriptTokenUsage(orphan.content, orphan.tokenCount);
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
    } catch (error) {
      failedIds.push(orphan.id);
      log.warn({ runId, transcriptId: orphan.id, err: error }, 'Failed to reconstruct orphan transcript');
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

            await syncAnomalies(runId, stranded.type, [stranded]);
          } else {
            await syncAnomalies(runId, 'STRANDED_TRANSCRIPT', []);
          }
        } catch (error) {
          log.warn({ runId, err: error }, 'Late transcript rescue failed');
        }

        if (run.status === 'RUNNING' || run.status === 'SUMMARIZING' || run.status === 'PAUSED') {
          try {
            const advanceResult = await maybeAdvanceRunStatus(runId);
            log.debug({ runId, advanceResult }, 'Reconciled run state');
            run = (await getRunSnapshot(runId)) ?? run;
          } catch (error) {
            log.warn({ runId, err: error }, 'Failed to advance run state during reconciliation');
          }
        }

        try {
          const orphanResult = await reconstructOrphans(runId);
          if (orphanResult.failedIds.length > 0) {
            await syncAnomalies(runId, 'ORPHAN_TRANSCRIPT', [{
              type: 'ORPHAN_TRANSCRIPT',
              subject: '',
              details: {
                transcriptIds: orphanResult.failedIds,
              },
            }]);
          } else {
            await syncAnomalies(runId, 'ORPHAN_TRANSCRIPT', []);
          }

          if (orphanResult.reconstructedCount > 0 && run.status !== 'COMPLETED') {
            const postRepairAdvance = await maybeAdvanceRunStatus(runId);
            log.debug({ runId, postRepairAdvance }, 'Advanced run after orphan repair');
            run = (await getRunSnapshot(runId)) ?? run;
          }
        } catch (error) {
          log.warn({ runId, err: error }, 'Orphan transcript reconciliation failed');
        }

        if (run.status === 'COMPLETED') {
          try {
            const pair = await detectPairAsymmetry(run);
            await syncAnomalies(runId, 'PAIR_ASYMMETRY', pair === null ? [] : [pair]);
          } catch (error) {
            log.warn({ runId, err: error }, 'Pair asymmetry detection failed');
          }

          try {
            const shortfalls = await detectModelTranscriptShortfall(run);
            await syncAnomalies(runId, 'MODEL_TRANSCRIPT_SHORTFALL', shortfalls);
          } catch (error) {
            log.warn({ runId, err: error }, 'Model shortfall detection failed');
          }
        } else {
          try {
            const pair = await detectPairAsymmetry(run);
            await syncAnomalies(runId, 'PAIR_ASYMMETRY', pair === null ? [] : [pair]);
          } catch (error) {
            log.warn({ runId, err: error }, 'Pair asymmetry detection failed');
          }

          try {
            const stall = await detectSummarizingStall(run);
            await syncAnomalies(runId, 'SUMMARIZING_STALL', stall === null ? [] : [stall]);
          } catch (error) {
            log.warn({ runId, err: error }, 'Summarizing stall detection failed');
          }

          try {
            const scheduled = await detectScheduledCountMismatch(run);
            await syncAnomalies(runId, 'SCHEDULED_COUNT_MISMATCH', scheduled.draft === null ? [] : [scheduled.draft]);
            if (scheduled.draft !== null) {
              await repairScheduledCount(runId, scheduled.canonicalTotal);
            }
          } catch (error) {
            log.warn({ runId, err: error }, 'Scheduled count mismatch detection failed');
          }

          try {
            const shortfalls = await detectModelTranscriptShortfall(run);
            await syncAnomalies(runId, 'MODEL_TRANSCRIPT_SHORTFALL', shortfalls);
          } catch (error) {
            log.warn({ runId, err: error }, 'Model shortfall detection failed');
          }
        }

        log.info({ runId }, 'Run reconciliation completed');
      })
    );
  };
}
