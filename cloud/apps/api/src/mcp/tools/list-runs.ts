/**
 * list_runs MCP Tool
 *
 * Lists evaluation runs with status and summary metrics.
 * Supports filtering by definition_id, status, and pagination.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db, type RunStatus } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  buildMcpResponse,
  truncateArray,
  formatRunListItem,
  type RunListItem,
} from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:list-runs');

/**
 * Input schema for list_runs tool
 */
const ListRunsInputSchema = {
  definition_id: z.string().optional().describe('Filter by definition UUID'),
  status: z
    .enum(['pending', 'running', 'completed', 'failed'])
    .optional()
    .describe('Filter by run status'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Maximum number of runs to return (default: 20, max: 100)'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of runs to skip for pagination (default: 0)'),
};

/**
 * Map lowercase status to Prisma RunStatus enum values
 */
const statusToPrisma: Record<string, RunStatus> = {
  pending: 'PENDING',
  running: 'RUNNING',
  completed: 'COMPLETED',
  failed: 'FAILED',
};

/**
 * Registers the list_runs tool on the MCP server
 */
function registerListRunsTool(server: McpServer): void {
  log.info('Registering list_runs tool');

  server.registerTool(
    'list_runs',
    {
      description: `List evaluation runs with status and summary metrics.
Use filters to narrow results. Returns id, status, models, scenarioCount, samplePercentage, and createdAt for each run.
Results are sorted by creation date (newest first). Supports pagination via limit and offset.
Limited to 2KB token budget.`,
      inputSchema: ListRunsInputSchema,
    },
    async (args, extra) => {
      const startTime = Date.now();
      const requestId = String(extra.requestId ?? 'unknown');

      log.debug({ args, requestId }, 'list_runs called');

      try {
        // Build where clause for Prisma query
        const where: {
          definitionId?: string;
          status?: RunStatus;
          deletedAt: null;
        } = {
          deletedAt: null, // Exclude soft-deleted runs
        };

        if (args.definition_id) {
          where.definitionId = args.definition_id;
        }

        if (args.status) {
          where.status = statusToPrisma[args.status];
        }

        // Query runs with transcript count and pagination
        const limit = args.limit ?? 20;
        const offset = args.offset ?? 0;

        const runs = await db.run.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            _count: {
              select: { transcripts: true },
            },
          },
        });

        // Format runs for response
        const formattedRuns: RunListItem[] = runs.map(formatRunListItem);

        // Build response with token budget enforcement
        const response = buildMcpResponse({
          toolName: 'list_runs',
          data: formattedRuns,
          requestId,
          startTime,
          truncator: (data) => truncateArray(data, 10), // Truncate to 10 items if over budget
        });

        log.info(
          {
            requestId,
            count: formattedRuns.length,
            limit,
            offset,
            truncated: response.metadata.truncated,
            executionMs: response.metadata.executionMs,
          },
          'list_runs completed'
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
        log.error({ err, requestId }, 'list_runs failed');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'Failed to list runs',
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
addToolRegistrar(registerListRunsTool);

export { registerListRunsTool };
