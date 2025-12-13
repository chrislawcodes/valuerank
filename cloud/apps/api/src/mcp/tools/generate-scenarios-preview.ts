/**
 * generate_scenarios_preview MCP Tool
 *
 * Previews scenarios that would be generated from a definition.
 * Does NOT call LLM or persist to database - purely in-memory calculation.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db, type DefinitionContent, type Dimension } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { calculateScenarioCombinations } from '../../services/mcp/validation.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:generate-scenarios-preview');

/**
 * Input schema for generate_scenarios_preview tool
 */
const GenerateScenariosPreviewInputSchema = {
  definition_id: z.string().min(1).describe('ID of the definition to preview'),
  max_scenarios: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe('Maximum scenarios to return (1-10, default 5)'),
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
 * Represents a scenario preview with dimension values
 */
type ScenarioPreview = {
  name: string;
  dimension_values: Record<string, string>;
  body_preview: string;
};

/**
 * Generate all combinations of dimension values.
 * Returns array of { dimensionName: value } objects.
 */
function generateDimensionCombinations(
  dimensions: Dimension[]
): Array<Record<string, string>> {
  if (dimensions.length === 0) {
    return [{}];
  }

  const result: Array<Record<string, string>> = [];

  function recurse(index: number, current: Record<string, string>): void {
    if (index >= dimensions.length) {
      result.push({ ...current });
      return;
    }

    const dim = dimensions[index];
    if (!dim) {
      // Safety check for TypeScript strict mode
      recurse(index + 1, current);
      return;
    }

    const values = dim.values ?? [];

    if (values.length === 0) {
      // Skip dimensions with no values
      recurse(index + 1, current);
      return;
    }

    for (const value of values) {
      current[dim.name] = value;
      recurse(index + 1, current);
    }
    delete current[dim.name];
  }

  recurse(0, {});
  return result;
}

/**
 * Replace placeholders in template with dimension values.
 * Placeholders are in [bracket] format.
 */
function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [name, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\[${name}\\]`, 'g'), value);
  }
  return result;
}

/**
 * Generate a scenario name from dimension values.
 */
function generateScenarioName(values: Record<string, string>): string {
  const parts = Object.entries(values).map(([dim, val]) => `${dim}:${val}`);
  return parts.join(' / ') || 'Default Scenario';
}

/**
 * Registers the generate_scenarios_preview tool on the MCP server
 */
function registerGenerateScenariosPreviewTool(server: McpServer): void {
  log.info('Registering generate_scenarios_preview tool');

  server.registerTool(
    'generate_scenarios_preview',
    {
      description: `Preview scenarios that would be generated from a definition.

Returns the total scenario count, a sample of scenario previews, and the first scenario's full body.

This is a DRY RUN - it does not generate actual scenarios or call any LLM.
Use this to understand what scenarios would be created before starting a run.

The preview shows how placeholders in the template are filled with dimension values.

Also includes:
- actual_scenario_count: Number of scenarios actually generated (vs expected count)
- expansion_debug: Debug info from last expansion (raw LLM response, parse errors)

Example response:
{
  "scenario_count": 12,
  "actual_scenario_count": 12,
  "scenarios": [
    {
      "name": "severity:low / urgency:now",
      "dimension_values": {"severity": "low", "urgency": "now"},
      "body_preview": "A low severity situation requiring immediate action..."
    }
  ],
  "sample_body": "Full text of first scenario...",
  "expansion_debug": {
    "rawResponse": "...",
    "extractedYaml": "...",
    "parseError": null
  }
}`,
      inputSchema: GenerateScenariosPreviewInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());

      log.debug(
        {
          definitionId: args.definition_id,
          maxScenarios: args.max_scenarios,
          requestId,
        },
        'generate_scenarios_preview called'
      );

      try {
        // Step 1: Fetch definition
        const definition = await db.definition.findUnique({
          where: { id: args.definition_id },
        });

        if (!definition) {
          log.warn(
            { requestId, definitionId: args.definition_id },
            'Definition not found'
          );
          return formatError(
            'NOT_FOUND',
            `Definition not found: ${args.definition_id}`
          );
        }

        if (definition.deletedAt !== null) {
          log.warn(
            { requestId, definitionId: args.definition_id },
            'Definition is soft-deleted'
          );
          return formatError(
            'NOT_FOUND',
            `Definition not found: ${args.definition_id}`
          );
        }

        // Step 2: Extract content
        const content = definition.content as DefinitionContent | null;

        if (!content) {
          return formatError(
            'VALIDATION_ERROR',
            'Definition has no content'
          );
        }

        const dimensions = content.dimensions ?? [];
        const template = content.template ?? '';
        const preamble = content.preamble ?? '';

        // Step 3: Calculate total scenario count
        const scenarioCount = calculateScenarioCombinations(dimensions);

        // Step 4: Generate all combinations (in memory)
        const allCombinations = generateDimensionCombinations(dimensions);

        // Step 5: Take sample of combinations
        const sampleSize = Math.min(args.max_scenarios ?? 5, allCombinations.length);
        const sampleCombinations = allCombinations.slice(0, sampleSize);

        // Step 6: Generate preview for each sample
        const scenarios: ScenarioPreview[] = sampleCombinations.map((values) => {
          const filledTemplate = fillTemplate(template, values);
          return {
            name: generateScenarioName(values),
            dimension_values: values,
            body_preview:
              filledTemplate.length > 200
                ? filledTemplate.slice(0, 200) + '...'
                : filledTemplate,
          };
        });

        // Step 7: Generate first scenario's full body
        const firstCombination = allCombinations[0] ?? {};
        const sampleBody = preamble
          ? `${preamble}\n\n${fillTemplate(template, firstCombination)}`
          : fillTemplate(template, firstCombination);

        log.info(
          {
            requestId,
            definitionId: args.definition_id,
            scenarioCount,
            sampleCount: scenarios.length,
          },
          'Preview generated successfully'
        );

        // Step 8: Get actual scenario count from database
        const actualScenarioCount = await db.scenario.count({
          where: { definitionId: args.definition_id, deletedAt: null },
        });

        // Step 9: Return preview with expansion debug info
        return formatSuccess({
          definition_id: args.definition_id,
          definition_name: definition.name,
          scenario_count: scenarioCount,
          actual_scenario_count: actualScenarioCount,
          scenarios,
          sample_body: sampleBody,
          dimensions: dimensions.map((d) => ({
            name: d.name,
            value_count: d.values?.length ?? 0,
            values: d.values ?? [],
          })),
          // Include expansion debug info if available (for diagnosing expansion failures)
          expansion_debug: definition.expansionDebug ?? null,
        });
      } catch (err) {
        log.error({ err, requestId }, 'generate_scenarios_preview failed');

        if (err instanceof NotFoundError) {
          return formatError('NOT_FOUND', err.message);
        }

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to generate preview'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerGenerateScenariosPreviewTool);

export { registerGenerateScenariosPreviewTool };
