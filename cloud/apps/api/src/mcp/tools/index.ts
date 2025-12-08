/**
 * MCP Tool Registry
 *
 * Central registry for all MCP tools. Each tool is implemented in its own file
 * and registered here to be loaded by the MCP server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from '@valuerank/shared';

const log = createLogger('mcp:tools');

/**
 * Tool handler type that registers tools on an MCP server
 */
export type ToolRegistrar = (server: McpServer) => void;

// Tool registrars will be imported and added here as they are implemented
const toolRegistrars: ToolRegistrar[] = [];

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

/**
 * Adds a tool registrar to the registry
 * Used by individual tool modules to register themselves
 *
 * @param registrar - Function that registers a tool on the server
 */
export function addToolRegistrar(registrar: ToolRegistrar): void {
  toolRegistrars.push(registrar);
}
