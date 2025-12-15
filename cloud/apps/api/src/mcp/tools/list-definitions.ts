/**
 * list_definitions MCP Tool
 *
 * Lists scenario definitions with version info.
 * Returns basic metadata for browsing available definitions.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  buildMcpResponse,
  truncateArray,
  formatDefinitionListItem,
  type DefinitionListItem,
} from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:list-definitions');

/**
 * Input schema for list_definitions tool
 */
const ListDefinitionsInputSchema = {
  folder: z.string().optional().describe('Filter definitions by folder path'),
  include_children: z
    .boolean()
    .default(false)
    .describe('Include child count for each definition'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe('Maximum number of definitions to return (default: 50, max: 100)'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of definitions to skip for pagination (default: 0)'),
};

/**
 * Registers the list_definitions tool on the MCP server
 */
function registerListDefinitionsTool(server: McpServer): void {
  log.info('Registering list_definitions tool');

  server.registerTool(
    'list_definitions',
    {
      description: `List scenario definitions with version info.
Returns basic metadata for browsing available definitions including id, name, versionLabel, parentId, and createdAt.
Optionally includes child count for version tree exploration.
Supports pagination via limit and offset parameters.
Limited to 2KB token budget.`,
      inputSchema: ListDefinitionsInputSchema,
    },
    async (args, extra) => {
      const startTime = Date.now();
      const requestId = String(extra.requestId ?? 'unknown');

      log.debug({ args, requestId }, 'list_definitions called');

      try {
        // Build where clause
        const where: {
          deletedAt: null;
          name?: { contains: string };
        } = {
          deletedAt: null, // Exclude soft-deleted definitions
        };

        // Filter by folder (uses name contains for simplicity)
        if (args.folder) {
          where.name = { contains: args.folder };
        }

        // Query definitions with pagination
        const limit = args.limit ?? 50;
        const offset = args.offset ?? 0;

        const definitions = await db.definition.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: args.include_children
            ? {
                _count: { select: { children: true } },
              }
            : undefined,
        });

        // Format definitions for response
        const formattedDefs: DefinitionListItem[] = definitions.map((def) => {
          const childCount = args.include_children
            ? (def as typeof def & { _count: { children: number } })._count.children
            : undefined;
          return formatDefinitionListItem(def, childCount);
        });

        // Build response with token budget enforcement
        const response = buildMcpResponse({
          toolName: 'list_definitions',
          data: formattedDefs,
          requestId,
          startTime,
          truncator: (data) => truncateArray(data, 20), // Truncate to 20 items if over budget
        });

        log.info(
          {
            requestId,
            count: formattedDefs.length,
            limit,
            offset,
            truncated: response.metadata.truncated,
            executionMs: response.metadata.executionMs,
          },
          'list_definitions completed'
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
        log.error({ err, requestId }, 'list_definitions failed');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'Failed to list definitions',
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
addToolRegistrar(registerListDefinitionsTool);

export { registerListDefinitionsTool };
