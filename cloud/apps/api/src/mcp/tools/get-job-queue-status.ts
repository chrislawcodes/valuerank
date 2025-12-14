/**
 * get_job_queue_status MCP Tool [T016-T017]
 *
 * Queries job queue status for a run to diagnose stuck runs.
 * Shows counts by job type and state, with optional failure details.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { getJobQueueStatus } from '../../services/run/job-queue.js';
import { logAuditEvent } from '../../services/mcp/index.js';
import { formatError, formatSuccess, createOperationsAudit } from './helpers.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:get-job-queue-status');

/**
 * Input schema for get_job_queue_status tool
 */
const GetJobQueueStatusInputSchema = {
  run_id: z.string().describe('ID of the run to check'),
  include_recent_failures: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include details of recent failed jobs (up to 10)'),
};

/**
 * Registers the get_job_queue_status tool on the MCP server
 */
function registerGetJobQueueStatusTool(server: McpServer): void {
  log.info('Registering get_job_queue_status tool');

  server.registerTool(
    'get_job_queue_status',
    {
      description: `Query job queue status for a run to diagnose issues.

**What this tool returns:**
- Counts by job type (probe_scenario, summarize_transcript, analyze_basic)
- Counts by state (pending, running, completed, failed)
- Total counts across all job types
- Recent failure details (optional)

**Job states explained:**
- pending: Job is waiting to be processed (includes created and retry states)
- running: Job is currently being processed
- completed: Job finished successfully
- failed: Job failed and won't be retried

**When to use:**
- Diagnose why a run is stuck (0 pending/running = jobs lost)
- Check if jobs are actively processing
- Identify failed jobs that need attention
- Verify recovery actions worked

**Interpreting results:**
- If pending=0 and running=0 but run is RUNNING: Jobs were lost, needs recovery
- If failed > 0: Check recent_failures for error details
- If running > 0: Jobs are actively processing, wait for completion

**Note:** Job counts reflect PgBoss queue state. Jobs expire after 30 minutes by default.`,
      inputSchema: GetJobQueueStatusInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available
      const includeRecentFailures = args.include_recent_failures ?? false;

      log.debug({
        runId: args.run_id,
        includeRecentFailures,
        requestId,
      }, 'get_job_queue_status called');

      try {
        const status = await getJobQueueStatus(args.run_id, {
          includeRecentFailures,
          failureLimit: 10,
        });

        log.info({
          requestId,
          runId: args.run_id,
          totalPending: status.totalPending,
          totalRunning: status.totalRunning,
          totalCompleted: status.totalCompleted,
          totalFailed: status.totalFailed,
        }, 'Job queue status retrieved');

        // Log audit event (read operation, but useful for tracking)
        logAuditEvent(
          createOperationsAudit({
            action: 'get_job_queue_status',
            userId,
            runId: args.run_id,
            requestId,
            details: {
              includeRecentFailures,
              totalPending: status.totalPending,
              totalRunning: status.totalRunning,
              totalFailed: status.totalFailed,
            },
          })
        );

        // Format response with snake_case for MCP consistency
        return formatSuccess({
          run_id: status.runId,
          by_job_type: Object.fromEntries(
            Object.entries(status.byJobType).map(([key, value]) => [
              key,
              value ? {
                pending: value.pending,
                running: value.running,
                completed: value.completed,
                failed: value.failed,
              } : undefined,
            ]).filter(([, v]) => v !== undefined)
          ),
          total_pending: status.totalPending,
          total_running: status.totalRunning,
          total_completed: status.totalCompleted,
          total_failed: status.totalFailed,
          recent_failures: status.recentFailures?.map(f => ({
            job_id: f.jobId,
            job_type: f.jobType,
            error: f.error,
            failed_at: f.failedAt,
            transcript_id: f.transcriptId,
            scenario_id: f.scenarioId,
            model_id: f.modelId,
          })),
        });
      } catch (err) {
        log.error({ err, requestId, runId: args.run_id }, 'get_job_queue_status failed');

        if (err instanceof NotFoundError) {
          return formatError('NOT_FOUND', `Run not found: ${args.run_id}`);
        }

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to get job queue status'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerGetJobQueueStatusTool);

export { registerGetJobQueueStatusTool };
