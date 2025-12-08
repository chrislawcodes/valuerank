/**
 * MCP Server Module
 *
 * Initializes the MCP server with tool capabilities.
 * Uses the high-level McpServer API from @modelcontextprotocol/sdk.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from '@valuerank/shared';

const log = createLogger('mcp:server');

/**
 * Creates and configures the MCP server instance
 *
 * The server is configured with:
 * - Tool capabilities for ValueRank data queries and write operations
 * - Resource capabilities for authoring guidance (Stage 14)
 * - Structured logging
 */
export function createMcpServer(): McpServer {
  log.info('Initializing MCP server');

  const server = new McpServer(
    {
      name: 'valuerank-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {}, // Stage 14: Enable resources for authoring guidance
      },
      instructions: `
ValueRank MCP Server - AI Moral Values Evaluation Framework

This server provides access to ValueRank data and authoring capabilities.

## Read Tools (Query Data)
- list_definitions: Browse available scenario definitions
- list_runs: Query evaluation runs with filters
- get_run_summary: Get aggregated analysis for completed runs
- get_dimension_analysis: See which dimensions drive model divergence
- get_transcript_summary: Get transcript metadata without full text
- graphql_query: Execute arbitrary GraphQL queries

## Write Tools (Create & Modify)
- create_definition: Create a new scenario definition
- fork_definition: Fork an existing definition with modifications
- validate_definition: Validate content before saving (dry run)
- start_run: Start an evaluation run with specified models
- generate_scenarios_preview: Preview generated scenarios

## Authoring Resources
- valuerank://authoring/guide: Best practices for scenario authoring
- valuerank://authoring/examples: Annotated example definitions
- valuerank://authoring/value-pairs: Common value tensions for dilemmas
- valuerank://authoring/preamble-templates: Tested preamble patterns

All responses are optimized for AI context windows with token budgets.
Authentication required via X-API-Key header.
      `.trim(),
    }
  );

  log.info('MCP server initialized');
  return server;
}

// Singleton instance for the application
let mcpServerInstance: McpServer | null = null;

/**
 * Gets or creates the singleton MCP server instance
 */
export function getMcpServer(): McpServer {
  if (!mcpServerInstance) {
    mcpServerInstance = createMcpServer();
  }
  return mcpServerInstance;
}

/**
 * Resets the MCP server instance (for testing)
 */
export function resetMcpServer(): void {
  mcpServerInstance = null;
}
