/**
 * YAML Scenario Serializer
 *
 * Exports scenarios to CLI-compatible YAML format.
 * Output matches the format expected by src/probe.py.
 */

import { stringify } from 'yaml';
import type { Definition, Scenario, Tag } from '@prisma/client';
import type { DefinitionContent, ScenarioContent } from '@valuerank/db';
import type { CLIScenarioFile, CLIScenario, ExportResult } from './types.js';

// ============================================================================
// TYPE HELPERS
// ============================================================================

/**
 * Scenario with content and definition info for export.
 */
type ScenarioWithDefinition = Scenario & {
  definition: Definition;
};

// ============================================================================
// SCENARIO CONVERSION
// ============================================================================

/**
 * Convert a cloud scenario to CLI format.
 */
function scenarioToCLI(
  scenario: ScenarioWithDefinition,
  definitionContent: DefinitionContent,
  category: string
): CLIScenario {
  const content = scenario.content as ScenarioContent;

  // Generate base_id from definition name
  const baseId = `scenario_${scenario.definition.name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toLowerCase()
    .slice(0, 30)}`;

  // Build subject from scenario name or dimension values
  let subject = scenario.name;
  if ((subject === null || subject === '') && content.dimension_values !== null && content.dimension_values !== undefined) {
    const parts: string[] = [];
    for (const [dim, val] of Object.entries(content.dimension_values)) {
      parts.push(`${dim}=${val}`);
    }
    subject = parts.join(', ');
  }

  return {
    base_id: baseId,
    category,
    subject: subject || 'Scenario',
    body: content.prompt,
  };
}

/**
 * Generate category string from definition tags or dimension names.
 */
function generateCategory(
  tags: Tag[],
  dimensions: DefinitionContent['dimensions']
): string {
  // Prefer first tag name
  if (tags.length > 0 && tags[0]) {
    return tags[0].name;
  }

  // Fall back to dimension names joined with _vs_
  if (dimensions.length > 0) {
    return dimensions.map(d => d.name).join('_vs_');
  }

  return 'Uncategorized';
}

// ============================================================================
// YAML SERIALIZATION
// ============================================================================

/**
 * Serialize scenarios to CLI-compatible YAML.
 *
 * @param definition - The definition entity
 * @param content - Resolved definition content
 * @param scenarios - Scenarios to include
 * @param tags - Definition tags (for category)
 * @returns YAML string in CLI format
 */
export function serializeScenariosToYaml(
  definition: Definition,
  content: DefinitionContent,
  scenarios: ScenarioWithDefinition[],
  tags: Tag[]
): string {
  const category = generateCategory(tags, content.dimensions);

  // Build scenarios map
  const scenariosMap: Record<string, CLIScenario> = {};
  for (const scenario of scenarios) {
    const cliScenario = scenarioToCLI(scenario, content, category);
    // Use scenario name as key, sanitized for YAML
    const key = scenario.name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_');
    scenariosMap[key] = cliScenario;
  }

  const yamlData: CLIScenarioFile = {
    ...(content.preamble !== undefined && content.preamble !== '' ? { preamble: content.preamble } : {}),
    scenarios: scenariosMap,
  };

  // Serialize with block scalar style for preamble and body
  return stringify(yamlData, {
    lineWidth: 0, // Don't wrap lines
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
    blockQuote: 'literal', // Use | for multi-line strings
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Export definition scenarios to CLI-compatible YAML format.
 *
 * @param definition - The definition entity
 * @param content - Resolved definition content
 * @param scenarios - Scenarios to export
 * @param tags - Definition tags
 * @returns ExportResult with YAML content
 * @throws Error if no scenarios provided
 */
export function exportScenariosAsYaml(
  definition: Definition,
  content: DefinitionContent,
  scenarios: ScenarioWithDefinition[],
  tags: Tag[]
): ExportResult {
  if (scenarios.length === 0) {
    throw new Error(
      'No scenarios to export. Generate scenarios first using the definition.'
    );
  }

  const yamlContent = serializeScenariosToYaml(definition, content, scenarios, tags);

  // Generate filename from definition name
  const safeName = definition.name
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);

  return {
    content: yamlContent,
    filename: `${safeName}.scenarios.yaml`,
    mimeType: 'application/x-yaml',
  };
}

/**
 * Generate filename for YAML export.
 */
export function generateYamlFilename(definitionName: string): string {
  const safeName = definitionName
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);
  return `${safeName}.scenarios.yaml`;
}
