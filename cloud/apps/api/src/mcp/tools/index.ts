/**
 * MCP Tool Registry Index
 *
 * Central registry for all MCP tools. Each tool is implemented in its own file
 * and registered here to be loaded by the MCP server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from '@valuerank/shared';
import { toolRegistrars, addToolRegistrar, type ToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools');

// Import tools to trigger their registration via addToolRegistrar
// P1 MVP Tools
import './list-runs.js';
import './get-run-summary.js';
import './list-definitions.js';
import './graphql-query.js';
// P2 Tools
import './get-dimension-analysis.js';
import './get-transcript-summary.js';

/**
 * Registers all MCP tools on the given server
 *
 * @param server - MCP server instance to register tools on
 */
export function registerAllTools(server: McpServer): void {
  log.info({ toolCount: toolRegistrars.length }, 'Registering MCP tools');

  for (const registrar of toolRegistrars) {
    try {
      registrar(server);
    } catch (err) {
      log.error({ err }, 'Failed to register tool');
      throw err;
    }
  }

  log.info('All MCP tools registered');
}

// Re-export for tools to use
export { addToolRegistrar, type ToolRegistrar };
