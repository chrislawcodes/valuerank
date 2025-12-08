/**
 * MCP Resources Index
 *
 * Central registry for all MCP resources.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from '@valuerank/shared';

import {
  registerAuthoringGuideResource,
  AUTHORING_GUIDE_URI,
} from './authoring-guide.js';
import {
  registerAuthoringExamplesResource,
  AUTHORING_EXAMPLES_URI,
} from './authoring-examples.js';
import {
  registerValuePairsResource,
  VALUE_PAIRS_URI,
} from './value-pairs.js';
import {
  registerPreambleTemplatesResource,
  PREAMBLE_TEMPLATES_URI,
} from './preamble-templates.js';

const log = createLogger('mcp:resources');

/**
 * Track which servers have had resources registered to avoid duplicate registration
 * Using WeakSet so servers can be garbage collected when no longer referenced
 */
const registeredServers = new WeakSet<McpServer>();

/**
 * All available resource URIs
 */
export const RESOURCE_URIS = {
  AUTHORING_GUIDE: AUTHORING_GUIDE_URI,
  AUTHORING_EXAMPLES: AUTHORING_EXAMPLES_URI,
  VALUE_PAIRS: VALUE_PAIRS_URI,
  PREAMBLE_TEMPLATES: PREAMBLE_TEMPLATES_URI,
} as const;

/**
 * Registers all MCP resources on the given server
 *
 * This function is idempotent - calling it multiple times on the same server
 * will only register resources once.
 *
 * @param server - MCP server instance to register resources on
 */
export function registerAllResources(server: McpServer): void {
  // Skip if resources already registered on this server
  if (registeredServers.has(server)) {
    log.debug('Resources already registered on this server, skipping');
    return;
  }

  log.info('Registering MCP resources');

  try {
    registerAuthoringGuideResource(server);
    registerAuthoringExamplesResource(server);
    registerValuePairsResource(server);
    registerPreambleTemplatesResource(server);

    registeredServers.add(server);
    log.info({ resourceCount: 4 }, 'All MCP resources registered');
  } catch (err) {
    log.error({ err }, 'Failed to register MCP resources');
    throw err;
  }
}

// Re-export individual URIs for convenience
export {
  AUTHORING_GUIDE_URI,
  AUTHORING_EXAMPLES_URI,
  VALUE_PAIRS_URI,
  PREAMBLE_TEMPLATES_URI,
};
