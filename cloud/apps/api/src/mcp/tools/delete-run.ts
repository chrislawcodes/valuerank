/**
 * delete_run MCP Tool
 *
 * Soft-deletes an evaluation run via MCP.
 * Cascades to associated transcripts and analysis results.
 * Cancels any pending/running jobs.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db, softDeleteRun, getRunById } from '@valuerank/db';
import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import {
  logAuditEvent,
  createDeleteAudit,
} from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:delete-run');

/**
 * Input schema for delete_run tool
 */
const DeleteRunInputSchema = {
  run_id: z.string().cuid().describe('ID of the run to delete'),
};

/**
 * Format error response for MCP
 */
function formatError(code: string, message: string, details?: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: code, message, details }, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Format success response for MCP
 */
function formatSuccess(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Cancels pending jobs for a run via direct SQL update on PgBoss tables.
 * This is the same pattern used in services/run/control.ts
 */
async function cancelRunJobs(runId: string): Promise<{ cancelled: number }> {
  try {
    // Cancel pending probe_scenario jobs for this run
    // PgBoss stores jobs with data.runId, we target those directly
    const result = await db.$executeRaw`
      UPDATE pgboss.job
      SET state = 'cancelled'
      WHERE name = 'probe_scenario'
        AND state IN ('created', 'retry')
        AND data->>'runId' = ${runId}
    `;

    log.info({ runId, cancelledJobs: result }, 'Cancelled pending jobs');
    return { cancelled: Number(result) };
  } catch (error) {
    // If PgBoss tables don't exist, that's fine - no jobs to cancel
    log.warn({ runId, error }, 'Failed to cancel jobs in queue (may not exist)');
    return { cancelled: 0 };
  }
}

/**
 * Registers the delete_run tool on the MCP server
 */
function registerDeleteRunTool(server: McpServer): void {
  log.info('Registering delete_run tool');

  server.registerTool(
    'delete_run',
    {
      description: `Soft-delete an evaluation run and its associated data.

**Behavior:**
- Sets deletedAt timestamp on the run (soft delete)
- Cascades soft-delete to all transcripts for the run
- Cascades soft-delete to all analysis results for the run
- Cancels any pending/running jobs via PgBoss
- Sets run status to CANCELLED if currently RUNNING or PENDING
- Deleted runs no longer appear in list_runs

**Validation:**
- Returns 404 if run doesn't exist
- Returns error if already deleted

**Recovery:**
- Data is not permanently deleted
- Contact admin to restore if needed`,
      inputSchema: DeleteRunInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available

      log.debug({
        runId: args.run_id,
        requestId,
      }, 'delete_run called');

      try {
        // Step 1: Verify run exists first (for better error messages and to get definition)
        let runDefinitionId: string;
        let runStatus: string;
        try {
          const run = await getRunById(args.run_id);
          runDefinitionId = run.definitionId;
          runStatus = run.status;
        } catch (err) {
          if (err instanceof NotFoundError) {
            log.warn({ requestId, runId: args.run_id }, 'Run not found');
            return formatError('NOT_FOUND', `Run not found: ${args.run_id}`);
          }
          throw err;
        }

        // Step 2: Cancel any pending jobs if run is still active
        let jobsCancelled = 0;
        if (runStatus === 'RUNNING' || runStatus === 'PENDING') {
          log.info({ requestId, runId: args.run_id, runStatus }, 'Cancelling jobs for active run');
          const cancelResult = await cancelRunJobs(args.run_id);
          jobsCancelled = cancelResult.cancelled;
        }

        // Step 3: Perform soft delete with cascading
        const result = await softDeleteRun(args.run_id);

        log.info({
          requestId,
          runId: args.run_id,
          definitionId: runDefinitionId,
          transcriptCount: result.deletedCount.transcripts,
          analysisCount: result.deletedCount.analysisResults,
          jobsCancelled,
        }, 'Run deleted');

        // Step 4: Log audit event
        logAuditEvent(
          createDeleteAudit({
            action: 'delete_run',
            userId,
            entityId: args.run_id,
            entityType: 'run',
            requestId,
            deletedCount: result.deletedCount,
          })
        );

        // Step 5: Return success response
        return formatSuccess({
          success: true,
          run_id: args.run_id,
          definition_id: runDefinitionId,
          deleted_at: result.deletedAt.toISOString(),
          previous_status: runStatus,
          deleted_count: {
            runs: 1,
            transcripts: result.deletedCount.transcripts,
            analysis_results: result.deletedCount.analysisResults,
          },
          jobs_cancelled: jobsCancelled,
        });
      } catch (err) {
        log.error({ err, requestId }, 'delete_run failed');

        // Handle specific error types
        if (err instanceof ValidationError) {
          if (err.message.includes('already deleted')) {
            return formatError('ALREADY_DELETED', `Run is already deleted: ${args.run_id}`);
          }
          return formatError('VALIDATION_ERROR', err.message);
        }

        if (err instanceof NotFoundError) {
          return formatError('NOT_FOUND', `Run not found: ${args.run_id}`);
        }

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to delete run'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerDeleteRunTool);

export { registerDeleteRunTool };
