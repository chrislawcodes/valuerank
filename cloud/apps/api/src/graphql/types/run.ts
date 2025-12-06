import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { RunRef, DefinitionRef, TranscriptRef, ExperimentRef } from './refs.js';
import { RunProgress, TaskResult } from './run-progress.js';
import { calculatePercentComplete } from '../../services/run/index.js';
import { getBoss } from '../../queue/boss.js';

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
          const boss = getBoss();

          // Query completed jobs from PgBoss archive
          // PgBoss stores completed jobs in pgboss.archive table
          const completedJobs = await db.$queryRaw<Array<{
            id: string;
            data: { runId: string; scenarioId: string; modelId: string };
            state: string;
            completedon: Date | null;
            output: unknown;
          }>>`
            SELECT id, data, state, completedon, output
            FROM pgboss.archive
            WHERE name = 'probe:scenario'
              AND data->>'runId' = ${run.id}
              AND state IN ('completed', 'failed')
            ORDER BY completedon DESC NULLS LAST
            LIMIT ${limit}
          `;

          return completedJobs.map((job) => ({
            scenarioId: job.data.scenarioId,
            modelId: job.data.modelId,
            status: (job.state === 'completed' ? 'COMPLETED' : 'FAILED') as 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED',
            error: job.state === 'failed' ? String(job.output) : null,
            completedAt: job.completedon,
          }));
        } catch {
          // If PgBoss tables don't exist or query fails, return empty array
          return [];
        }
      },
    }),

    // Relation: definition
    definition: t.field({
      type: DefinitionRef,
      resolve: async (run, _args, ctx) => {
        const definition = await ctx.loaders.definition.load(run.definitionId);
        if (!definition) {
          throw new Error(`Definition not found for run ${run.id}`);
        }
        return definition;
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
  }),
});
