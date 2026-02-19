import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { RunRef } from '../types/run.js';
import { trackRunAccess } from '../../middleware/access-tracking.js';
import { ValidationError } from '@valuerank/shared';
import {
  buildRunWhere,
  parseAnalysisStatus,
  parseRunStatus,
  parseRunType,
} from '../../services/run/query.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const MAX_COMPARISON_RUNS = 10;

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
      if (run === null || (includeDeleted === false && run.deletedAt !== null)) {
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
      runType: t.arg.string({
        required: false,
        description: 'Filter by run type (ALL, SURVEY, NON_SURVEY)',
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
          runType: args.runType,
          limit,
          offset,
        },
        'Listing runs'
      );

      const { where, noMatches } = await buildRunWhere({
        definitionId: args.definitionId ?? undefined,
        experimentId: args.experimentId ?? undefined,
        status: parseRunStatus(args.status),
        hasAnalysis: args.hasAnalysis ?? undefined,
        analysisStatus: parseAnalysisStatus(args.analysisStatus),
        runType: parseRunType(args.runType),
      });

      if (noMatches) {
        ctx.log.debug({ count: 0 }, 'No runs with analysis found');
        return [];
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

// Query: runsWithAnalysis(ids: [ID!]!) - Fetch multiple runs for comparison
builder.queryField('runsWithAnalysis', (t) =>
  t.field({
    type: [RunRef],
    description: `Fetch multiple runs by IDs for cross-run comparison. Limited to ${MAX_COMPARISON_RUNS} runs maximum. Returns runs with their analysis data.`,
    args: {
      ids: t.arg.idList({
        required: true,
        description: `Array of run IDs to fetch (max ${MAX_COMPARISON_RUNS})`,
      }),
    },
    resolve: async (_root, args, ctx) => {
      const ids = args.ids.map(String);

      // Validate maximum runs for comparison
      if (ids.length > MAX_COMPARISON_RUNS) {
        throw new ValidationError(
          `Maximum ${MAX_COMPARISON_RUNS} runs can be compared at once. Received ${ids.length}.`
        );
      }

      if (ids.length === 0) {
        return [];
      }

      ctx.log.debug({ runIds: ids, count: ids.length }, 'Fetching runs for comparison');

      // Fetch all runs (excluding soft-deleted)
      const runs = await db.run.findMany({
        where: {
          id: { in: ids },
          deletedAt: null,
        },
      });

      // Track access for each run (non-blocking)
      for (const run of runs) {
        trackRunAccess(run.id);
      }

      ctx.log.debug(
        { requestedCount: ids.length, foundCount: runs.length },
        'Runs fetched for comparison'
      );

      // Return in the same order as requested IDs for consistent display
      const runMap = new Map(runs.map((r) => [r.id, r]));
      return ids.map((id) => runMap.get(id)).filter((r): r is NonNullable<typeof r> => r != null);
    },
  })
);

// Query: runCount - Get count of runs matching filters
builder.queryField('runCount', (t) =>
  t.field({
    type: 'Int',
    description: 'Get the count of runs matching the specified filters. Useful for pagination.',
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
      runType: t.arg.string({
        required: false,
        description: 'Filter by run type (ALL, SURVEY, NON_SURVEY)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug(
        {
          definitionId: args.definitionId,
          experimentId: args.experimentId,
          status: args.status,
          hasAnalysis: args.hasAnalysis,
          analysisStatus: args.analysisStatus,
          runType: args.runType,
        },
        'Counting runs'
      );

      const { where, noMatches } = await buildRunWhere({
        definitionId: args.definitionId ?? undefined,
        experimentId: args.experimentId ?? undefined,
        status: parseRunStatus(args.status),
        hasAnalysis: args.hasAnalysis ?? undefined,
        analysisStatus: parseAnalysisStatus(args.analysisStatus),
        runType: parseRunType(args.runType),
      });

      if (noMatches) {
        ctx.log.debug({ count: 0 }, 'No runs with analysis found');
        return 0;
      }

      const count = await db.run.count({ where });

      ctx.log.debug({ count }, 'Run count fetched');
      return count;
    },
  })
);
