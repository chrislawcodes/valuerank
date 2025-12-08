/**
 * validate_definition MCP Tool
 *
 * Validates definition content without persisting to database.
 * Returns validation results, estimated scenario count, and dimension coverage.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Dimension } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  validateDefinitionContent,
  validateContentStructure,
  logAuditEvent,
  createValidationAudit,
} from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:validate-definition');

/**
 * Zod schema for dimension input
 */
const DimensionSchema = z.object({
  name: z.string().min(1).describe('Dimension name'),
  values: z.array(z.string().min(1)).min(2).describe('Level values'),
  description: z.string().optional().describe('Optional description'),
});

/**
 * Zod schema for content to validate
 */
const ContentSchema = z.object({
  preamble: z.string().describe('Instructions for the AI being evaluated'),
  template: z.string().describe('Scenario body with [placeholders]'),
  dimensions: z.array(DimensionSchema).describe('Variable dimensions'),
  matching_rules: z.string().optional().describe('Optional scenario generation rules'),
});

/**
 * Input schema for validate_definition tool
 */
const ValidateDefinitionInputSchema = {
  content: ContentSchema.describe('Definition content to validate (preamble, template, dimensions)'),
};

/**
 * Format response for MCP
 */
function formatResponse(data: unknown, isError = false) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
    isError,
  };
}

/**
 * Registers the validate_definition tool on the MCP server
 */
function registerValidateDefinitionTool(server: McpServer): void {
  log.info('Registering validate_definition tool');

  server.registerTool(
    'validate_definition',
    {
      description: `Validate definition content without saving to database.

Use this tool to check content before creating/forking a definition.
Returns validation results including:
- valid: boolean indicating if content is valid
- errors: blocking issues that must be fixed
- warnings: non-blocking suggestions
- estimatedScenarioCount: how many scenarios would be generated
- dimensionCoverage: analysis of dimension combinations

This is a dry-run validation - nothing is persisted.

Validation limits:
- Max 10 dimensions
- Max 10 levels per dimension
- Max 10000 character template
- Max 1000 generated scenarios`,
      inputSchema: ValidateDefinitionInputSchema,
    },
    (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available

      log.debug({ requestId }, 'validate_definition called');

      try {
        // Step 1: Validate content structure
        const structureCheck = validateContentStructure(args.content);
        if (!structureCheck.valid) {
          log.warn({ requestId, error: structureCheck.error }, 'Content structure invalid');

          // Log audit even for structure failures
          logAuditEvent(
            createValidationAudit({
              userId,
              requestId,
              valid: false,
              errorCount: 1,
              warningCount: 0,
            })
          );

          return formatResponse({
            valid: false,
            errors: [{ field: 'content', message: structureCheck.error }],
            warnings: [],
          });
        }

        // Step 2: Run full validation
        const validation = validateDefinitionContent({
          preamble: args.content.preamble,
          template: args.content.template,
          dimensions: args.content.dimensions as Dimension[],
          matching_rules: args.content.matching_rules,
        });

        log.info(
          {
            requestId,
            valid: validation.valid,
            errorCount: validation.errors.length,
            warningCount: validation.warnings.length,
            scenarioCount: validation.estimatedScenarioCount,
          },
          'Validation completed'
        );

        // Step 3: Log audit event
        logAuditEvent(
          createValidationAudit({
            userId,
            requestId,
            valid: validation.valid,
            errorCount: validation.errors.length,
            warningCount: validation.warnings.length,
          })
        );

        // Step 4: Return validation results (no database operations)
        return formatResponse({
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
          estimatedScenarioCount: validation.estimatedScenarioCount,
          dimensionCoverage: validation.dimensionCoverage,
        });
      } catch (err) {
        log.error({ err, requestId }, 'validate_definition failed');

        return formatResponse(
          {
            valid: false,
            errors: [
              {
                field: 'content',
                message: err instanceof Error ? err.message : 'Validation failed unexpectedly',
              },
            ],
            warnings: [],
          },
          true
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerValidateDefinitionTool);

export { registerValidateDefinitionTool };
