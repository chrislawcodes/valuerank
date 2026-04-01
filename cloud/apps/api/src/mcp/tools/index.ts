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
 * Track in-flight registration so concurrent callers share the same work.
 *
 * The MCP server is a singleton in the application, but tests can create the
 * router multiple times before the first async registration finishes. Without
 * this guard, those concurrent calls race past the `isServerRegistered` check
 * and try to register the same tool twice.
 */
const registrationPromises = new WeakMap<McpServer, Promise<void>>();

function isDuplicateToolRegistrationError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('already registered');
}

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
  const inFlight = registrationPromises.get(server);
  if (inFlight !== undefined) {
    await inFlight;
    return;
  }

  const registrationPromise = (async () => {
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
        if (isDuplicateToolRegistrationError(err)) {
          log.debug({ err }, 'Skipping duplicate MCP tool registration');
          continue;
        }
        log.error({ err }, 'Failed to register tool');
        throw err;
      }
    }

    markServerRegistered(server);
    log.info('All MCP tools registered');
  })();

  registrationPromises.set(server, registrationPromise);

  try {
    await registrationPromise;
  } catch (err) {
    registrationPromises.delete(server);
    throw err;
  }
}

// Re-export for tools to use
export { addToolRegistrar, type ToolRegistrar };
