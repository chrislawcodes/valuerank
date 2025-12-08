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
 * - Tool capabilities for ValueRank data queries
 * - Structured logging
 * - No resources or prompts (read-only tools only)
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
      },
      instructions: `
ValueRank MCP Server - AI Moral Values Evaluation Framework

This server provides read-only access to ValueRank data through the following tools:

- list_definitions: Browse available scenario definitions
- list_runs: Query evaluation runs with filters
- get_run_summary: Get aggregated analysis for completed runs
- get_dimension_analysis: See which dimensions drive model divergence
- get_transcript_summary: Get transcript metadata without full text
- graphql_query: Execute arbitrary GraphQL queries (read-only)

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
