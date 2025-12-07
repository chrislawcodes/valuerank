import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import type { RunStatus } from '@valuerank/db';
import { RunRef } from '../types/run.js';
import { trackRunAccess } from '../../middleware/access-tracking.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// Type for where clause
type RunWhereInput = {
  definitionId?: string;
  experimentId?: string | null;
  status?: RunStatus;
};

// Query: run(id: ID!) - Fetch single run by ID
builder.queryField('run', (t) =>
  t.field({
    type: RunRef,
    nullable: true,
    description: 'Fetch a single run by ID. Returns null if not found.',
    args: {
      id: t.arg.id({ required: true, description: 'Run ID' }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      ctx.log.debug({ runId: id }, 'Fetching run');

      const run = await db.run.findUnique({
        where: { id },
      });

      if (!run) {
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
        { definitionId: args.definitionId, experimentId: args.experimentId, status: args.status, limit, offset },
        'Listing runs'
      );

      // Build where clause
      const where: RunWhereInput = {};
      if (args.definitionId) {
        where.definitionId = args.definitionId;
      }
      if (args.experimentId) {
        where.experimentId = args.experimentId;
      }
      if (args.status) {
        where.status = args.status as RunStatus;
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
