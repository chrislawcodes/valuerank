/**
 * add_tags_to_definitions MCP Tool
 *
 * Bulk-add tags to one or more definitions.
 * Finds-or-creates tags, creates associations idempotently.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { logAuditEvent } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:add-tags-to-definitions');

const TAG_NAME_REGEX = /^[a-z0-9_-]+$/;

/**
 * Input schema for add_tags_to_definitions tool
 */
const AddTagsInputSchema = {
  definition_ids: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .describe('IDs of definitions to add tags to (max 100)'),
  tag_names: z
    .array(z.string().min(1).max(50))
    .min(1)
    .max(20)
    .describe('Tag names to add (max 20). Will be normalized to lowercase.'),
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
 * Registers the add_tags_to_definitions tool on the MCP server
 */
function registerAddTagsToDefinitionsTool(server: McpServer): void {
  log.info('Registering add_tags_to_definitions tool');

  server.registerTool(
    'add_tags_to_definitions',
    {
      description: `Bulk-add tags to one or more definitions.

Tags are normalized to lowercase and trimmed. Invalid names are rejected.
Tag names must match /^[a-z0-9_-]+$/ (lowercase alphanumeric, hyphens, underscores).

Idempotent - if a tag is already assigned to a definition, it is skipped.
Tags do NOT increment the definition version.

Example:
{
  "definition_ids": ["def1", "def2", "def3"],
  "tag_names": ["job", "generated"]
}`,
      inputSchema: AddTagsInputSchema,
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
        'add_tags_to_definitions called'
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

        // Step 3: Find-or-create each tag
        const tagRecords = await Promise.all(
          normalizedTags.map(async (name) => {
            let tag = await db.tag.findUnique({ where: { name } });
            if (!tag) {
              tag = await db.tag.create({ data: { name } });
              log.info({ requestId, tagId: tag.id, tagName: name }, 'Tag created');
            }
            return tag;
          })
        );

        // Step 4: Create associations (idempotent)
        let added = 0;
        let skipped = 0;

        for (const def of definitions) {
          for (const tag of tagRecords) {
            const existing = await db.definitionTag.findUnique({
              where: {
                definitionId_tagId: {
                  definitionId: def.id,
                  tagId: tag.id,
                },
              },
            });

            if (existing) {
              // If soft-deleted, restore it
              if (existing.deletedAt !== null) {
                await db.definitionTag.update({
                  where: { id: existing.id },
                  data: { deletedAt: null },
                });
                added++;
              } else {
                skipped++;
              }
            } else {
              await db.definitionTag.create({
                data: {
                  definitionId: def.id,
                  tagId: tag.id,
                },
              });
              added++;
            }
          }
        }

        log.info(
          {
            requestId,
            definitionCount: definitions.length,
            tagCount: tagRecords.length,
            added,
            skipped,
          },
          'Tags added to definitions'
        );

        // Step 5: Audit log
        logAuditEvent({
          action: 'add_tags_to_definitions',
          userId,
          entityId: 'bulk',
          entityType: 'definition',
          requestId,
          metadata: {
            definitionIds: args.definition_ids,
            tagNames: normalizedTags,
            added,
            skipped,
          },
        });

        // Step 6: Return success
        return formatSuccess({
          success: true,
          definitions_processed: definitions.length,
          tags_processed: normalizedTags,
          associations_added: added,
          associations_skipped: skipped,
          total_associations: added + skipped,
        });
      } catch (err) {
        log.error({ err, requestId }, 'add_tags_to_definitions failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to add tags to definitions'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerAddTagsToDefinitionsTool);

export { registerAddTagsToDefinitionsTool };
