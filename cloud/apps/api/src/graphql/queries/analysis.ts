import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { AnalysisResultRef } from '../types/analysis.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;

// Query: analysis(runId: ID!) - Fetch analysis result for a run
builder.queryField('analysis', (t) =>
  t.field({
    type: AnalysisResultRef,
    nullable: true,
    description: 'Fetch the current analysis result for a run. Returns null if not yet computed.',
    args: {
      runId: t.arg.id({ required: true, description: 'Run ID' }),
    },
    resolve: async (_root, args, ctx) => {
      const runId = String(args.runId);
      ctx.log.debug({ runId }, 'Fetching analysis');

      const analysis = await db.analysisResult.findFirst({
        where: {
          runId,
          status: 'CURRENT',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!analysis) {
        ctx.log.debug({ runId }, 'Analysis not found');
        return null;
      }

      return analysis;
    },
  })
);

// Query: analysisHistory(runId: ID!, limit: Int) - Fetch all analysis versions for a run
builder.queryField('analysisHistory', (t) =>
  t.field({
    type: [AnalysisResultRef],
    description: 'Fetch all analysis versions for a run, including superseded versions.',
    args: {
      runId: t.arg.id({ required: true, description: 'Run ID' }),
      limit: t.arg.int({
        required: false,
        description: `Maximum number of results (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
      }),
      offset: t.arg.int({
        required: false,
        description: 'Number of results to skip (default: 0)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const runId = String(args.runId);
      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = args.offset ?? 0;

      ctx.log.debug({ runId, limit, offset }, 'Fetching analysis history');

      const analyses = await db.analysisResult.findMany({
        where: { runId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      return analyses;
    },
  })
);

// Query: analysisHistoryCount - Get count of analysis versions for a run
builder.queryField('analysisHistoryCount', (t) =>
  t.field({
    type: 'Int',
    description: 'Get the count of analysis versions for a run. Useful for pagination.',
    args: {
      runId: t.arg.id({
        required: true,
        description: 'Run ID to count analysis versions for',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const runId = String(args.runId);

      ctx.log.debug({ runId }, 'Counting analysis history');

      const count = await db.analysisResult.count({
        where: { runId },
      });

      ctx.log.debug({ runId, count }, 'Analysis history count fetched');
      return count;
    },
  })
);
