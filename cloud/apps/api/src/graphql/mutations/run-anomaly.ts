import { db, type Prisma } from '@valuerank/db';
import { AppError, AuthenticationError, NotFoundError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { RunAnomalyRef } from '../types/refs.js';
import { parseSlotSubject } from '../types/run-anomaly.js';
import { getBoss } from '../../queue/boss.js';
import { DEFAULT_JOB_OPTIONS } from '../../queue/types.js';
import { getQueueNameForModel } from '../../services/parallelism/index.js';

const REPROBE_LIMIT = 3;

class ReprobeError extends AppError {
  constructor(message: string, code: string) {
    super(message, code, 400);
    this.name = 'ReprobeError';
  }
}

function readReprobeAttempts(details: unknown): number {
  if (details == null || typeof details !== 'object' || Array.isArray(details)) return 0;
  const value = (details as Record<string, unknown>).reprobeAttempts;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function buildIncrementedDetails(details: unknown, currentAttempts: number): Prisma.InputJsonValue {
  const base: Record<string, unknown> = (details != null && typeof details === 'object' && !Array.isArray(details))
    ? { ...(details as Record<string, unknown>) }
    : {};
  base.reprobeAttempts = currentAttempts + 1;
  base.reprobeStage = 'probing';
  return base as Prisma.InputJsonValue;
}

builder.mutationField('resolveRunAnomaly', (t) =>
  t.field({
    type: RunAnomalyRef,
    description: 'Manually mark an open run anomaly as resolved. Idempotent: resolving an already-resolved anomaly is a no-op success and returns the row unchanged. If the underlying condition is still detected on the next reconciliation pass, a fresh anomaly will be created (the unique constraint allows recreation because resolvedAt is non-null on the prior row).',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (ctx.user == null) {
        throw new AuthenticationError('Authentication required');
      }

      const id = String(args.id);
      const existing = await db.runAnomaly.findUnique({ where: { id } });
      if (existing === null) {
        throw new NotFoundError('RunAnomaly', id);
      }

      if (existing.resolvedAt !== null) {
        return existing;
      }

      const updated = await db.runAnomaly.update({
        where: { id },
        data: { resolvedAt: new Date() },
      });

      return updated;
    },
  }),
);

builder.mutationField('reprobeAnomalySlot', (t) =>
  t.field({
    type: RunAnomalyRef,
    description: 'Re-probe the slot associated with an INVALID_RESPONSE_FAILURE anomaly. Soft-deletes any existing transcript at the slot, hard-deletes the corresponding probe_results row, increments the anomaly\'s reprobeAttempts counter inside a transaction, then enqueues a new probe_scenario job (post-commit) with a slot-tuple singletonKey for queue-layer deduplication. Returns the updated anomaly. Errors: NOT_FOUND, ANOMALY_NOT_OPEN, ANOMALY_NOT_REPROBABLE, RUN_NOT_REPROBABLE, REPROBE_LIMIT_EXCEEDED, REPROBE_ALREADY_IN_FLIGHT, REPROBE_SCENARIO_REQUIRED.',
    args: {
      anomalyId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (ctx.user == null) {
        throw new AuthenticationError('Authentication required');
      }

      const anomalyId = String(args.anomalyId);

      const anomaly = await db.runAnomaly.findUnique({ where: { id: anomalyId } });
      if (anomaly === null) {
        throw new NotFoundError('RunAnomaly', anomalyId);
      }
      if (anomaly.resolvedAt !== null) {
        throw new ReprobeError('Anomaly is already resolved; cannot re-probe', 'ANOMALY_NOT_OPEN');
      }
      const REPROBABLE_MUTATION_TYPES = new Set(['INVALID_RESPONSE_FAILURE', 'STRANDED_TRANSCRIPT']);
      if (!REPROBABLE_MUTATION_TYPES.has(anomaly.type)) {
        throw new ReprobeError(`Anomaly type ${anomaly.type} is not reprobable`, 'ANOMALY_NOT_REPROBABLE');
      }

      const run = await db.run.findUnique({
        where: { id: anomaly.runId },
        select: { id: true, status: true, config: true },
      });
      if (run === null) {
        throw new NotFoundError('Run', anomaly.runId);
      }
      if (run.status === 'FAILED' || run.status === 'CANCELLED') {
        throw new ReprobeError(`Run is in terminal state ${run.status}; cannot re-probe`, 'RUN_NOT_REPROBABLE');
      }

      const currentAttempts = readReprobeAttempts(anomaly.details);
      if (currentAttempts >= REPROBE_LIMIT) {
        throw new ReprobeError(`Re-probe limit of ${REPROBE_LIMIT} reached for this slot`, 'REPROBE_LIMIT_EXCEEDED');
      }

      // ── STRANDED_TRANSCRIPT gap-fill path ───────────────────────────────────
      if (anomaly.type === 'STRANDED_TRANSCRIPT') {
        const runCfg = (run.config != null && typeof run.config === 'object' && !Array.isArray(run.config))
          ? (run.config as Record<string, unknown>)
          : {};
        const configModels = Array.isArray(runCfg.models) ? (runCfg.models as string[]) : [];
        const samplesPerScenario =
          typeof runCfg.samplesPerScenario === 'number' && runCfg.samplesPerScenario > 0
            ? runCfg.samplesPerScenario
            : 1;

        if (configModels.length === 0) {
          throw new ReprobeError('Run config has no models', 'ANOMALY_NOT_REPROBABLE');
        }

        const scenarioSelections = await db.runScenarioSelection.findMany({
          where: { runId: run.id },
          select: { scenarioId: true },
        });
        const selectedScenarioIds = scenarioSelections.map((s) => s.scenarioId);
        if (selectedScenarioIds.length === 0) {
          throw new ReprobeError('Run has no scenario selections', 'ANOMALY_NOT_REPROBABLE');
        }

        const existingResults = await db.probeResult.findMany({
          where: { runId: run.id },
          select: { scenarioId: true, modelId: true, sampleIndex: true },
        });
        const existingKeys = new Set(
          existingResults.map((r) => `${r.scenarioId}:${r.modelId}:${r.sampleIndex}`)
        );

        const missingSlots: Array<{ scenarioId: string; modelId: string; sampleIndex: number }> = [];
        for (const modelId of configModels) {
          for (const scenarioId of selectedScenarioIds) {
            for (let si = 0; si < samplesPerScenario; si++) {
              if (!existingKeys.has(`${scenarioId}:${modelId}:${si}`)) {
                missingSlots.push({ scenarioId, modelId, sampleIndex: si });
              }
            }
          }
        }

        if (missingSlots.length === 0) {
          return db.runAnomaly.update({
            where: { id: anomalyId },
            data: { resolvedAt: new Date() },
          });
        }

        const gapUpdated = await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT id FROM run_anomalies WHERE id = ${anomalyId} FOR UPDATE`;

          const locked = await tx.runAnomaly.findUnique({ where: { id: anomalyId } });
          if (locked === null) throw new NotFoundError('RunAnomaly', anomalyId);
          if (locked.resolvedAt !== null) {
            throw new ReprobeError('Anomaly was resolved by another process during re-probe', 'ANOMALY_NOT_OPEN');
          }
          const lockedAttempts = readReprobeAttempts(locked.details);
          if (lockedAttempts >= REPROBE_LIMIT) {
            throw new ReprobeError(`Re-probe limit of ${REPROBE_LIMIT} reached`, 'REPROBE_LIMIT_EXCEEDED');
          }

          // Re-open run and expand progress.total to cover the gap-fill probes.
          // Uses to_jsonb() so the stored value stays a JSON number, not a string.
          await tx.$executeRaw`
            UPDATE runs
            SET progress     = jsonb_set(
                                 progress,
                                 '{total}',
                                 to_jsonb(COALESCE((progress->>'total')::int, 0) + ${missingSlots.length}::int)
                               ),
                status       = 'RUNNING',
                completed_at = NULL
            WHERE id = ${run.id}
              AND status NOT IN ('FAILED', 'CANCELLED')
          `;

          return tx.runAnomaly.update({
            where: { id: anomalyId },
            data: {
              resolvedAt: null,
              details: buildIncrementedDetails(locked.details, lockedAttempts),
              lastSeenAt: new Date(),
            },
          });
        });

        // Enqueue a probe job for each missing slot (post-commit).
        // No anomalyId: the normal run state machine (RUNNING → SUMMARIZING → COMPLETED)
        // handles summarization once all probes complete.
        const boss = getBoss();
        const jobOptions = DEFAULT_JOB_OPTIONS['probe_scenario'];
        let enqueueErrors = 0;
        for (const slot of missingSlots) {
          const queueName = await getQueueNameForModel(slot.modelId);
          const singletonKey = `${run.id}:${slot.scenarioId}:${slot.modelId}:${slot.sampleIndex}`;
          try {
            await boss.send(
              queueName,
              {
                runId: run.id,
                scenarioId: slot.scenarioId,
                modelId: slot.modelId,
                sampleIndex: slot.sampleIndex,
                enqueuedAt: new Date().toISOString(),
                config: { maxTurns: 10 },
              },
              { ...jobOptions, singletonKey },
            );
          } catch (error) {
            enqueueErrors++;
          }
        }

        if (enqueueErrors > 0 && enqueueErrors === missingSlots.length) {
          throw new ReprobeError(
            `All ${missingSlots.length} gap-fill probe enqueues failed after DB commit`,
            'REPROBE_ENQUEUE_FAILED',
          );
        }

        return gapUpdated;
      }
      // ── end STRANDED_TRANSCRIPT path ─────────────────────────────────────────

      const slot = parseSlotSubject(anomaly.subject);
      if (slot === null) {
        throw new ReprobeError(`Anomaly subject ${anomaly.subject} is not a valid slot tuple`, 'ANOMALY_NOT_REPROBABLE');
      }
      if (slot.scenarioId === null) {
        // probe_scenario job payload requires scenarioId; we cannot re-enqueue without it.
        throw new ReprobeError('Cannot re-probe a slot whose scenario has been deleted', 'REPROBE_SCENARIO_REQUIRED');
      }
      const scenarioId: string = slot.scenarioId;

      // Pre-flight check: refuse if a probe_scenario job is already pending for this slot.
      // The post-commit boss.send also uses singletonKey for queue-layer dedup as a backstop.
      const queueName = await getQueueNameForModel(slot.modelId);
      const pendingProbe = await db.$queryRaw<Array<{ exists: boolean }>>`
        SELECT 1 AS exists FROM pgboss.job
        WHERE name = ${queueName}
          AND state IN ('created', 'retry', 'active')
          AND data->>'runId' = ${slot.runId}
          AND data->>'scenarioId' = ${scenarioId}
          AND data->>'modelId' = ${slot.modelId}
          AND (data->>'sampleIndex')::int = ${slot.sampleIndex}
        LIMIT 1
      `;
      if (pendingProbe.length > 0) {
        throw new ReprobeError('A probe job for this slot is already pending', 'REPROBE_ALREADY_IN_FLIGHT');
      }

      const updated = await db.$transaction(async (tx) => {
        // Lock the anomaly row for the duration of the transaction. Concurrent
        // re-probe clicks for the same anomaly serialize at this point.
        await tx.$executeRaw`SELECT id FROM run_anomalies WHERE id = ${anomalyId} FOR UPDATE`;

        // Re-read inside the transaction to defend against TOCTOU on resolvedAt
        // and reprobeAttempts.
        const locked = await tx.runAnomaly.findUnique({ where: { id: anomalyId } });
        if (locked === null) {
          throw new NotFoundError('RunAnomaly', anomalyId);
        }
        if (locked.resolvedAt !== null) {
          throw new ReprobeError('Anomaly was resolved by another process during re-probe', 'ANOMALY_NOT_OPEN');
        }
        const lockedAttempts = readReprobeAttempts(locked.details);
        if (lockedAttempts >= REPROBE_LIMIT) {
          throw new ReprobeError(`Re-probe limit of ${REPROBE_LIMIT} reached for this slot`, 'REPROBE_LIMIT_EXCEEDED');
        }

        // Soft-delete any non-deleted transcript at the slot. Historical-path
        // anomalies have one; forward-path anomalies do not.
        await tx.transcript.updateMany({
          where: {
            runId: slot.runId,
            scenarioId,
            modelId: slot.modelId,
            sampleIndex: slot.sampleIndex,
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });

        // Hard-delete any probe_results row at the slot. Both forward and
        // historical paths have one (FAILED for forward, SUCCESS for historical).
        // The probe_scenario handler's idempotency guard at handler.ts:82-92
        // requires the row to be gone before a fresh probe job will run.
        await tx.probeResult.deleteMany({
          where: {
            runId: slot.runId,
            scenarioId,
            modelId: slot.modelId,
            sampleIndex: slot.sampleIndex,
          },
        });

        const persisted = await tx.runAnomaly.update({
          where: { id: anomalyId },
          data: {
            details: buildIncrementedDetails(locked.details, lockedAttempts),
            lastSeenAt: new Date(),
          },
        });

        return persisted;
      });

      // Enqueue post-commit. boss.send is not transactional, so a failure here
      // leaves the slot in a soft-deleted state with the anomaly still open and
      // reprobeAttempts incremented. The user sees an error chip in the UI
      // (Wave 3) and can retry. We do NOT roll back the transaction — that
      // would leave the singletonKey conflict unresolved for the next attempt.
      const singletonKey = `${slot.runId}:${scenarioId}:${slot.modelId}:${slot.sampleIndex}`;
      const jobOptions = DEFAULT_JOB_OPTIONS['probe_scenario'];
      const boss = getBoss();
      try {
        await boss.send(
          queueName,
          {
            runId: slot.runId,
            scenarioId,
            modelId: slot.modelId,
            sampleIndex: slot.sampleIndex,
            config: { maxTurns: 10 },
            manualReprobe: true,
            anomalyId,
          },
          { ...jobOptions, singletonKey },
        );
      } catch (error) {
        // The DB writes have committed; surface the failure to the caller.
        throw new ReprobeError(
          `Re-probe job enqueue failed after DB commit: ${(error as Error).message}`,
          'REPROBE_ENQUEUE_FAILED',
        );
      }

      return updated;
    },
  }),
);
