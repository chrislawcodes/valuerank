/**
 * fork_definition MCP Tool
 *
 * Forks an existing definition with optional modifications via MCP.
 * Validates content and creates child definition with parent relationship.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db, createPartialContent, createInheritingContent, type Dimension, type Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  validateDefinitionContent,
  logAuditEvent,
  createDefinitionAudit,
} from '../../services/mcp/index.js';
import { queueScenarioExpansion } from '../../services/scenario/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:fork-definition');

/**
 * Zod schema for dimension input
 */
const DimensionSchema = z.object({
  name: z.string().min(1).describe('Dimension name'),
  values: z.array(z.string().min(1)).min(2).describe('Level values'),
  description: z.string().optional().describe('Optional description'),
});

/**
 * Zod schema for partial content changes
 */
const ChangesSchema = z.object({
  preamble: z.string().optional().describe('New preamble (overrides parent)'),
  template: z.string().max(10000).optional().describe('New template (overrides parent)'),
  dimensions: z.array(DimensionSchema).max(10).optional().describe('New dimensions (overrides parent)'),
  matching_rules: z.string().optional().describe('New matching rules (overrides parent)'),
});

/**
 * Input schema for fork_definition tool
 */
const ForkDefinitionInputSchema = {
  parent_id: z.string().min(1).describe('ID of the definition to fork'),
  name: z.string().min(1).max(255).describe('Name for the forked definition'),
  version_label: z.string().optional().describe('Human-readable version label'),
  changes: ChangesSchema.optional().describe('Partial content changes (only fields to override)'),
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
 * Calculates a diff summary of changes from parent
 */
function calculateDiffSummary(
  changes: z.infer<typeof ChangesSchema> | undefined,
  parentContent: Record<string, unknown>
): string[] {
  const diffs: string[] = [];

  if (!changes) {
    return ['No changes - created exact copy'];
  }

  if (changes.preamble !== undefined) {
    diffs.push('Preamble modified');
  }
  if (changes.template !== undefined) {
    diffs.push('Template modified');
  }
  if (changes.dimensions !== undefined) {
    const parentDimCount = Array.isArray(parentContent.dimensions)
      ? parentContent.dimensions.length
      : 0;
    const newDimCount = changes.dimensions.length;
    if (newDimCount !== parentDimCount) {
      diffs.push(`Dimensions changed: ${parentDimCount} → ${newDimCount}`);
    } else {
      diffs.push('Dimensions modified');
    }
  }
  if (changes.matching_rules !== undefined) {
    diffs.push('Matching rules modified');
  }

  if (diffs.length === 0) {
    return ['No changes - created exact copy'];
  }

  return diffs;
}

/**
 * Registers the fork_definition tool on the MCP server
 */
function registerForkDefinitionTool(server: McpServer): void {
  log.info('Registering fork_definition tool');

  server.registerTool(
    'fork_definition',
    {
      description: `Fork an existing definition with optional modifications.

Creates a child definition linked to the parent via parent_id.
Only specify fields you want to change - unspecified fields inherit from parent.

Returns definition_id and diff_summary showing what changed.

Example:
{
  "parent_id": "abc123",
  "name": "Trolley Problem v2",
  "version_label": "higher-stakes",
  "changes": {
    "template": "A [severity] train approaches [victims]..."
  }
}`,
      inputSchema: ForkDefinitionInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available

      log.debug({ parentId: args.parent_id, name: args.name, requestId }, 'fork_definition called');

      try {
        // Step 1: Fetch parent definition
        const parent = await db.definition.findUnique({
          where: { id: args.parent_id },
        });

        if (!parent) {
          log.warn({ requestId, parentId: args.parent_id }, 'Parent definition not found');
          return formatError('NOT_FOUND', `Parent definition not found: ${args.parent_id}`);
        }

        // Check if parent is soft-deleted
        if (parent.deletedAt !== null) {
          log.warn({ requestId, parentId: args.parent_id }, 'Parent definition is soft-deleted');
          return formatError('NOT_FOUND', `Parent definition not found: ${args.parent_id}`);
        }

        const parentContent = parent.content as Record<string, unknown>;

        // Step 2: Determine final content
        let finalContent: Prisma.InputJsonValue;
        const changes = args.changes;

        if (changes && Object.keys(changes).length > 0) {
          // Create v2 content with only provided fields as overrides
          finalContent = createPartialContent({
            preamble: changes.preamble,
            template: changes.template,
            dimensions: changes.dimensions as Dimension[] | undefined,
            matching_rules: changes.matching_rules,
          }) as Prisma.InputJsonValue;

          log.debug({ overrides: Object.keys(changes), requestId }, 'Fork with partial overrides');
        } else {
          // No changes - inherit everything (minimal v2 content)
          finalContent = createInheritingContent() as Prisma.InputJsonValue;
          log.debug({ requestId }, 'Fork with full inheritance');
        }

        // Step 3: Validate merged content (if changes were provided)
        if (changes && Object.keys(changes).length > 0) {
          // Merge changes with parent content for validation
          const mergedContent = {
            preamble: changes.preamble ?? (parentContent.preamble as string),
            template: changes.template ?? (parentContent.template as string),
            dimensions: (changes.dimensions ?? parentContent.dimensions) as Dimension[],
            matching_rules: changes.matching_rules ?? (parentContent.matching_rules as string | undefined),
          };

          const validation = validateDefinitionContent(mergedContent);

          if (!validation.valid) {
            log.warn({ requestId, errors: validation.errors }, 'Fork content validation failed');
            return formatError('VALIDATION_ERROR', 'Merged content is invalid', {
              errors: validation.errors,
              warnings: validation.warnings,
            });
          }
        }

        // Step 4: Create forked definition
        const definition = await db.definition.create({
          data: {
            name: args.name,
            content: finalContent,
            parentId: args.parent_id,
          },
        });

        log.info(
          { requestId, definitionId: definition.id, parentId: args.parent_id, name: args.name },
          'Definition forked'
        );

        // Step 5: Queue async scenario expansion
        const queueResult = await queueScenarioExpansion(definition.id, 'fork');
        log.info(
          { requestId, definitionId: definition.id, jobId: queueResult.jobId, queued: queueResult.queued },
          'Scenario expansion queued for fork'
        );

        // Step 6: Log audit event
        logAuditEvent(
          createDefinitionAudit({
            action: 'fork_definition',
            userId,
            definitionId: definition.id,
            requestId,
            parentId: args.parent_id,
            name: args.name,
          })
        );

        // Step 7: Calculate diff summary
        const diffSummary = calculateDiffSummary(changes, parentContent);

        // Step 8: Return success response
        return formatSuccess({
          success: true,
          definition_id: definition.id,
          parent_id: args.parent_id,
          name: definition.name,
          version_label: args.version_label,
          diff_summary: diffSummary,
          scenario_expansion: {
            queued: queueResult.queued,
            job_id: queueResult.jobId,
          },
        });
      } catch (err) {
        log.error({ err, requestId }, 'fork_definition failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to fork definition'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerForkDefinitionTool);

export { registerForkDefinitionTool };
