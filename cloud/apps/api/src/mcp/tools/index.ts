/**
 * MCP Tool Registry Index
 *
 * Central registry for all MCP tools. Each tool is implemented in its own file
 * and registered here to be loaded by the MCP server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from '@valuerank/shared';
import {
  toolRegistrars,
  addToolRegistrar,
  isServerRegistered,
  markServerRegistered,
  type ToolRegistrar,
} from './registry.js';

const log = createLogger('mcp:tools');

// Import tools to trigger their registration via addToolRegistrar
// P1 MVP Tools - Read
import './list-runs.js';
import './get-run-summary.js';
import './list-definitions.js';
import './graphql-query.js';
// P2 Tools - Read
import './get-dimension-analysis.js';
import './get-transcript-summary.js';
import './get-transcript.js';
// Stage 14 - Write Tools
import './create-definition.js';
import './fork-definition.js';
import './validate-definition.js';
import './start-run.js';
import './generate-scenarios-preview.js';
// Feature 014 - Delete Tools
import './delete-definition.js';
import './delete-run.js';
// Feature 014 - LLM Management Tools
import './list-llm-providers.js';
import './list-llm-models.js';
import './get-llm-model.js';
import './create-llm-model.js';
import './update-llm-model.js';
import './deprecate-llm-model.js';
import './reactivate-llm-model.js';
import './set-default-llm-model.js';
import './update-llm-provider.js';
import './set-infra-model.js';
import './list-system-settings.js';
// Feature 017 - Parallel Summarization
import './set-summarization-parallelism.js';
import './cancel-summarization.js';
import './restart-summarization.js';

/**
 * Registers all MCP tools on the given server
 *
 * This function is idempotent - calling it multiple times on the same server
 * will only register tools once. This is important for test isolation where
 * multiple server instances may be created but share the singleton MCP server.
 *
 * @param server - MCP server instance to register tools on
 */
export function registerAllTools(server: McpServer): void {
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
