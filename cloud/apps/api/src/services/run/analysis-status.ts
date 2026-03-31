import { db } from '@valuerank/db';
import { parseTemperature } from '../../utils/temperature.js';

type AnalysisQueueJob = {
  state: string;
  data: unknown;
};

export type RunAnalysisStatus = 'pending' | 'computing' | 'completed' | 'failed' | null;

type RunAnalysisStatusInput = {
  id: string;
  definitionId: string;
  status: string;
  completedAt: Date | null;
  config: unknown;
};

type AggregateRunConfig = {
  isAggregate?: boolean;
  definitionSnapshot?: unknown;
  temperature?: number | null;
};

type RunSnapshotMeta = {
  preambleVersionId: string | null;
  definitionVersion: number | null;
  temperatureSetting: number | null;
};

function parseDefinitionVersion(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSnapshotMeta(config: AggregateRunConfig | null): RunSnapshotMeta {
  const snapshot = (config?.definitionSnapshot ?? null) as
    | { _meta?: { preambleVersionId?: string; definitionVersion?: number | string }; preambleVersionId?: string; version?: number | string }
    | null;

  const preambleVersionId = snapshot?._meta?.preambleVersionId ?? snapshot?.preambleVersionId ?? null;
  const definitionVersion = parseDefinitionVersion(snapshot?._meta?.definitionVersion) ?? parseDefinitionVersion(snapshot?.version);
  const temperatureSetting = parseTemperature(config?.temperature);

  return { preambleVersionId, definitionVersion, temperatureSetting };
}

function getJobDataRecord(data: unknown): Record<string, unknown> | null {
  return data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

function matchesAggregateJob(jobData: unknown, runDefinitionId: string, runMeta: RunSnapshotMeta): boolean {
  const data = getJobDataRecord(jobData);
  if (data === null) return false;
  if (data.definitionId !== runDefinitionId) return false;

  const preambleVersionId =
    typeof data.preambleVersionId === 'string' && data.preambleVersionId !== ''
      ? data.preambleVersionId
      : null;
  const definitionVersion = parseDefinitionVersion(data.definitionVersion);
  const temperature = parseTemperature(data.temperature);
  const versionMatch = definitionVersion === null ? true : definitionVersion === runMeta.definitionVersion;

  return (
    preambleVersionId === runMeta.preambleVersionId &&
    versionMatch &&
    temperature === runMeta.temperatureSetting
  );
}

type AnalysisStatusLookup = {
  pendingBasicJobs: Map<string, AnalysisQueueJob>;
  failedBasicJobs: Set<string>;
  pendingAggregateJobsByDefinitionId: Map<string, AnalysisQueueJob[]>;
  failedAggregateJobsByDefinitionId: Map<string, AnalysisQueueJob[]>;
  currentAnalysisRunIds: Set<string>;
  queueUnavailable: boolean;
};

const ORPHANED_ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000;

async function loadAnalysisStatusLookup(runIds: string[], aggregateDefinitionIds: string[]): Promise<AnalysisStatusLookup> {
  const currentAnalysisRows = await db.analysisResult.findMany({
    where: {
      runId: { in: runIds },
      status: 'CURRENT',
      deletedAt: null,
    },
    select: { runId: true },
  });
  const currentAnalysisRunIds = new Set(currentAnalysisRows.map((row) => row.runId));

  let pendingBasicRows: AnalysisQueueJob[] = [];
  let failedBasicRows: AnalysisQueueJob[] = [];
  let pendingAggregateRows: AnalysisQueueJob[] = [];
  let failedAggregateRows: AnalysisQueueJob[] = [];

  try {
    pendingBasicRows = runIds.length > 0
      ? await db.$queryRaw<AnalysisQueueJob[]>`
          SELECT state, data FROM pgboss.job
          WHERE name = 'analyze_basic'
            AND data->>'runId' = ANY(${runIds}::text[])
            AND state IN ('created', 'active', 'retry')
          ORDER BY created_on DESC
        `
      : [];
    failedBasicRows = runIds.length > 0
      ? await db.$queryRaw<AnalysisQueueJob[]>`
          SELECT state, data FROM pgboss.job
          WHERE name = 'analyze_basic'
            AND data->>'runId' = ANY(${runIds}::text[])
            AND state = 'failed'
          ORDER BY completed_on DESC
        `
      : [];
    pendingAggregateRows = aggregateDefinitionIds.length > 0
      ? await db.$queryRaw<AnalysisQueueJob[]>`
          SELECT state, data FROM pgboss.job
          WHERE name = 'aggregate_analysis'
            AND data->>'definitionId' = ANY(${aggregateDefinitionIds}::text[])
            AND state IN ('created', 'active', 'retry')
          ORDER BY created_on DESC
        `
      : [];
    failedAggregateRows = aggregateDefinitionIds.length > 0
      ? await db.$queryRaw<AnalysisQueueJob[]>`
          SELECT state, data FROM pgboss.job
          WHERE name = 'aggregate_analysis'
            AND data->>'definitionId' = ANY(${aggregateDefinitionIds}::text[])
            AND state = 'failed'
          ORDER BY completed_on DESC
        `
      : [];
  } catch {
    return {
      pendingBasicJobs: new Map(),
      failedBasicJobs: new Set(),
      pendingAggregateJobsByDefinitionId: new Map(),
      failedAggregateJobsByDefinitionId: new Map(),
      currentAnalysisRunIds,
      queueUnavailable: true,
    };
  }

  const pendingBasicJobs = new Map<string, AnalysisQueueJob>();
  for (const job of pendingBasicRows) {
    const data = getJobDataRecord(job.data);
    const runId = typeof data?.runId === 'string' ? data.runId : null;
    if (runId === null || pendingBasicJobs.has(runId)) continue;
    pendingBasicJobs.set(runId, job);
  }
  const failedBasicJobs = new Set<string>();
  for (const job of failedBasicRows) {
    const data = getJobDataRecord(job.data);
    const runId = typeof data?.runId === 'string' ? data.runId : null;
    if (runId === null) continue;
    failedBasicJobs.add(runId);
  }

  const pendingAggregateJobsByDefinitionId = new Map<string, AnalysisQueueJob[]>();
  for (const job of pendingAggregateRows) {
    const data = getJobDataRecord(job.data);
    const definitionId = typeof data?.definitionId === 'string' ? data.definitionId : null;
    if (definitionId === null) continue;
    const jobs = pendingAggregateJobsByDefinitionId.get(definitionId) ?? [];
    jobs.push(job);
    pendingAggregateJobsByDefinitionId.set(definitionId, jobs);
  }
  const failedAggregateJobsByDefinitionId = new Map<string, AnalysisQueueJob[]>();
  for (const job of failedAggregateRows) {
    const data = getJobDataRecord(job.data);
    const definitionId = typeof data?.definitionId === 'string' ? data.definitionId : null;
    if (definitionId === null) continue;
    const jobs = failedAggregateJobsByDefinitionId.get(definitionId) ?? [];
    jobs.push(job);
    failedAggregateJobsByDefinitionId.set(definitionId, jobs);
  }

  return {
    pendingBasicJobs,
    failedBasicJobs,
    pendingAggregateJobsByDefinitionId,
    failedAggregateJobsByDefinitionId,
    currentAnalysisRunIds,
    queueUnavailable: false,
  };
}

function resolveSingleRunAnalysisStatus(
  run: RunAnalysisStatusInput,
  lookup: AnalysisStatusLookup,
): RunAnalysisStatus {
  if (lookup.currentAnalysisRunIds.has(run.id)) {
    return 'completed';
  }

  const runConfig = run.config as AggregateRunConfig | null;
  const isAggregateRun = runConfig?.isAggregate === true;

  try {
    if (isAggregateRun) {
      const runMeta = getSnapshotMeta(runConfig);
      const pendingJobs = lookup.pendingAggregateJobsByDefinitionId.get(run.definitionId) ?? [];
      const pendingJob = pendingJobs.find((job) => matchesAggregateJob(job.data, run.definitionId, runMeta));
      if (pendingJob !== undefined) {
        return pendingJob.state === 'active' ? 'computing' : 'pending';
      }

      const failedJobs = lookup.failedAggregateJobsByDefinitionId.get(run.definitionId) ?? [];
      const failedJob = failedJobs.find((job) => matchesAggregateJob(job.data, run.definitionId, runMeta));
      if (failedJob !== undefined) {
        return 'failed';
      }
    } else {
      const pendingJob = lookup.pendingBasicJobs.get(run.id);
      if (pendingJob !== undefined) {
        return pendingJob.state === 'active' ? 'computing' : 'pending';
      }

      if (lookup.failedBasicJobs.has(run.id)) {
        return 'failed';
      }
    }
  } catch {
    // PgBoss tables may not exist in some tests or local setups.
  }

  if (lookup.queueUnavailable) {
    return null;
  }

  if (run.completedAt) {
    const completedAt = new Date(run.completedAt);
    const fiveMinutesAgo = new Date(Date.now() - ORPHANED_ANALYSIS_TIMEOUT_MS);
    return completedAt < fiveMinutesAgo ? 'failed' : 'pending';
  }

  return null;
}

export async function resolveRunAnalysisStatuses(
  runs: RunAnalysisStatusInput[],
): Promise<Map<string, RunAnalysisStatus>> {
  const statuses = new Map<string, RunAnalysisStatus>();
  if (runs.length === 0) return statuses;

  const runIds = Array.from(new Set(runs.map((run) => run.id)));
  const aggregateDefinitionIds = Array.from(
    new Set(
      runs
        .map((run) => {
          const runConfig = run.config as AggregateRunConfig | null;
          return runConfig?.isAggregate === true ? run.definitionId : null;
        })
        .filter((definitionId): definitionId is string => definitionId !== null),
    ),
  );

  const lookup = await loadAnalysisStatusLookup(runIds, aggregateDefinitionIds);
  for (const run of runs) {
    statuses.set(run.id, resolveSingleRunAnalysisStatus(run, lookup));
  }
  return statuses;
}

export async function resolveRunAnalysisStatus(run: RunAnalysisStatusInput): Promise<RunAnalysisStatus> {
  const statuses = await resolveRunAnalysisStatuses([run]);
  return statuses.get(run.id) ?? null;
}
