/**
 * Analysis Mutations
 *
 * GraphQL mutations for triggering analysis recomputation.
 */

import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { AuthenticationError, NotFoundError } from '@valuerank/shared';
import { AnalysisResultRef } from '../types/analysis.js';
import { getBoss } from '../../queue/boss.js';
import { createAuditLog } from '../../services/audit/index.js';

// recomputeAnalysis mutation
builder.mutationField('recomputeAnalysis', (t) =>
  t.field({
    type: AnalysisResultRef,
    nullable: true,
    description: `
      Recompute analysis for a run.

      This will:
      1. Mark any existing analysis as SUPERSEDED
      2. Queue a new analyze_basic job
      3. Return the job status (analysis will be computed asynchronously)

      Returns null if the run is not found or not completed.
      Requires authentication.
    `,
    args: {
      runId: t.arg.id({ required: true, description: 'Run ID to recompute analysis for' }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      ctx.log.info({ runId, userId: ctx.user.id }, 'Recomputing analysis');

      // Check run exists and is completed
      const run = await db.run.findUnique({
        where: { id: runId },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      if (run.status !== 'COMPLETED') {
        ctx.log.warn({ runId, status: run.status }, 'Cannot recompute analysis for non-completed run');
        return null;
      }

      // Mark existing analyses as superseded
      await db.analysisResult.updateMany({
        where: {
          runId,
          status: 'CURRENT',
        },
        data: {
          status: 'SUPERSEDED',
        },
      });

      // Queue new analysis job
      const boss = getBoss();
      const jobId = await boss.send('analyze_basic', {
        runId,
        force: true, // Force recomputation even if cache hit
      });

      ctx.log.info({ runId, jobId }, 'Analysis job queued');

      // Audit log (non-blocking)
      void createAuditLog({
        action: 'ACTION',
        entityType: 'AnalysisResult',
        entityId: runId,
        userId: ctx.user.id,
        metadata: { action: 'recompute', jobId },
      });

      // Return latest analysis (may be superseded, or null if first run)
      const analysis = await db.analysisResult.findFirst({
        where: { runId },
        orderBy: { createdAt: 'desc' },
      });

      return analysis;
    },
  })
);
