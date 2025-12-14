/**
 * cancel_summarization MCP Tool [T031]
 *
 * Cancels pending summarization jobs for a run via MCP.
 * Preserves completed summaries.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, NotFoundError, RunStateError } from '@valuerank/shared';
import { cancelSummarization } from '../../services/run/summarization.js';
import {
  logAuditEvent,
  createSummarizationAudit,
} from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:cancel-summarization');

/**
 * Input schema for cancel_summarization tool
 */
const CancelSummarizationInputSchema = {
  run_id: z.string().describe('ID of the run to cancel summarization for'),
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
 * Registers the cancel_summarization tool on the MCP server
 */
function registerCancelSummarizationTool(server: McpServer): void {
  log.info('Registering cancel_summarization tool');

  server.registerTool(
    'cancel_summarization',
    {
      description: `Cancel pending summarization jobs for a run.

**Behavior:**
- Cancels pending summarize_transcript jobs in the queue
- Preserves already-completed summaries
- Sets run status to COMPLETED (since probing is done)
- Updates summarizeProgress to reflect actual completion state

**Validation:**
- Run must be in SUMMARIZING state
- Returns error if run not found or in wrong state

**Use Cases:**
- Stop summarization if it's taking too long
- Cancel after detecting issues with summaries
- Free up queue capacity for more important runs`,
      inputSchema: CancelSummarizationInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available

      log.debug({
        runId: args.run_id,
        requestId,
      }, 'cancel_summarization called');

      try {
        const result = await cancelSummarization(args.run_id);

        log.info({
          requestId,
          runId: args.run_id,
          cancelledCount: result.cancelledCount,
          newStatus: result.run.status,
        }, 'Summarization cancelled');

        // Log audit event
        logAuditEvent(
          createSummarizationAudit({
            action: 'cancel_summarization',
            userId,
            runId: args.run_id,
            requestId,
            details: {
              cancelledCount: result.cancelledCount,
              newStatus: result.run.status,
            },
          })
        );

        return formatSuccess({
          success: true,
          run_id: result.run.id,
          status: result.run.status,
          cancelled_count: result.cancelledCount,
          summarize_progress: result.run.summarizeProgress,
        });
      } catch (err) {
        log.error({ err, requestId, runId: args.run_id }, 'cancel_summarization failed');

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
          err instanceof Error ? err.message : 'Failed to cancel summarization'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerCancelSummarizationTool);

export { registerCancelSummarizationTool };
