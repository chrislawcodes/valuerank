/**
 * get_run_summary MCP Tool
 *
 * Gets aggregated analysis for a completed run.
 * Returns computed statistics, NOT raw transcripts.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import {
  buildMcpResponse,
  formatRunSummary,
  type RunSummary,
} from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:get-run-summary');

/**
 * Input schema for get_run_summary tool
 */
const GetRunSummaryInputSchema = {
  run_id: z.string().describe('Run UUID (required)'),
  include_insights: z
    .boolean()
    .default(true)
    .describe('Include auto-generated insights'),
};

/**
 * Truncator for run summary that removes insights if over budget
 */
function truncateRunSummary(summary: RunSummary): RunSummary {
  // First try removing insights
  const withoutInsights = { ...summary };
  delete withoutInsights.insights;
  delete withoutInsights.llmSummary;
  return withoutInsights;
}

/**
 * Registers the get_run_summary tool on the MCP server
 */
function registerGetRunSummaryTool(server: McpServer): void {
  log.info('Registering get_run_summary tool');

  server.registerTool(
    'get_run_summary',
    {
      description: `Get aggregated analysis for a completed run.
Returns computed statistics including per-model win rates, model agreement scores, outlier models, and most contested scenarios.
Also includes auto-generated insights and LLM summary if available.
Limited to 5KB token budget.`,
      inputSchema: GetRunSummaryInputSchema,
    },
    async (args, extra) => {
      const startTime = Date.now();
      const requestId = String(extra.requestId ?? 'unknown');

      log.debug({ args, requestId }, 'get_run_summary called');

      try {
        // Find the run
        const run = await db.run.findUnique({
          where: { id: args.run_id, deletedAt: null },
          include: {
            _count: { select: { transcripts: true } },
          },
        });

        if (!run) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'NOT_FOUND',
                  message: `Run not found: ${args.run_id}`,
                }),
              },
            ],
            isError: true,
          };
        }

        // Find the analysis result (most recent CURRENT status)
        const analysis = await db.analysisResult.findFirst({
          where: {
            runId: args.run_id,
            status: 'CURRENT',
          },
          orderBy: { createdAt: 'desc' },
        });

        // Format the summary
        const summary = formatRunSummary(run, analysis, run._count.transcripts);

        // Remove insights if not requested
        if (!args.include_insights) {
          delete summary.insights;
          delete summary.llmSummary;
        }

        // Build response with token budget enforcement
        const response = buildMcpResponse({
          toolName: 'get_run_summary',
          data: summary,
          requestId,
          startTime,
          truncator: truncateRunSummary,
        });

        log.info(
          {
            requestId,
            runId: args.run_id,
            analysisStatus: summary.analysisStatus,
            truncated: response.metadata.truncated,
            executionMs: response.metadata.executionMs,
          },
          'get_run_summary completed'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (err) {
        log.error({ err, requestId }, 'get_run_summary failed');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get run summary',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerGetRunSummaryTool);

export { registerGetRunSummaryTool };
