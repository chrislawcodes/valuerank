/**
 * get_definition_value_pairs MCP Tool
 *
 * Returns the value pair (two Schwartz dimensions) tested by each definition.
 * Useful for mapping vignettes to their value tensions before running
 * cross-model analysis like Bradley-Terry ranking.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from '@valuerank/shared';
import { buildMcpResponse, truncateArray } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';
import { fetchDefinitionValuePairs } from './value-pair-helpers.js';

const log = createLogger('mcp:tools:get-value-pairs');

const GetValuePairsInputSchema = {
  folder: z
    .string()
    .optional()
    .describe('Filter definitions by name (contains match)'),
  tag: z.string().optional().describe('Filter definitions by tag name'),
  definition_ids: z
    .array(z.string())
    .optional()
    .describe('Explicit definition IDs (overrides folder/tag filters)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(100)
    .describe('Maximum definitions to return (default: 100, max: 200)'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of definitions to skip for pagination'),
};

type ValuePairRow = {
  definitionId: string;
  name: string;
  value_a: string;
  value_b: string;
};

type GetValuePairsOutput = {
  pairs: ValuePairRow[];
  count: number;
  skipped: number;
};

function registerGetValuePairsTool(server: McpServer): void {
  log.info('Registering get_definition_value_pairs tool');

  server.registerTool(
    'get_definition_value_pairs',
    {
      description: `Get the value pair (two Schwartz dimensions) tested by each definition/vignette.
Returns definitionId, name, value_a, and value_b for each definition matching the filter.
Use this to map vignettes to their value tensions before cross-model analysis.
Supports filtering by folder name, tag, or explicit definition IDs.
Limited to 10KB token budget.`,
      inputSchema: GetValuePairsInputSchema,
    },
    async (args, extra) => {
      const startTime = Date.now();
      const requestId = String(extra.requestId ?? 'unknown');

      log.debug({ args, requestId }, 'get_definition_value_pairs called');

      try {
        const result = await fetchDefinitionValuePairs({
          folder: args.folder,
          tag: args.tag,
          definitionIds: args.definition_ids,
          limit: args.limit,
          offset: args.offset,
        });

        const pairs: ValuePairRow[] = result.pairs.map((p) => ({
          definitionId: p.definitionId,
          name: p.name,
          value_a: p.valueA,
          value_b: p.valueB,
        }));

        const data: GetValuePairsOutput = {
          pairs,
          count: pairs.length,
          skipped: result.skipped,
        };

        const response = buildMcpResponse({
          toolName: 'get_definition_value_pairs',
          data,
          requestId,
          startTime,
          truncator: (payload) => ({
            ...payload,
            pairs: truncateArray(payload.pairs, 50),
            count: Math.min(payload.count, 50),
          }),
        });

        log.info(
          {
            requestId,
            count: pairs.length,
            skipped: result.skipped,
            executionMs: response.metadata.executionMs,
          },
          'get_definition_value_pairs completed'
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
        log.error({ err, requestId }, 'get_definition_value_pairs failed');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get definition value pairs',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

addToolRegistrar(registerGetValuePairsTool);

export { registerGetValuePairsTool };
