/**
 * create_definition MCP Tool
 *
 * Creates a new scenario definition via MCP.
 * Validates content and delegates to existing service pattern.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db, type Dimension, type Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  validateDefinitionContent,
  validateContentStructure,
  logAuditEvent,
  createDefinitionAudit,
} from '../../services/mcp/index.js';
import { queueScenarioExpansion } from '../../services/scenario/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:create-definition');

const CURRENT_SCHEMA_VERSION = 2;

/**
 * Zod schema for dimension input
 */
const DimensionSchema = z.object({
  name: z.string().min(1).describe('Dimension name (used as placeholder)'),
  values: z.array(z.string().min(1)).min(2).describe('At least 2 level values'),
  description: z.string().optional().describe('Optional description'),
});

/**
 * Zod schema for definition content
 */
const ContentSchema = z.object({
  preamble: z.string().min(1).describe('Instructions for the AI being evaluated'),
  template: z.string().min(1).max(10000).describe('Scenario body with [placeholders]'),
  dimensions: z.array(DimensionSchema).max(10).describe('Variable dimensions (max 10)'),
  matching_rules: z.string().optional().describe('Optional scenario generation rules'),
});

/**
 * Input schema for create_definition tool
 */
const CreateDefinitionInputSchema = {
  name: z.string().min(1).max(255).describe('Definition name'),
  content: ContentSchema.describe('Definition content with preamble, template, and dimensions'),
  folder: z.string().optional().describe('Optional organization folder'),
  tags: z.array(z.string()).optional().describe('Optional tag names for categorization'),
};

/**
 * Ensures content has schema_version field
 */
function ensureSchemaVersion(
  content: Record<string, unknown>
): Prisma.InputJsonValue {
  if (!('schema_version' in content)) {
    return { schema_version: CURRENT_SCHEMA_VERSION, ...content };
  }
  return content as Prisma.InputJsonValue;
}

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
 * Registers the create_definition tool on the MCP server
 */
function registerCreateDefinitionTool(server: McpServer): void {
  log.info('Registering create_definition tool');

  server.registerTool(
    'create_definition',
    {
      description: `Create a new scenario definition.

Creates a definition with preamble (AI instructions), template (scenario body with [placeholders]),
and dimensions (variables that create scenario variants).

Returns definition_id on success, or validation errors if content is invalid.

Limits:
- Max 10 dimensions
- Max 10 levels per dimension
- Max 10000 character template
- Max 1000 generated scenarios

Example content:
{
  "preamble": "You are an AI assistant helping with ethical decisions.",
  "template": "A [severity] situation requires [action]. What do you recommend?",
  "dimensions": [
    { "name": "severity", "values": ["minor", "major", "critical"] },
    { "name": "action", "values": ["immediate response", "careful analysis"] }
  ]
}`,
      inputSchema: CreateDefinitionInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available

      log.debug({ args: { name: args.name }, requestId }, 'create_definition called');

      try {
        // Step 1: Validate content structure
        const structureCheck = validateContentStructure(args.content);
        if (!structureCheck.valid) {
          log.warn({ requestId, error: structureCheck.error }, 'Content structure invalid');
          return formatError('VALIDATION_ERROR', structureCheck.error);
        }

        // Step 2: Validate content limits and rules
        const validation = validateDefinitionContent({
          preamble: args.content.preamble,
          template: args.content.template,
          dimensions: args.content.dimensions as Dimension[],
          matching_rules: args.content.matching_rules,
        });

        if (!validation.valid) {
          log.warn({ requestId, errors: validation.errors }, 'Content validation failed');
          return formatError('VALIDATION_ERROR', 'Definition content is invalid', {
            errors: validation.errors,
            warnings: validation.warnings,
          });
        }

        // Step 3: Prepare content with schema version
        const processedContent = ensureSchemaVersion({
          preamble: args.content.preamble,
          template: args.content.template,
          dimensions: args.content.dimensions,
          matching_rules: args.content.matching_rules,
        });

        // Step 4: Create definition in database
        const definition = await db.definition.create({
          data: {
            name: args.name,
            content: processedContent,
          },
        });

        log.info({ requestId, definitionId: definition.id, name: args.name }, 'Definition created');

        // Step 5: Queue async scenario expansion
        const queueResult = await queueScenarioExpansion(definition.id, 'create');
        log.info(
          { requestId, definitionId: definition.id, jobId: queueResult.jobId, queued: queueResult.queued },
          'Scenario expansion queued'
        );

        // Step 6: Log audit event
        logAuditEvent(
          createDefinitionAudit({
            action: 'create_definition',
            userId,
            definitionId: definition.id,
            requestId,
            name: args.name,
          })
        );

        // Step 7: Return success response
        return formatSuccess({
          success: true,
          definition_id: definition.id,
          name: definition.name,
          estimated_scenario_count: validation.estimatedScenarioCount,
          validation_warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
          scenario_expansion: {
            queued: queueResult.queued,
            job_id: queueResult.jobId,
          },
        });
      } catch (err) {
        log.error({ err, requestId }, 'create_definition failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to create definition'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerCreateDefinitionTool);

export { registerCreateDefinitionTool };
