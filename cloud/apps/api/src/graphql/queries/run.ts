import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { RunRef } from '../types/run.js';
import { trackRunAccess } from '../../middleware/access-tracking.js';
import {
  buildRunWhere,
  parseAnalysisStatus,
  parseRunCategory,
  parseRunStatus,
  parseRunType,
} from '../../services/run/query.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

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

      // Track access before returning so the timestamp is durable for callers
      // that verify it immediately after the query.
      await trackRunAccess(run.id);

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
      definitionTagIds: t.arg.idList({
        required: false,
        description: 'Filter by definition tag IDs',
      }),
      experimentId: t.arg.string({
        required: false,
        description: 'Filter by experiment ID',
      }),
      status: t.arg.string({
        required: false,
        description: 'Filter by status (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)',
      }),
      runCategory: t.arg.string({
        required: false,
        description: 'Filter by workflow category (PILOT, PRODUCTION, REPLICATION, VALIDATION, UNKNOWN_LEGACY)',
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
          definitionTagIds: args.definitionTagIds,
          experimentId: args.experimentId,
          status: args.status,
          runCategory: args.runCategory,
          hasAnalysis: args.hasAnalysis,
          analysisStatus: args.analysisStatus,
          runType: args.runType,
          limit,
          offset,
        },
        'Listing runs'
      );

      const { where, noMatches } = await buildRunWhere({
        definitionId: args.definitionId,
        definitionTagIds: args.definitionTagIds?.map(String),
        experimentId: args.experimentId,
        status: parseRunStatus(args.status),
        runCategory: parseRunCategory(args.runCategory),
        hasAnalysis: args.hasAnalysis,
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
      definitionTagIds: t.arg.idList({
        required: false,
        description: 'Filter by definition tag IDs',
      }),
      experimentId: t.arg.string({
        required: false,
        description: 'Filter by experiment ID',
      }),
      status: t.arg.string({
        required: false,
        description: 'Filter by status (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)',
      }),
      runCategory: t.arg.string({
        required: false,
        description: 'Filter by workflow category (PILOT, PRODUCTION, REPLICATION, VALIDATION, UNKNOWN_LEGACY)',
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
          runCategory: args.runCategory,
          hasAnalysis: args.hasAnalysis,
          analysisStatus: args.analysisStatus,
          runType: args.runType,
        },
        'Counting runs'
      );

      const { where, noMatches } = await buildRunWhere({
        definitionId: args.definitionId,
        experimentId: args.experimentId,
        status: parseRunStatus(args.status),
        runCategory: parseRunCategory(args.runCategory),
        hasAnalysis: args.hasAnalysis,
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
