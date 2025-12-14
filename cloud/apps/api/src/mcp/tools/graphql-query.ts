/**
 * graphql_query MCP Tool
 *
 * Executes arbitrary GraphQL queries for flexible data access.
 * Mutations are not allowed - read-only queries only.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { graphql, parse } from 'graphql';
import { createLogger } from '@valuerank/shared';
import { schema } from '../../graphql/index.js';
import { createDataLoaders } from '../../graphql/dataloaders/index.js';
import type { Context } from '../../graphql/context.js';
import { buildMcpResponse, exceedsBudget } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:graphql-query');

/**
 * Input schema for graphql_query tool
 */
const GraphQLQueryInputSchema = {
  query: z.string().describe('GraphQL query string (required)'),
  variables: z
    .record(z.unknown())
    .optional()
    .describe('Query variables (optional)'),
};

/**
 * Check if a query contains mutation operations
 */
function containsMutation(queryString: string): boolean {
  try {
    const doc = parse(queryString);
    return doc.definitions.some(
      (def) => def.kind === 'OperationDefinition' && def.operation === 'mutation'
    );
  } catch {
    // If we can't parse, let GraphQL handle the error
    return false;
  }
}

/**
 * Registers the graphql_query tool on the MCP server
 */
function registerGraphQLQueryTool(server: McpServer): void {
  log.info('Registering graphql_query tool');

  server.registerTool(
    'graphql_query',
    {
      description: `Execute arbitrary GraphQL queries for flexible data access.
Mutations are not allowed - read-only queries only.
Use schema introspection to discover available types.
Limited to 10KB token budget.`,
      inputSchema: GraphQLQueryInputSchema,
    },
    async (args, extra) => {
      const startTime = Date.now();
      const requestId = String(extra.requestId ?? 'unknown');

      log.debug({ requestId, queryLength: args.query.length }, 'graphql_query called');

      try {
        // Reject mutations
        if (containsMutation(args.query)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'MUTATION_NOT_ALLOWED',
                  message: 'MCP read tools do not support GraphQL mutations',
                }),
              },
            ],
            isError: true,
          };
        }

        // Create a proper GraphQL context for MCP queries
        // This includes the logger and dataloaders that resolvers expect
        const mcpLog = createLogger('mcp:graphql');
        const contextValue: Partial<Context> = {
          log: mcpLog,
          loaders: createDataLoaders(),
          user: { id: 'mcp-query', email: 'mcp@valuerank.ai' },
          authMethod: 'api_key',
        };

        // Execute the query
        const result = await graphql({
          schema,
          source: args.query,
          variableValues: args.variables,
          contextValue,
        });

        // Check response size before returning
        if (exceedsBudget('graphql_query', result)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'RESPONSE_TOO_LARGE',
                  message: 'Response exceeds token budget. Use pagination or filters.',
                }),
              },
            ],
            isError: true,
          };
        }

        // Build response
        const response = buildMcpResponse({
          toolName: 'graphql_query',
          data: result,
          requestId,
          startTime,
        });

        log.info(
          {
            requestId,
            hasErrors: !!result.errors?.length,
            bytes: response.metadata.bytes,
            executionMs: response.metadata.executionMs,
          },
          'graphql_query completed'
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
        log.error({ err, requestId }, 'graphql_query failed');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'Failed to execute GraphQL query',
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
addToolRegistrar(registerGraphQLQueryTool);

export { registerGraphQLQueryTool };
