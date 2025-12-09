/**
 * delete_definition MCP Tool
 *
 * Soft-deletes a scenario definition via MCP.
 * Cascades to associated scenarios. Blocks if running runs exist.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { softDeleteDefinition, getDefinitionById } from '@valuerank/db';
import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import {
  logAuditEvent,
  createDeleteAudit,
} from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:delete-definition');

/**
 * Input schema for delete_definition tool
 */
const DeleteDefinitionInputSchema = {
  definition_id: z.string().cuid().describe('ID of the definition to delete'),
};

/**
 * Format error response for MCP
 */
function formatError(code: string, message: string, details?: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: code, message, details }, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Format success response for MCP
 */
function formatSuccess(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Registers the delete_definition tool on the MCP server
 */
function registerDeleteDefinitionTool(server: McpServer): void {
  log.info('Registering delete_definition tool');

  server.registerTool(
    'delete_definition',
    {
      description: `Soft-delete a scenario definition and its associated scenarios.

**Behavior:**
- Sets deletedAt timestamp on the definition (soft delete)
- Cascades soft-delete to all associated scenarios
- Cascades soft-delete to all child definitions (descendants/forks)
- Deleted definitions no longer appear in list_definitions

**Validation:**
- Blocks deletion if the definition has any runs in RUNNING status
- Returns 404 if definition doesn't exist
- Returns error if already deleted

**Recovery:**
- Data is not permanently deleted
- Contact admin to restore if needed`,
      inputSchema: DeleteDefinitionInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available

      log.debug({
        definitionId: args.definition_id,
        requestId,
      }, 'delete_definition called');

      try {
        // Verify definition exists first (for better error messages)
        let definitionName: string;
        try {
          const definition = await getDefinitionById(args.definition_id);
          definitionName = definition.name;
        } catch (err) {
          if (err instanceof NotFoundError) {
            log.warn({ requestId, definitionId: args.definition_id }, 'Definition not found');
            return formatError('NOT_FOUND', `Definition not found: ${args.definition_id}`);
          }
          throw err;
        }

        // Perform soft delete with cascading
        const deletedIds = await softDeleteDefinition(args.definition_id);

        log.info({
          requestId,
          definitionId: args.definition_id,
          name: definitionName,
          deletedCount: deletedIds.length,
        }, 'Definition deleted');

        // Log audit event
        logAuditEvent(
          createDeleteAudit({
            action: 'delete_definition',
            userId,
            entityId: args.definition_id,
            entityType: 'definition',
            requestId,
            deletedCount: {
              primary: 1,
              scenarios: deletedIds.length - 1, // descendants
            },
          })
        );

        // Return success response
        return formatSuccess({
          success: true,
          definition_id: args.definition_id,
          name: definitionName,
          deleted_at: new Date().toISOString(),
          deleted_count: {
            definitions: deletedIds.length,
          },
        });
      } catch (err) {
        log.error({ err, requestId }, 'delete_definition failed');

        // Handle specific error types
        if (err instanceof ValidationError) {
          const details = (err as ValidationError & { context?: Record<string, unknown> }).context;
          if (details && 'runningRunCount' in details) {
            return formatError(
              'HAS_RUNNING_RUNS',
              'Cannot delete definition with running runs. Wait for runs to complete or cancel them first.',
              { runningRunCount: details.runningRunCount }
            );
          }
          if (err.message.includes('already deleted')) {
            return formatError('ALREADY_DELETED', `Definition is already deleted: ${args.definition_id}`);
          }
          return formatError('VALIDATION_ERROR', err.message);
        }

        if (err instanceof NotFoundError) {
          return formatError('NOT_FOUND', `Definition not found: ${args.definition_id}`);
        }

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to delete definition'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerDeleteDefinitionTool);

export { registerDeleteDefinitionTool };
