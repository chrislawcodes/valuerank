import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { ACTIVE_PROBE_QUEUE_SQL } from '../queue/probe-queues.js';
import { computeRunProgress } from './derived-progress.js';

const log = createLogger('services:run:stall-detection');

export const STALL_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

export async function getModelsWithPendingJobs(runId: string): Promise<string[]> {
  const result = await db.$queryRaw<Array<{ model_id: string }>>`
    SELECT DISTINCT data->>'modelId' as model_id
    FROM pgboss.job
    WHERE ${ACTIVE_PROBE_QUEUE_SQL}
      AND state IN ('created', 'retry', 'active')
      AND data->>'runId' = ${runId}
  `;
  return result.map(r => r.model_id).filter(Boolean);
}

export async function getLastSuccessfulCompletionByModel(runId: string): Promise<Map<string, Date>> {
  const result = await db.$queryRaw<Array<{ model_id: string; last_completion: Date }>>`
    SELECT model_id, MAX(completed_at) as last_completion
    FROM probe_results
    WHERE run_id = ${runId}
      AND deleted_at IS NULL
      AND status = 'SUCCESS'
      AND completed_at IS NOT NULL
    GROUP BY model_id
  `;
  const map = new Map<string, Date>();
  for (const row of result) {
    map.set(row.model_id, row.last_completion);
  }
  return map;
}

export async function detectStalledModels(runId: string, runStartedAt: Date): Promise<string[]> {
  const now = Date.now();
  const threshold = now - STALL_THRESHOLD_MS;
  const runIsOldEnough = runStartedAt.getTime() < threshold;

  const pendingModels = await getModelsWithPendingJobs(runId);
  if (pendingModels.length === 0) return [];

  const lastSuccess = await getLastSuccessfulCompletionByModel(runId);
  const stalled: string[] = [];

  for (const modelId of pendingModels) {
    const lastSuccessTime = lastSuccess.get(modelId);
    if (lastSuccessTime === undefined) {
      // Never succeeded — stall only if run has been running long enough
      if (runIsOldEnough) stalled.push(modelId);
    } else if (lastSuccessTime.getTime() < threshold) {
      stalled.push(modelId);
    }
  }

  return stalled;
}

export async function detectProgressStalls(
  runId: string,
  config: { models?: string[]; samplesPerScenario?: number },
  scenarioCount: number,
): Promise<string[]> {
  const models = config.models ?? [];
  const samplesPerScenario = config.samplesPerScenario ?? 1;
  if (models.length === 0 || scenarioCount === 0) return [];

  const expectedPerModel = scenarioCount * samplesPerScenario;

  const transcriptCounts = await db.$queryRaw<Array<{ model_id: string; cnt: bigint }>>`
    SELECT model_id, COUNT(*) as cnt
    FROM transcripts
    WHERE run_id = ${runId}
      AND deleted_at IS NULL
    GROUP BY model_id
  `;

  const countByModel = new Map<string, number>();
  for (const row of transcriptCounts) {
    countByModel.set(row.model_id, Number(row.cnt));
  }

  return models.filter(modelId => (countByModel.get(modelId) ?? 0) < expectedPerModel);
}

export async function updateRunStalledModels(
  run: { id: string; stalledModels: string[] },
  newStalled: string[]
): Promise<void> {
  const newlyStalled = newStalled.filter(m => !run.stalledModels.includes(m));
  if (newlyStalled.length > 0) {
    log.warn({ runId: run.id, newlyStalled }, 'Stall detected: models not making progress');
  }

  const changed =
    newStalled.length !== run.stalledModels.length ||
    newStalled.some(m => !run.stalledModels.includes(m));

  if (changed) {
    await db.run.update({
      where: { id: run.id },
      data: { stalledModels: newStalled },
    });
  }
}

export async function detectAndUpdateStalledRuns(): Promise<{
  checked: number;
  newStalls: number;
  totalStalled: number;
}> {
  const runningRuns = await db.run.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, stalledModels: true, startedAt: true, config: true },
  });

  let newStalls = 0;
  let totalStalled = 0;

  for (const run of runningRuns) {
    if (run.startedAt == null) {
      log.error({ runId: run.id }, 'RUNNING run has null startedAt — skipping stall detection');
      continue;
    }

    let stalled = await detectStalledModels(run.id, run.startedAt);

    // If no queue-level stalls, check for progress stalls (jobs vanished from queue)
    if (stalled.length === 0) {
      const progress = await computeRunProgress(run.id);
      const done = progress.completed + progress.failed;
      if (done < progress.total) {
        // Check that there are truly zero pending/active jobs
        const pendingModels = await getModelsWithPendingJobs(run.id);
        if (pendingModels.length === 0) {
          const config = run.config as { models?: string[]; samplesPerScenario?: number } | null;
          const scenarioCount = await db.runScenarioSelection.count({ where: { runId: run.id } });
          stalled = await detectProgressStalls(run.id, config ?? {}, scenarioCount);
          if (stalled.length > 0) {
            log.warn(
              { runId: run.id, stalledModels: stalled, progress },
              'Progress stall detected: incomplete progress with no pending jobs'
            );
          }
        }
      }
    }

    const newlyStalled = stalled.filter(m => !run.stalledModels.includes(m));
    if (newlyStalled.length > 0) newStalls++;
    if (stalled.length > 0) totalStalled++;
    await updateRunStalledModels(run, stalled);
  }

  return { checked: runningRuns.length, newStalls, totalStalled };
}
