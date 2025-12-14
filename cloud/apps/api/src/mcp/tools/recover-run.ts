/**
 * recover_run MCP Tool [T008-T010]
 *
 * Recovers a stuck run by re-queuing missing or orphaned jobs.
 * Wraps the existing recoverOrphanedRun service function.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { recoverOrphanedRun } from '../../services/run/recovery.js';
import { logAuditEvent } from '../../services/mcp/index.js';
import { formatError, formatSuccess, createOperationsAudit } from './helpers.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:recover-run');

/**
 * Input schema for recover_run tool
 */
const RecoverRunInputSchema = {
  run_id: z.string().describe('ID of the run to recover'),
};

/**
 * Registers the recover_run tool on the MCP server
 */
function registerRecoverRunTool(server: McpServer): void {
  log.info('Registering recover_run tool');

  server.registerTool(
    'recover_run',
    {
      description: `Recover a stuck run by re-queuing missing or orphaned jobs.

**What this tool does:**
- Detects if the run has missing probe or summarize jobs
- Re-queues missing jobs to the appropriate queues
- Triggers summarization if all probes are complete but status is stuck
- Completes the run if all transcripts are summarized but status is stuck

**When to use:**
- Run is stuck in RUNNING state with no active probe jobs
- Run is stuck in SUMMARIZING state with no active summarize jobs
- Jobs were lost due to API restart or queue expiration

**Returns:**
- action: What recovery action was taken (requeued_probes, triggered_summarization, completed_run, no_recovery_needed)
- requeued_count: Number of jobs re-queued (if applicable)
- run_progress: Current progress after recovery

**Note:** This is safe to call multiple times - it's idempotent and won't create duplicate jobs.`,
      inputSchema: RecoverRunInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available

      log.debug({
        runId: args.run_id,
        requestId,
      }, 'recover_run called');

      try {
        // Verify run exists and get current state
        const run = await db.run.findUnique({
          where: { id: args.run_id },
          select: {
            id: true,
            status: true,
            progress: true,
            deletedAt: true,
          },
        });

        if (!run) {
          return formatError('NOT_FOUND', `Run not found: ${args.run_id}`);
        }

        if (run.deletedAt) {
          return formatError('NOT_FOUND', `Run has been deleted: ${args.run_id}`);
        }

        // Check if run is in a recoverable state
        const recoverableStates = ['RUNNING', 'SUMMARIZING'];
        if (!recoverableStates.includes(run.status)) {
          return formatError(
            'INVALID_STATE',
            `Run is in ${run.status} state and cannot be recovered. Recovery only applies to RUNNING or SUMMARIZING runs.`
          );
        }

        // Perform recovery
        const result = await recoverOrphanedRun(args.run_id);

        // Get updated run state
        const updatedRun = await db.run.findUnique({
          where: { id: args.run_id },
          select: {
            id: true,
            status: true,
            progress: true,
          },
        });

        const progress = updatedRun?.progress as { total: number; completed: number; failed: number } | null;

        log.info({
          requestId,
          runId: args.run_id,
          action: result.action,
          requeuedCount: result.requeuedCount,
          newStatus: updatedRun?.status,
        }, 'Run recovery completed');

        // Log audit event
        logAuditEvent(
          createOperationsAudit({
            action: 'recover_run',
            userId,
            runId: args.run_id,
            requestId,
            details: {
              action: result.action,
              requeuedCount: result.requeuedCount,
              previousStatus: run.status,
              newStatus: updatedRun?.status,
            },
          })
        );

        return formatSuccess({
          success: true,
          run_id: args.run_id,
          status: updatedRun?.status ?? run.status,
          action: result.action,
          requeued_count: result.requeuedCount ?? 0,
          run_progress: progress ? {
            total: progress.total,
            completed: progress.completed,
            failed: progress.failed,
            percent_complete: progress.total > 0
              ? Math.round((progress.completed / progress.total) * 100)
              : 0,
          } : null,
        });
      } catch (err) {
        log.error({ err, requestId, runId: args.run_id }, 'recover_run failed');

        if (err instanceof NotFoundError) {
          return formatError('NOT_FOUND', `Run not found: ${args.run_id}`);
        }

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to recover run'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerRecoverRunTool);

export { registerRecoverRunTool };
