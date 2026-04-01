/**
 * MCP Tool Registry Index
 *
 * Central registry for all MCP tools. Each tool is implemented in its own file
 * and registered here to be loaded by the MCP server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from '@valuerank/shared';
import { autoImportDir } from '../../utils/auto-import.js';
import {
  toolRegistrars,
  addToolRegistrar,
  isServerRegistered,
  markServerRegistered,
  type ToolRegistrar,
} from './registry.js';

const log = createLogger('mcp:tools');

const toolsReady = autoImportDir(import.meta.url, 'MCP tools', [
  'registry.js',
  'helpers.js',
  'value-pair-helpers.js',
]);

/**
 * Registers all MCP tools on the given server
 *
 * This function is idempotent - calling it multiple times on the same server
 * will only register tools once. This is important for test isolation where
 * multiple server instances may be created but share the singleton MCP server.
 *
 * @param server - MCP server instance to register tools on
 */
export async function registerAllTools(server: McpServer): Promise<void> {
  await toolsReady;

  // Skip if tools already registered on this server
  if (isServerRegistered(server)) {
    log.debug('Tools already registered on this server, skipping');
    return;
  }

  log.info({ toolCount: toolRegistrars.length }, 'Registering MCP tools');

  for (const registrar of toolRegistrars) {
    try {
      registrar(server);
    } catch (err) {
      log.error({ err }, 'Failed to register tool');
      throw err;
    }
  }

  markServerRegistered(server);
  log.info('All MCP tools registered');
}

// Re-export for tools to use
export { addToolRegistrar, type ToolRegistrar };
