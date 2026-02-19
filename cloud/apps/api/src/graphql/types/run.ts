import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { RunRef, DefinitionRef, TranscriptRef, ExperimentRef, LlmModelRef, TagRef } from './refs.js';
import { UserRef } from './user.js';
import { RunProgress, TaskResult } from './run-progress.js';
import { ExecutionMetrics } from './execution-metrics.js';
import { ProbeResultRef, ProbeResultModelSummary } from './probe-result.js';
import { calculatePercentComplete } from '../../services/run/index.js';
import { AnalysisResultRef } from './analysis.js';
import { CostEstimateRef, type CostEstimateShape } from './cost-estimate.js';
import { getAllMetrics, getTotals } from '../../services/rate-limiter/index.js';

// Re-export for backward compatibility
export { RunRef, TranscriptRef, ExperimentRef };

// Type for progress data stored in JSONB
type ProgressData = {
  total: number;
  completed: number;
  failed: number;
};

// Type for run config stored in JSONB
type RunConfig = {
  models?: string[];
  samplePercentage?: number;
  sampleSeed?: number;
  samplesPerScenario?: number; // Multi-sample: number of samples per scenario-model pair
  priority?: string;
  definitionSnapshot?: unknown;
  estimatedCosts?: CostEstimateShape;
};

type AggregateRunConfig = RunConfig & {
  isAggregate?: boolean;
  sourceRunIds?: string[];
};

type RunSnapshotMeta = {
  preambleVersionId: string | null;
  definitionVersion: number | null;
};

type QueueJobRow = {
  state: string;
  data: unknown;
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

  const preambleVersionId =
    snapshot?._meta?.preambleVersionId ??
    snapshot?.preambleVersionId ??
    null;
  const definitionVersion =
    parseDefinitionVersion(snapshot?._meta?.definitionVersion) ??
    parseDefinitionVersion(snapshot?.version);

  return { preambleVersionId, definitionVersion };
}

function getJobDataRecord(data: unknown): Record<string, unknown> | null {
  return data !== null && typeof data === 'object' ? data as Record<string, unknown> : null;
}

function normalizeTaskError(output: unknown): string | null {
  if (output === null || output === undefined) {
    return null;
  }

  if (typeof output === 'string') {
    return output;
  }

  if (typeof output !== 'object') {
    return String(output);
  }

  const record = output as Record<string, unknown>;
  const parts: string[] = [];

  const pushIfPresent = (value: unknown): void => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    if (!parts.includes(trimmed)) {
      parts.push(trimmed);
    }
  };

  // Common pg-boss/output shapes for thrown errors and worker payloads.
  pushIfPresent(record.message);
  pushIfPresent(record.details);

  const error = record.error;
  if (error !== null && typeof error === 'object') {
    const nested = error as Record<string, unknown>;
    pushIfPresent(nested.message);
    pushIfPresent(nested.details);
  } else {
    pushIfPresent(error);
  }

  const value = record.value;
  if (value !== null && typeof value === 'object') {
    const nested = value as Record<string, unknown>;
    pushIfPresent(nested.message);
    pushIfPresent(nested.details);
  }

  if (parts.length > 0) {
    return parts.join(' | ');
  }

  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function matchesAggregateJob(jobData: unknown, runDefinitionId: string, runMeta: RunSnapshotMeta): boolean {
  const data = getJobDataRecord(jobData);
  if (data === null) {
    return false;
  }
  if (data.definitionId !== runDefinitionId) {
    return false;
  }

  const jobPreambleVersionId =
    typeof data.preambleVersionId === 'string' && data.preambleVersionId !== ''
      ? data.preambleVersionId
      : null;
  if (jobPreambleVersionId !== runMeta.preambleVersionId) {
    return false;
  }

  const jobDefinitionVersion = parseDefinitionVersion(data.definitionVersion);
  if (jobDefinitionVersion !== runMeta.definitionVersion) {
    return false;
  }

  return true;
}

builder.objectType(RunRef, {
  description: 'A run execution against a definition',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name', {
      nullable: true,
      description: 'Optional user-defined name for this run',
    }),
    definitionId: t.exposeString('definitionId'),
    experimentId: t.exposeString('experimentId', { nullable: true }),

    // Snapshot version used for this run
    definitionVersion: t.int({
      nullable: true,
      description: 'The version of the definition used in this run (from snapshot)',
      resolve: (run) => {
        const config = run.config as {
          definitionSnapshot?: {
            _meta?: { definitionVersion?: number | string };
            version?: number | string;
          };
        };
        const versionRaw = config.definitionSnapshot?._meta?.definitionVersion ?? config.definitionSnapshot?.version;
        if (typeof versionRaw === 'number') return versionRaw;
        if (typeof versionRaw === 'string' && versionRaw.trim() !== '') {
          const parsed = parseInt(versionRaw, 10);
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      },
    }),

    // Tags
    tags: t.field({
      type: [TagRef],
      description: 'Tags associated with this run',
      resolve: async (run) => {
        const runTags = await db.runTag.findMany({
          where: { runId: run.id },
          include: { tag: true },
        });
        return runTags.map((rt) => rt.tag);
      },
    }),

    // Models used in this run
    models: t.field({
      type: [LlmModelRef],
      description: 'List of LLM models used in this run',
      resolve: async (run) => {
        const config = run.config as RunConfig | null;
        const modelIds = config?.models ?? [];
        if (modelIds.length === 0) return [];

        return db.llmModel.findMany({
          where: { modelId: { in: modelIds } },
        });
      },
    }),

    status: t.exposeString('status', {
      description: 'Current status of the run (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)',
    }),
    config: t.expose('config', { type: 'JSON' }),
    definitionSnapshot: t.field({
      type: 'JSON',
      nullable: true,
      description: 'Snapshot of the definition version used for this run',
      resolve: (run) => {
        const config = run.config as RunConfig | null;
        return config?.definitionSnapshot ?? null;
      },
    }),
    // Keep raw progress as JSON for backward compatibility
    progress: t.expose('progress', { type: 'JSON', nullable: true }),
    startedAt: t.expose('startedAt', { type: 'DateTime', nullable: true }),
    completedAt: t.expose('completedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    lastAccessedAt: t.expose('lastAccessedAt', { type: 'DateTime', nullable: true }),

    // Audit field: who created this run
    createdBy: t.field({
      type: UserRef,
      nullable: true,
      description: 'User who started this run',
      resolve: async (run) => {
        if (run.createdByUserId === null || run.createdByUserId === undefined || run.createdByUserId === '') return null;
        return db.user.findUnique({
          where: { id: run.createdByUserId },
        });
      },
    }),

    // Audit field: who deleted this run
    deletedBy: t.field({
      type: UserRef,
      nullable: true,
      description: 'User who deleted this run (only populated for soft-deleted records)',
      resolve: async (run) => {
        if (run.deletedByUserId === null || run.deletedByUserId === undefined || run.deletedByUserId === '') return null;
        return db.user.findUnique({
          where: { id: run.deletedByUserId },
        });
      },
    }),

    // Structured progress with percentComplete calculation
    runProgress: t.field({
      type: RunProgress,
      nullable: true,
      description: 'Structured progress information with percentComplete',
      resolve: async (run) => {
        const progress = run.progress as ProgressData | null;
        if (progress === null) return null;

        // Query per-model counts from ProbeResult
        const byModelResults = await db.probeResult.groupBy({
          by: ['modelId', 'status'],
          where: { runId: run.id },
          _count: { _all: true },
        });

        // Aggregate by model
        const modelMap = new Map<string, { completed: number; failed: number }>();
        for (const result of byModelResults) {
          const existing = modelMap.get(result.modelId) ?? { completed: 0, failed: 0 };
          if (result.status === 'SUCCESS') {
            existing.completed = result._count._all;
          } else if (result.status === 'FAILED') {
            existing.failed = result._count._all;
          }
          modelMap.set(result.modelId, existing);
        }

        const byModel = Array.from(modelMap.entries()).map(([modelId, counts]) => ({
          modelId,
          completed: counts.completed,
          failed: counts.failed,
        }));

        return {
          total: progress.total,
          completed: progress.completed,
          failed: progress.failed,
          percentComplete: calculatePercentComplete(progress),
          byModel: byModel.length > 0 ? byModel : undefined,
        };
      },
    }),

    // Summarize progress for SUMMARIZING state
    summarizeProgress: t.field({
      type: RunProgress,
      nullable: true,
      description: 'Progress information for transcript summarization (only populated in SUMMARIZING state)',
      resolve: async (run) => {
        const progress = run.summarizeProgress as ProgressData | null;
        if (progress === null) return null;

        // Query per-model counts from Transcript
        // Use raw query for efficient COUNT with FILTER
        const byModelResults = await db.$queryRaw<
          Array<{ model_id: string; completed: bigint; failed: bigint }>
        >`
          SELECT
            model_id,
            COUNT(*) FILTER (WHERE summarized_at IS NOT NULL) as completed,
            COUNT(*) FILTER (WHERE decision_code = 'error') as failed
          FROM transcripts
          WHERE run_id = ${run.id}
          GROUP BY model_id
        `;

        const byModel = byModelResults.map((row) => ({
          modelId: row.model_id,
          completed: Number(row.completed),
          failed: Number(row.failed),
        }));

        // Calculate totals dynamically from the actual transcript counts
        // This avoids race conditions where the stored JSON progress drifts from reality (e.g., getting 7/6)
        const dynamicCompleted = byModel.reduce((sum, m) => sum + m.completed, 0);
        const dynamicFailed = byModel.reduce((sum, m) => sum + m.failed, 0);

        return {
          total: progress.total,
          completed: dynamicCompleted,
          failed: dynamicFailed,
          percentComplete: Math.min(100, Math.round(((dynamicCompleted + dynamicFailed) / progress.total) * 100)),
          byModel: byModel.length > 0 ? byModel : undefined,
        };
      },
    }),

    // Recent completed/failed tasks from PgBoss
    recentTasks: t.field({
      type: [TaskResult],
      args: {
        limit: t.arg.int({
          required: false,
          defaultValue: 5,
          description: 'Maximum number of recent tasks to return',
        }),
      },
      description: 'Recent completed or failed tasks for this run',
      resolve: async (run, args) => {
        const limit = args.limit ?? 5;

        try {
          // Query completed/failed jobs from PgBoss job table
          // Note: PgBoss v10+ no longer uses a separate archive table
          const completedJobs = await db.$queryRaw<Array<{
            id: string;
            data: { runId: string; scenarioId: string; modelId: string };
            state: string;
            completed_on: Date | null;
            output: unknown;
          }>>`
            SELECT id, data, state, completed_on, output
            FROM pgboss.job
            WHERE name = 'probe_scenario'
              AND data->>'runId' = ${run.id}
              AND state IN ('completed', 'failed')
            ORDER BY completed_on DESC NULLS LAST
            LIMIT ${limit}
          `;

          return completedJobs.map((job) => ({
            scenarioId: job.data.scenarioId,
            modelId: job.data.modelId,
            status: (job.state === 'completed' ? 'COMPLETED' : 'FAILED') as 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED',
            error: job.state === 'failed' ? normalizeTaskError(job.output) : null,
            completedAt: job.completed_on,
          }));
        } catch {
          // If PgBoss tables don't exist or query fails, return empty array
          return [];
        }
      },
    }),

    // Relation: definition (nullable if definition was deleted)
    definition: t.field({
      type: DefinitionRef,
      nullable: true,
      resolve: async (run, _args, ctx) => {
        const definition = await ctx.loaders.definition.load(run.definitionId);
        return definition ?? null;
      },
    }),

    // Relation: experiment (optional)
    experiment: t.field({
      type: ExperimentRef,
      nullable: true,
      resolve: async (run, _args, ctx) => {
        if (run.experimentId === null || run.experimentId === undefined || run.experimentId === '') return null;
        return ctx.loaders.experiment.load(run.experimentId);
      },
    }),

    // Relation: transcripts with optional model filter and pagination
    transcripts: t.field({
      type: [TranscriptRef],
      args: {
        modelId: t.arg.string({
          required: false,
          description: 'Filter transcripts by model ID',
        }),
        limit: t.arg.int({
          required: false,
          description: 'Maximum number of transcripts to return (default: all, max: 1000)',
        }),
        offset: t.arg.int({
          required: false,
          description: 'Number of transcripts to skip for pagination (default: 0)',
        }),
      },
      resolve: async (run, args, ctx) => {
        const config = run.config as AggregateRunConfig;
        const sourceRunIds = (config?.isAggregate === true && Array.isArray(config.sourceRunIds))
          ? config.sourceRunIds
          : null;

        // When pagination is requested, do a direct DB query instead of using dataloader
        if (args.limit !== undefined || args.offset !== undefined) {
          const limit = Math.min(args.limit ?? 1000, 1000);
          const offset = args.offset ?? 0;

          return db.transcript.findMany({
            where: {
              runId: sourceRunIds !== null ? { in: sourceRunIds } : run.id,
              ...(typeof args.modelId === 'string' && args.modelId !== '' ? { modelId: args.modelId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
          });
        }

        if (sourceRunIds !== null) {
          return ctx.loaders.transcriptsByAggregateRuns.load({
            sourceRunIds,
            modelId: args.modelId,
          });
        }

        // No pagination - use dataloader for batching
        const transcripts = await ctx.loaders.transcriptsByRun.load(run.id);
        if (typeof args.modelId === 'string' && args.modelId !== '') {
          return transcripts.filter((t) => t.modelId === args.modelId);
        }
        return transcripts;
      },
    }),

    // Computed: transcript count
    transcriptCount: t.field({
      type: 'Int',
      resolve: async (run, _args, ctx) => {
        const config = run.config as RunConfig & { transcriptCount?: number };
        // If pre-computed transcript count exists (e.g. for Aggregate runs), use it
        if (typeof config?.transcriptCount === 'number') {
          return config.transcriptCount;
        }

        const transcripts = await ctx.loaders.transcriptsByRun.load(run.id);
        return transcripts.length;
      },
    }),

    // Relation: selected scenarios for this run
    selectedScenarios: t.field({
      type: ['String'],
      description: 'IDs of scenarios selected for this run',
      resolve: async (run) => {
        const selections = await db.runScenarioSelection.findMany({
          where: { runId: run.id },
          select: { scenarioId: true },
        });
        return selections.map((s) => s.scenarioId);
      },
    }),

    // Multi-sample configuration
    samplesPerScenario: t.field({
      type: 'Int',
      description: 'Number of samples per scenario-model pair for multi-sample runs. Default is 1 for single-sample runs.',
      resolve: (run) => {
        const config = run.config as RunConfig | null;
        return config?.samplesPerScenario ?? 1;
      },
    }),

    // Analysis result for this run
    analysis: t.field({
      type: AnalysisResultRef,
      nullable: true,
      description: 'Most recent analysis result for this run',
      resolve: async (run) => {
        const analysis = await db.analysisResult.findFirst({
          where: {
            runId: run.id,
            status: 'CURRENT',
          },
          orderBy: { createdAt: 'desc' },
        });
        return analysis;
      },
    }),

    // Analysis status derived from job queue and analysis result
    analysisStatus: t.field({
      type: 'String',
      nullable: true,
      description: 'Analysis status: pending, computing, completed, or failed',
      resolve: async (run) => {
        // Check if analysis exists
        const analysis = await db.analysisResult.findFirst({
          where: {
            runId: run.id,
            status: 'CURRENT',
          },
        });

        if (analysis !== null && analysis !== undefined) {
          return 'completed';
        }

        const runConfig = run.config as AggregateRunConfig | null;
        const isAggregateRun = runConfig?.isAggregate === true;

        // Check if analysis job is pending or active
        try {
          if (isAggregateRun) {
            const runMeta = getSnapshotMeta(runConfig);

            const activeJobs = await db.$queryRaw<QueueJobRow[]>`
              SELECT state, data FROM pgboss.job
              WHERE name = 'aggregate_analysis'
                AND data->>'definitionId' = ${run.definitionId}
                AND state IN ('created', 'active', 'retry')
              ORDER BY created_on DESC
              LIMIT 25
            `;

            const firstActiveMatch = activeJobs.find((job) =>
              matchesAggregateJob(job.data, run.definitionId, runMeta)
            );
            if (firstActiveMatch !== undefined) {
              return firstActiveMatch.state === 'active' ? 'computing' : 'pending';
            }

            const failedJobs = await db.$queryRaw<QueueJobRow[]>`
              SELECT state, data FROM pgboss.job
              WHERE name = 'aggregate_analysis'
                AND data->>'definitionId' = ${run.definitionId}
                AND state = 'failed'
              ORDER BY completed_on DESC
              LIMIT 25
            `;

            const firstFailedMatch = failedJobs.find((job) =>
              matchesAggregateJob(job.data, run.definitionId, runMeta)
            );
            if (firstFailedMatch !== undefined) {
              return 'failed';
            }
          } else {
            // Use raw query to check PgBoss job state
            const jobs = await db.$queryRaw<Array<{ state: string }>>`
              SELECT state FROM pgboss.job
              WHERE name = 'analyze_basic'
                AND data->>'runId' = ${run.id}
                AND state IN ('created', 'active', 'retry')
              LIMIT 1
            `;

            const firstJob = jobs[0];
            if (firstJob !== undefined) {
              return firstJob.state === 'active' ? 'computing' : 'pending';
            }

            // Check for failed jobs in the job table (PgBoss v10+ keeps all jobs in one table)
            const failedJobs = await db.$queryRaw<Array<{ state: string }>>`
              SELECT state FROM pgboss.job
              WHERE name = 'analyze_basic'
                AND data->>'runId' = ${run.id}
                AND state = 'failed'
              ORDER BY completed_on DESC
              LIMIT 1
            `;

            if (failedJobs.length > 0) {
              return 'failed';
            }
          }
        } catch {
          // PgBoss tables may not exist
        }

        // No analysis and no recognized job state
        // If run is completed and older than 5 minutes, assume analysis failed to start/complete (orphaned)
        if (run.completedAt) {
          const completedAt = new Date(run.completedAt);
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

          if (completedAt < fiveMinutesAgo) {
            return 'failed';
          }

          // Otherwise, it might be just finished and job is about to be queued
          return 'pending';
        }

        return null; // Not completed yet, so no analysis expected
      },
    }),

    // Real-time execution metrics (only populated during RUNNING state)
    executionMetrics: t.field({
      type: ExecutionMetrics,
      nullable: true,
      description: 'Real-time execution metrics for monitoring parallel processing (only available during RUNNING state)',
      resolve: async (run) => {
        // Only show execution metrics for active runs
        if (!['PENDING', 'RUNNING'].includes(run.status)) {
          return null;
        }

        const providers = (await getAllMetrics()).map((provider) => ({
          ...provider,
          // Restrict recent completion samples to this run only.
          recentCompletions: provider.recentCompletions.filter((completion) => completion.runId === run.id),
        }));
        const { totalActive, totalQueued } = getTotals();

        // Calculate estimated time remaining based on progress and throughput
        const progress = run.progress as ProgressData | null;
        let estimatedSecondsRemaining: number | null = null;

        if (progress !== null && progress !== undefined) {
          const remaining = progress.total - progress.completed - progress.failed;
          if (remaining > 0 && totalActive > 0) {
            // Rough estimate: assume average of 5 seconds per job
            // In production, calculate from recent completion times
            const avgJobTime = 5;
            estimatedSecondsRemaining = Math.ceil((remaining * avgJobTime) / Math.max(1, totalActive));
          }
        }

        return {
          providers,
          totalActive,
          totalQueued,
          estimatedSecondsRemaining,
        };
      },
    }),

    // Probe results - detailed success/failure info for each model/scenario with pagination
    probeResults: t.field({
      type: [ProbeResultRef],
      args: {
        status: t.arg.string({
          required: false,
          description: 'Filter by status (SUCCESS or FAILED)',
        }),
        modelId: t.arg.string({
          required: false,
          description: 'Filter by model ID',
        }),
        limit: t.arg.int({
          required: false,
          description: 'Maximum number of results to return (default: all, max: 1000)',
        }),
        offset: t.arg.int({
          required: false,
          description: 'Number of results to skip for pagination (default: 0)',
        }),
      },
      description: 'Probe results with detailed success/failure information',
      resolve: async (run, args) => {
        const where: { runId: string; status?: 'SUCCESS' | 'FAILED'; modelId?: string } = {
          runId: run.id,
        };
        if (args.status === 'SUCCESS' || args.status === 'FAILED') {
          where.status = args.status;
        }
        if (typeof args.modelId === 'string' && args.modelId !== '') {
          where.modelId = args.modelId;
        }

        const limit = args.limit != null ? Math.min(args.limit, 1000) : undefined;
        const offset = args.offset ?? 0;

        return db.probeResult.findMany({
          where,
          orderBy: [{ status: 'asc' }, { modelId: 'asc' }, { scenarioId: 'asc' }],
          ...(limit !== undefined ? { take: limit, skip: offset } : {}),
        });
      },
    }),

    // Probe results summary by model
    probeResultsByModel: t.field({
      type: [ProbeResultModelSummary],
      description: 'Summary of probe results grouped by model, with error codes',
      resolve: async (run) => {
        // Get all probe results for this run
        const results = await db.probeResult.findMany({
          where: { runId: run.id },
          select: { modelId: true, status: true, errorCode: true },
        });

        // Group by model
        const byModel: Record<string, { success: number; failed: number; errorCodes: Set<string> }> = {};
        for (const result of results) {
          const modelEntry = byModel[result.modelId] ?? { success: 0, failed: 0, errorCodes: new Set<string>() };
          byModel[result.modelId] = modelEntry;

          if (result.status === 'SUCCESS') {
            modelEntry.success++;
          } else {
            modelEntry.failed++;
            if (result.errorCode !== null && result.errorCode !== undefined && result.errorCode !== '') {
              modelEntry.errorCodes.add(result.errorCode);
            }
          }
        }

        // Convert to array
        return Object.entries(byModel).map(([modelId, data]) => ({
          modelId,
          success: data.success,
          failed: data.failed,
          errorCodes: Array.from(data.errorCodes),
        }));
      },
    }),

    // Failed probe results only (convenience field)
    failedProbes: t.field({
      type: [ProbeResultRef],
      description: 'Failed probe results with error details',
      resolve: async (run) => {
        return db.probeResult.findMany({
          where: { runId: run.id, status: 'FAILED' },
          orderBy: [{ modelId: 'asc' }, { errorCode: 'asc' }],
        });
      },
    }),

    // Estimated costs calculated when run was created
    estimatedCosts: t.field({
      type: CostEstimateRef,
      nullable: true,
      description: 'Estimated cost calculated when run was created. Stored in run config for historical reference.',
      resolve: (run) => {
        const config = run.config as RunConfig | null;
        return config?.estimatedCosts ?? null;
      },
    }),
  }),
});
