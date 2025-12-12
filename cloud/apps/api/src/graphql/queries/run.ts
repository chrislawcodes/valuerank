import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import type { RunStatus, AnalysisStatus } from '@valuerank/db';
import { RunRef } from '../types/run.js';
import { trackRunAccess } from '../../middleware/access-tracking.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// Type for where clause with analysis filtering
type RunWhereInput = {
  definitionId?: string;
  experimentId?: string | null;
  status?: RunStatus;
  id?: { in: string[] };
};

// Query: run(id: ID!) - Fetch single run by ID
builder.queryField('run', (t) =>
  t.field({
    type: RunRef,
    nullable: true,
    description: 'Fetch a single run by ID. Returns null if not found or deleted.',
    args: {
      id: t.arg.id({ required: true, description: 'Run ID' }),
      includeDeleted: t.arg.boolean({
        required: false,
        description: 'Include soft-deleted runs (default: false)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const includeDeleted = args.includeDeleted ?? false;
      ctx.log.debug({ runId: id, includeDeleted }, 'Fetching run');

      const run = await db.run.findUnique({
        where: { id },
      });

      // Filter out soft-deleted runs unless includeDeleted is true
      if (!run || (!includeDeleted && run.deletedAt !== null)) {
        ctx.log.debug({ runId: id }, 'Run not found');
        return null;
      }

      // Track access (non-blocking)
      trackRunAccess(run.id);

      return run;
    },
  })
);

// Query: runs(definitionId, experimentId, status, limit, offset) - List runs with filtering
builder.queryField('runs', (t) =>
  t.field({
    type: [RunRef],
    description: 'List runs with optional filtering and pagination.',
    args: {
      definitionId: t.arg.string({
        required: false,
        description: 'Filter by definition ID',
      }),
      experimentId: t.arg.string({
        required: false,
        description: 'Filter by experiment ID',
      }),
      status: t.arg.string({
        required: false,
        description: 'Filter by status (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)',
      }),
      hasAnalysis: t.arg.boolean({
        required: false,
        description: 'Filter to runs that have analysis results (any status)',
      }),
      analysisStatus: t.arg.string({
        required: false,
        description: 'Filter by analysis status (CURRENT or SUPERSEDED)',
      }),
      limit: t.arg.int({
        required: false,
        description: `Maximum number of results (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
      }),
      offset: t.arg.int({
        required: false,
        description: 'Number of results to skip for pagination (default: 0)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      // Validate and apply defaults
      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = args.offset ?? 0;

      ctx.log.debug(
        {
          definitionId: args.definitionId,
          experimentId: args.experimentId,
          status: args.status,
          hasAnalysis: args.hasAnalysis,
          analysisStatus: args.analysisStatus,
          limit,
          offset,
        },
        'Listing runs'
      );

      // Build where clause (always exclude soft-deleted runs)
      const where: RunWhereInput & { deletedAt: null } = {
        deletedAt: null,
      };
      if (args.definitionId) {
        where.definitionId = args.definitionId;
      }
      if (args.experimentId) {
        where.experimentId = args.experimentId;
      }
      if (args.status) {
        where.status = args.status as RunStatus;
      }

      // Handle analysis filtering - requires subquery to find run IDs with analysis
      if (args.hasAnalysis === true || args.analysisStatus) {
        const analysisWhere: { status?: AnalysisStatus; deletedAt: null } = {
          deletedAt: null,
        };

        // If analysisStatus provided, filter by that specific status
        if (args.analysisStatus) {
          analysisWhere.status = args.analysisStatus as AnalysisStatus;
        }

        // Find all run IDs that have analysis results matching the criteria
        const analysisResults = await db.analysisResult.findMany({
          where: analysisWhere,
          select: { runId: true },
          distinct: ['runId'],
        });

        const runIdsWithAnalysis = analysisResults.map((a) => a.runId);

        // If no runs have analysis, return empty array early
        if (runIdsWithAnalysis.length === 0) {
          ctx.log.debug({ count: 0 }, 'No runs with analysis found');
          return [];
        }

        where.id = { in: runIdsWithAnalysis };
      }

      const runs = await db.run.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      });

      ctx.log.debug({ count: runs.length }, 'Runs fetched');
      return runs;
    },
  })
);
