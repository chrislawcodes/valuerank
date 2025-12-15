/**
 * get_unsummarized_transcripts MCP Tool [T019-T020]
 *
 * Queries transcripts that haven't been summarized for a run.
 * Useful for diagnosing stuck runs and identifying specific issues.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { logAuditEvent } from '../../services/mcp/index.js';
import { formatError, formatSuccess, createOperationsAudit } from './helpers.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:get-unsummarized-transcripts');

/**
 * Input schema for get_unsummarized_transcripts tool
 */
const GetUnsummarizedTranscriptsInputSchema = {
  run_id: z.string().describe('ID of the run to check'),
  include_failed: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include transcripts with error status (decisionCode = "error")'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe('Maximum transcripts to return (default 50, max 100)'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe('Number of transcripts to skip for pagination (default: 0)'),
};

/**
 * Registers the get_unsummarized_transcripts tool on the MCP server
 */
function registerGetUnsummarizedTranscriptsTool(server: McpServer): void {
  log.info('Registering get_unsummarized_transcripts tool');

  server.registerTool(
    'get_unsummarized_transcripts',
    {
      description: `Query transcripts that haven't been summarized for a run.

**What this tool returns:**
- List of transcript IDs with model and scenario info
- Total count of unsummarized transcripts
- Decision code for failed transcripts (when include_failed=true)

**When to use:**
- Diagnose which specific transcripts are stuck
- Identify patterns (e.g., all stuck transcripts are from same model)
- Verify recovery actions targeted the right transcripts
- Check if a run has unsummarized transcripts before completing

**Filtering options:**
- include_failed=false (default): Only transcripts without any summary
- include_failed=true: Also include transcripts where summary failed (decisionCode='error')

**Pagination:**
- limit: Max transcripts to return (default 50, max 100)
- offset: Number of transcripts to skip (default 0)
- Response includes total_count for awareness of full dataset size

**Note:** For runs with many unsummarized transcripts, the total_count tells you
how many exist even if only 'limit' are returned.`,
      inputSchema: GetUnsummarizedTranscriptsInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available
      const includeFailed = args.include_failed ?? false;
      const limit = Math.min(args.limit ?? 50, 100); // Cap at 100
      const offset = args.offset ?? 0;

      log.debug({
        runId: args.run_id,
        includeFailed,
        limit,
        offset,
        requestId,
      }, 'get_unsummarized_transcripts called');

      try {
        // Verify run exists
        const run = await db.run.findUnique({
          where: { id: args.run_id },
          select: { id: true, deletedAt: true },
        });

        if (!run) {
          return formatError('NOT_FOUND', `Run not found: ${args.run_id}`);
        }

        if (run.deletedAt) {
          return formatError('NOT_FOUND', `Run has been deleted: ${args.run_id}`);
        }

        // Build query conditions
        // When excluding failed transcripts, we need to include both NULL decisionCode
        // and non-error decisionCode (NOT: { decisionCode: 'error' } excludes NULLs in SQL)
        const where = {
          runId: args.run_id,
          summarizedAt: null,
          ...(includeFailed
            ? {}
            : {
                OR: [{ decisionCode: null }, { decisionCode: { not: 'error' } }],
              }),
        };

        // Get total count
        const totalCount = await db.transcript.count({ where });

        // Get transcripts with pagination
        const transcripts = await db.transcript.findMany({
          where,
          select: {
            id: true,
            modelId: true,
            scenarioId: true,
            createdAt: true,
            decisionCode: true,
          },
          orderBy: { createdAt: 'asc' },
          take: limit,
          skip: offset,
        });

        log.info({
          requestId,
          runId: args.run_id,
          totalCount,
          returnedCount: transcripts.length,
        }, 'Unsummarized transcripts retrieved');

        // Log audit event
        logAuditEvent(
          createOperationsAudit({
            action: 'get_unsummarized_transcripts',
            userId,
            runId: args.run_id,
            requestId,
            details: {
              includeFailed,
              limit,
              totalCount,
              returnedCount: transcripts.length,
            },
          })
        );

        return formatSuccess({
          run_id: args.run_id,
          total_count: totalCount,
          returned_count: transcripts.length,
          pagination: {
            limit,
            offset,
            has_more: offset + limit < totalCount,
          },
          transcripts: transcripts.map(t => ({
            id: t.id,
            model_id: t.modelId,
            scenario_id: t.scenarioId,
            created_at: t.createdAt.toISOString(),
            ...(includeFailed && t.decisionCode ? { decision_code: t.decisionCode } : {}),
          })),
        });
      } catch (err) {
        log.error({ err, requestId, runId: args.run_id }, 'get_unsummarized_transcripts failed');

        if (err instanceof NotFoundError) {
          return formatError('NOT_FOUND', `Run not found: ${args.run_id}`);
        }

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to get unsummarized transcripts'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerGetUnsummarizedTranscriptsTool);

export { registerGetUnsummarizedTranscriptsTool };
