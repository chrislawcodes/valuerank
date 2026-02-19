/**
 * update_definition MCP Tool
 *
 * Updates a definition's name and/or preamble version.
 * Increments version on preamble changes (matches UX behavior).
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db, type Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { logAuditEvent } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:update-definition');

/**
 * Input schema for update_definition tool
 */
const UpdateDefinitionInputSchema = {
  definition_id: z.string().min(1).describe('ID of the definition to update'),
  name: z.string().min(1).max(255).optional().describe('New name for the definition'),
  preamble_version_id: z
    .string()
    .nullable()
    .optional()
    .describe('Preamble version ID to set, or null to clear. Omit to leave unchanged.'),
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
 * Registers the update_definition tool on the MCP server
 */
function registerUpdateDefinitionTool(server: McpServer): void {
  log.info('Registering update_definition tool');

  server.registerTool(
    'update_definition',
    {
      description: `Update a definition's name and/or preamble version.

Preamble changes increment the definition version (matching UX behavior).
Name changes do NOT increment the version.

To clear the preamble, set preamble_version_id to null.
To leave preamble unchanged, omit preamble_version_id entirely.

Example - set preamble:
{
  "definition_id": "abc123",
  "preamble_version_id": "preamble-v1-id"
}

Example - clear preamble:
{
  "definition_id": "abc123",
  "preamble_version_id": null
}

Example - rename only:
{
  "definition_id": "abc123",
  "name": "New Name"
}`,
      inputSchema: UpdateDefinitionInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user';

      log.debug(
        { definitionId: args.definition_id, requestId },
        'update_definition called'
      );

      try {
        // Step 1: Validate definition exists and is not soft-deleted
        const existing = await db.definition.findUnique({
          where: { id: args.definition_id },
        });

        if (!existing || existing.deletedAt !== null) {
          log.warn({ requestId, definitionId: args.definition_id }, 'Definition not found');
          return formatError('NOT_FOUND', `Definition not found: ${args.definition_id}`);
        }

        // Step 2: Check that at least one field is being updated
        const hasNameChange = args.name !== undefined;
        const hasPreambleChange = args.preamble_version_id !== undefined;

        if (!hasNameChange && !hasPreambleChange) {
          return formatError(
            'VALIDATION_ERROR',
            'At least one of name or preamble_version_id must be provided'
          );
        }

        // Step 3: Validate preamble version exists (if provided and non-null)
        if (hasPreambleChange && args.preamble_version_id !== null) {
          const preambleVersion = await db.preambleVersion.findUnique({
            where: { id: args.preamble_version_id as string },
          });
          if (!preambleVersion) {
            return formatError(
              'NOT_FOUND',
              `Preamble version not found: ${args.preamble_version_id}`
            );
          }
        }

        // Step 4: Build update data
        const updateData: Prisma.DefinitionUpdateInput = {};
        const changes: string[] = [];

        if (hasNameChange) {
          updateData.name = args.name;
          changes.push(`name: "${existing.name}" → "${args.name}"`);
        }

        let needsVersionIncrement = false;
        if (hasPreambleChange && existing.preambleVersionId !== args.preamble_version_id) {
          if (args.preamble_version_id === null) {
            updateData.preambleVersion = { disconnect: true };
          } else {
            updateData.preambleVersion = { connect: { id: args.preamble_version_id as string } };
          }
          needsVersionIncrement = true;
          changes.push(
            `preambleVersionId: ${existing.preambleVersionId ?? 'null'} → ${args.preamble_version_id ?? 'null'}`
          );
        } else if (hasPreambleChange) {
          // Preamble was provided but is the same value - no change needed
          changes.push('preambleVersionId: unchanged (already set to requested value)');
        }

        if (needsVersionIncrement) {
          updateData.version = { increment: 1 };
        }

        // Step 5: Apply update
        const updated = await db.definition.update({
          where: { id: args.definition_id },
          data: updateData,
          include: {
            preambleVersion: {
              include: { preamble: true },
            },
          },
        });

        log.info(
          {
            requestId,
            definitionId: args.definition_id,
            changes,
            versionBefore: existing.version,
            versionAfter: updated.version,
          },
          'Definition updated'
        );

        // Step 6: Audit log
        logAuditEvent({
          action: 'update_definition',
          userId,
          entityId: args.definition_id,
          entityType: 'definition',
          requestId,
          metadata: {
            changes,
            versionBefore: existing.version,
            versionAfter: updated.version,
          },
        });

        // Step 7: Return success
        return formatSuccess({
          success: true,
          definition_id: updated.id,
          name: updated.name,
          version: {
            before: existing.version,
            after: updated.version,
            incremented: needsVersionIncrement,
          },
          preamble: {
            version_id: updated.preambleVersionId,
            preamble_name: updated.preambleVersion?.preamble?.name ?? null,
            version_label: updated.preambleVersion?.version ?? null,
          },
          changes,
        });
      } catch (err) {
        log.error({ err, requestId }, 'update_definition failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to update definition'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerUpdateDefinitionTool);

export { registerUpdateDefinitionTool };
