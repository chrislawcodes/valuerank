/**
 * remove_tags_from_definitions MCP Tool
 *
 * Bulk-remove tags from one or more definitions.
 * Uses soft-delete on DefinitionTag associations.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { logAuditEvent } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:remove-tags-from-definitions');

const TAG_NAME_REGEX = /^[a-z0-9_-]+$/;

/**
 * Input schema for remove_tags_from_definitions tool
 */
const RemoveTagsInputSchema = {
  definition_ids: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .describe('IDs of definitions to remove tags from (max 100)'),
  tag_names: z
    .array(z.string().min(1).max(50))
    .min(1)
    .max(20)
    .describe('Tag names to remove (max 20). Will be normalized to lowercase.'),
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
 * Registers the remove_tags_from_definitions tool on the MCP server
 */
function registerRemoveTagsFromDefinitionsTool(server: McpServer): void {
  log.info('Registering remove_tags_from_definitions tool');

  server.registerTool(
    'remove_tags_from_definitions',
    {
      description: `Bulk-remove tags from one or more definitions.

Tag names are normalized to lowercase and trimmed.
Tags that are not assigned to a definition are silently skipped.
Tags do NOT affect the definition version.

Example:
{
  "definition_ids": ["def1", "def2"],
  "tag_names": ["deprecated", "draft"]
}`,
      inputSchema: RemoveTagsInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user';

      log.debug(
        {
          definitionCount: args.definition_ids.length,
          tagCount: args.tag_names.length,
          requestId,
        },
        'remove_tags_from_definitions called'
      );

      try {
        // Step 1: Normalize and validate tag names
        const normalizedTags = args.tag_names.map((t) => t.toLowerCase().trim());
        const invalidTags = normalizedTags.filter((t) => !TAG_NAME_REGEX.test(t));
        if (invalidTags.length > 0) {
          return formatError(
            'VALIDATION_ERROR',
            'Invalid tag names. Must contain only lowercase letters, numbers, hyphens, and underscores.',
            { invalid_tags: invalidTags }
          );
        }

        // Step 2: Validate all definitions exist and are not soft-deleted
        const definitions = await db.definition.findMany({
          where: {
            id: { in: args.definition_ids },
            deletedAt: null,
          },
          select: { id: true },
        });

        const foundIds = new Set(definitions.map((d) => d.id));
        const missingIds = args.definition_ids.filter((id) => !foundIds.has(id));
        if (missingIds.length > 0) {
          return formatError(
            'NOT_FOUND',
            `${missingIds.length} definition(s) not found or soft-deleted`,
            { missing_ids: missingIds }
          );
        }

        // Step 3: Look up tag records
        const tags = await db.tag.findMany({
          where: { name: { in: normalizedTags } },
        });

        const foundTagNames = new Set(tags.map((t) => t.name));
        const missingTags = normalizedTags.filter((t) => !foundTagNames.has(t));

        // Step 4: Soft-delete associations
        let removed = 0;
        let notAssigned = 0;

        const definitionIds = definitions.map((d) => d.id);
        const tagIds = tags.map((t) => t.id);

        if (tagIds.length > 0 && definitionIds.length > 0) {
          // Find existing active associations
          const existingAssociations = await db.definitionTag.findMany({
            where: {
              definitionId: { in: definitionIds },
              tagId: { in: tagIds },
              deletedAt: null,
            },
            select: { id: true },
          });

          if (existingAssociations.length > 0) {
            await db.definitionTag.updateMany({
              where: {
                id: { in: existingAssociations.map((a) => a.id) },
              },
              data: { deletedAt: new Date() },
            });
            removed = existingAssociations.length;
          }

          // Calculate how many were not assigned
          const totalPossible = definitionIds.length * tagIds.length;
          notAssigned = totalPossible - removed;
        }

        // Count associations that couldn't be found because tags don't exist
        const missingTagAssociations = missingTags.length * definitionIds.length;
        notAssigned += missingTagAssociations;

        log.info(
          {
            requestId,
            definitionCount: definitions.length,
            tagCount: normalizedTags.length,
            removed,
            notAssigned,
            missingTags,
          },
          'Tags removed from definitions'
        );

        // Step 5: Audit log
        logAuditEvent({
          action: 'remove_tags_from_definitions',
          userId,
          entityId: 'bulk',
          entityType: 'definition',
          requestId,
          metadata: {
            definitionIds: args.definition_ids,
            tagNames: normalizedTags,
            removed,
            notAssigned,
            missingTags,
          },
        });

        // Step 6: Return success
        return formatSuccess({
          success: true,
          definitions_processed: definitions.length,
          tags_requested: normalizedTags,
          tags_not_found: missingTags.length > 0 ? missingTags : undefined,
          associations_removed: removed,
          associations_not_assigned: notAssigned,
        });
      } catch (err) {
        log.error({ err, requestId }, 'remove_tags_from_definitions failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to remove tags from definitions'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerRemoveTagsFromDefinitionsTool);

export { registerRemoveTagsFromDefinitionsTool };
