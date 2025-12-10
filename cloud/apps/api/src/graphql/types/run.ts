import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { RunRef, DefinitionRef, TranscriptRef, ExperimentRef } from './refs.js';
import { UserRef } from './user.js';
import { RunProgress, TaskResult } from './run-progress.js';
import { ExecutionMetrics } from './execution-metrics.js';
import { ProbeResultRef, ProbeResultModelSummary } from './probe-result.js';
import { calculatePercentComplete } from '../../services/run/index.js';
import { AnalysisResultRef } from './analysis.js';
import { getAllMetrics, getTotals } from '../../services/rate-limiter/index.js';

// Re-export for backward compatibility
export { RunRef, TranscriptRef, ExperimentRef };

// Type for progress data stored in JSONB
type ProgressData = {
  total: number;
  completed: number;
  failed: number;
};

builder.objectType(RunRef, {
  description: 'A run execution against a definition',
  fields: (t) => ({
    id: t.exposeID('id'),
    definitionId: t.exposeString('definitionId'),
    experimentId: t.exposeString('experimentId', { nullable: true }),
    status: t.exposeString('status', {
      description: 'Current status of the run (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)',
    }),
    config: t.expose('config', { type: 'JSON' }),
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
        if (!run.createdByUserId) return null;
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
        if (!run.deletedByUserId) return null;
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
      resolve: (run) => {
        const progress = run.progress as ProgressData | null;
        if (!progress) return null;

        return {
          total: progress.total,
          completed: progress.completed,
          failed: progress.failed,
          percentComplete: calculatePercentComplete(progress),
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
            error: job.state === 'failed' ? String(job.output) : null,
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
        if (!run.experimentId) return null;
        return ctx.loaders.experiment.load(run.experimentId);
      },
    }),

    // Relation: transcripts with optional model filter
    transcripts: t.field({
      type: [TranscriptRef],
      args: {
        modelId: t.arg.string({
          required: false,
          description: 'Filter transcripts by model ID',
        }),
      },
      resolve: async (run, args, ctx) => {
        const transcripts = await ctx.loaders.transcriptsByRun.load(run.id);
        if (args.modelId) {
          return transcripts.filter((t) => t.modelId === args.modelId);
        }
        return transcripts;
      },
    }),

    // Computed: transcript count
    transcriptCount: t.field({
      type: 'Int',
      resolve: async (run, _args, ctx) => {
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

        if (analysis) {
          return 'completed';
        }

        // Check if analysis job is pending or active
        try {
          // Use raw query to check PgBoss job state
          const jobs = await db.$queryRaw<Array<{ state: string }>>`
            SELECT state FROM pgboss.job
            WHERE name = 'analyze_basic'
              AND data->>'runId' = ${run.id}
              AND state IN ('created', 'active', 'retry')
            LIMIT 1
          `;

          const firstJob = jobs[0];
          if (firstJob) {
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
        } catch {
          // PgBoss tables may not exist
        }

        // No analysis and no pending job - run may not be completed yet
        return run.status === 'COMPLETED' ? 'pending' : null;
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

        const providers = await getAllMetrics();
        const { totalActive, totalQueued } = getTotals();

        // Calculate estimated time remaining based on progress and throughput
        const progress = run.progress as ProgressData | null;
        let estimatedSecondsRemaining: number | null = null;

        if (progress) {
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

    // Probe results - detailed success/failure info for each model/scenario
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
      },
      description: 'Probe results with detailed success/failure information',
      resolve: async (run, args) => {
        const where: { runId: string; status?: 'SUCCESS' | 'FAILED'; modelId?: string } = {
          runId: run.id,
        };
        if (args.status === 'SUCCESS' || args.status === 'FAILED') {
          where.status = args.status;
        }
        if (args.modelId) {
          where.modelId = args.modelId;
        }
        return db.probeResult.findMany({
          where,
          orderBy: [{ status: 'asc' }, { modelId: 'asc' }, { scenarioId: 'asc' }],
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
            if (result.errorCode) {
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
  }),
});
