/**
 * restart_summarization MCP Tool [T032]
 *
 * Restarts summarization for a run via MCP.
 * Can re-queue failed/missing transcripts or force re-summarize all.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, NotFoundError, RunStateError } from '@valuerank/shared';
import { restartSummarization } from '../../services/run/summarization.js';
import {
  logAuditEvent,
  createSummarizationAudit,
} from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:restart-summarization');

/**
 * Input schema for restart_summarization tool
 */
const RestartSummarizationInputSchema = {
  run_id: z.string().describe('ID of the run to restart summarization for'),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, re-summarize ALL transcripts. If false (default), only re-queue unsummarized or failed transcripts.'),
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
 * Registers the restart_summarization tool on the MCP server
 */
function registerRestartSummarizationTool(server: McpServer): void {
  log.info('Registering restart_summarization tool');

  server.registerTool(
    'restart_summarization',
    {
      description: `Restart summarization for a run that has completed or failed.

**Behavior:**
- Queues summarize_transcript jobs for transcripts needing summarization
- By default, only re-queues transcripts without summaries or with errors
- With force=true, re-queues ALL transcripts (overwrites existing summaries)
- Sets run status to SUMMARIZING and resets progress tracking

**Validation:**
- Run must be in terminal state (COMPLETED, FAILED, or CANCELLED)
- Returns error if run not found or in wrong state

**Use Cases:**
- Retry failed summarizations after fixing issues
- Complete partial summarization runs
- Re-generate all summaries with updated judge model (force=true)`,
      inputSchema: RestartSummarizationInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available
      const force = args.force ?? false;

      log.debug({
        runId: args.run_id,
        force,
        requestId,
      }, 'restart_summarization called');

      try {
        const result = await restartSummarization(args.run_id, force);

        log.info({
          requestId,
          runId: args.run_id,
          queuedCount: result.queuedCount,
          force,
          newStatus: result.run.status,
        }, 'Summarization restarted');

        // Log audit event
        logAuditEvent(
          createSummarizationAudit({
            action: 'restart_summarization',
            userId,
            runId: args.run_id,
            requestId,
            details: {
              queuedCount: result.queuedCount,
              force,
              newStatus: result.run.status,
            },
          })
        );

        return formatSuccess({
          success: true,
          run_id: result.run.id,
          status: result.run.status,
          queued_count: result.queuedCount,
          force,
          summarize_progress: result.run.summarizeProgress,
        });
      } catch (err) {
        log.error({ err, requestId, runId: args.run_id }, 'restart_summarization failed');

        if (err instanceof NotFoundError) {
          return formatError('NOT_FOUND', `Run not found: ${args.run_id}`);
        }

        if (err instanceof RunStateError) {
          return formatError(
            'INVALID_STATE',
            err.message
          );
        }

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to restart summarization'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerRestartSummarizationTool);

export { registerRestartSummarizationTool };
