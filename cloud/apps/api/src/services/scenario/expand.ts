/**
 * Scenario Expansion Service
 *
 * Generates scenarios from a definition using LLM-based generation.
 * Matches the devtool approach: builds a prompt, calls LLM, parses YAML output.
 */

import { db, type DefinitionContent } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { parse as parseYaml } from 'yaml';
import { callLLM, extractYaml } from '../llm/generate.js';

const log = createLogger('services:scenario:expand');

// Scenario content structure (matches what probe worker expects)
type ScenarioContent = {
  preamble?: string;
  prompt: string;
  followups?: Array<{ label: string; prompt: string }>;
  // Dimension scores (1-5) for each dimension name
  dimensions: Record<string, number>;
};

// Frontend stores dimensions with levels (score, label, options)
type StoredDimensionLevel = {
  score: number;
  label: string;
  description?: string;
  options?: string[];
};

type StoredDimension = {
  name: string;
  // Frontend format with levels
  levels?: StoredDimensionLevel[];
  // DB schema format with values
  values?: string[];
  description?: string;
};

// LLM-generated scenario from YAML
type GeneratedScenario = {
  base_id?: string;
  category?: string;
  subject?: string;
  body: string;
};

// Parsed YAML structure from LLM
type GeneratedYaml = {
  preamble?: string;
  scenarios: Record<string, GeneratedScenario>;
};

export type ExpandScenariosResult = {
  created: number;
  deleted: number;
};

/**
 * Extract dimension values for prompt building.
 * Returns array of {score, label, options} for each dimension.
 */
function extractDimensionValues(
  dim: StoredDimension
): Array<{ score: number; label: string; options: string[] }> {
  // Frontend format with levels
  if (dim.levels && dim.levels.length > 0) {
    return dim.levels.map((level) => ({
      score: level.score,
      label: level.label,
      options: level.options ?? [level.label],
    }));
  }

  // DB schema format with just values (assign incremental scores)
  if (dim.values && dim.values.length > 0) {
    return dim.values.map((value, i) => ({
      score: i + 1,
      label: value,
      options: [value],
    }));
  }

  return [];
}

/**
 * Build the LLM prompt for scenario generation.
 * Matches the devtool's buildGenerationPrompt approach.
 */
function buildGenerationPrompt(
  content: DefinitionContent,
  dimensions: StoredDimension[]
): string {
  const dimensionDefs = dimensions
    .map((dim) => {
      const values = extractDimensionValues(dim);
      const valueLines = values
        .map((v) => `  Score ${v.score} (${v.label}): ${v.options.join(', ')}`)
        .join('\n');
      return `${dim.name}:\n${valueLines}`;
    })
    .join('\n\n');

  const placeholders = dimensions.map((d) => `[${d.name}]`).join(', ');
  const baseId = 'scenario';
  const category = dimensions.map((d) => d.name).join('_vs_');

  return `You are a scenario generator for a moral values research project. Generate a YAML file with all valid combinations of the following dimensions.

## Preamble (use exactly):
${content.preamble || ''}

## Scenario Template:
The template uses these placeholders: ${placeholders}
Each placeholder should be replaced with an option from the corresponding dimension score.

Template:
${content.template}

## Dimensions and Scores:
${dimensionDefs}

${content.matching_rules ? `## Matching Rules:\n${content.matching_rules}` : ''}

## Output Format:
Generate valid YAML with this structure:
\`\`\`yaml
preamble: >
  [the preamble text]

scenarios:
  ${baseId}_[Dim1Score]_[Dim2Score]_...:
    base_id: ${baseId}
    category: ${category}
    subject: [descriptive title with scores]
    body: |
      [filled template with natural grammar]
\`\`\`

Generate ALL valid combinations. For each combination:
1. Pick a random option from each dimension's score level
2. Replace placeholders in the template
3. Smooth the grammar so sentences flow naturally
4. Use the naming convention: ${baseId}_[Dim1Name][Score]_[Dim2Name][Score]_...

${content.matching_rules ? 'Skip combinations that violate the matching rules.' : ''}

Output ONLY the YAML, no explanations.`;
}

/**
 * Parse the LLM-generated YAML into scenario data.
 */
function parseGeneratedScenarios(yamlContent: string): GeneratedYaml | null {
  try {
    const parsed = parseYaml(yamlContent) as GeneratedYaml;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch (err) {
    log.error({ err }, 'Failed to parse generated YAML');
    return null;
  }
}

/**
 * Expands scenarios from a definition's content using LLM generation.
 *
 * - Deletes existing scenarios for the definition (soft delete)
 * - Calls LLM to generate scenario combinations
 * - Parses YAML output and creates scenario records
 *
 * @param definitionId - The definition ID
 * @param content - The resolved definition content with template and dimensions
 * @returns Count of created and deleted scenarios
 */
export async function expandScenarios(
  definitionId: string,
  content: DefinitionContent
): Promise<ExpandScenariosResult> {
  log.info({ definitionId }, 'Expanding scenarios with LLM');

  // Cast dimensions to our flexible type that handles both formats
  const rawDimensions = content.dimensions as unknown as StoredDimension[] | undefined;

  log.info(
    { definitionId, hasDimensions: !!rawDimensions, dimensionCount: rawDimensions?.length, hasTemplate: !!content.template },
    'Expansion input check'
  );

  // Soft delete existing scenarios first
  const deleteResult = await db.scenario.updateMany({
    where: { definitionId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  // If no dimensions or empty template, create a single default scenario
  if (!rawDimensions || rawDimensions.length === 0 || !content.template) {
    log.debug({ definitionId }, 'No dimensions or template, creating single scenario');

    const scenarioContent: ScenarioContent = {
      preamble: content.preamble || undefined,
      prompt: content.template || '',
      dimensions: {},
    };

    await db.scenario.create({
      data: {
        definitionId,
        name: 'Default Scenario',
        content: scenarioContent,
      },
    });

    return { created: 1, deleted: deleteResult.count };
  }

  // Filter to dimensions that have values
  const dimensionsWithValues = rawDimensions.filter((dim) => {
    const values = extractDimensionValues(dim);
    return values.length > 0;
  });

  log.info(
    { definitionId, dimensionsWithValues: dimensionsWithValues.length, dimNames: dimensionsWithValues.map(d => d.name) },
    'Dimensions with values'
  );

  if (dimensionsWithValues.length === 0) {
    log.debug({ definitionId }, 'Dimensions have no values, creating single scenario');

    const scenarioContent: ScenarioContent = {
      preamble: content.preamble || undefined,
      prompt: content.template,
      dimensions: {},
    };

    await db.scenario.create({
      data: {
        definitionId,
        name: 'Default Scenario',
        content: scenarioContent,
      },
    });

    return { created: 1, deleted: deleteResult.count };
  }

  // Build prompt and call LLM
  const prompt = buildGenerationPrompt(content, dimensionsWithValues);
  log.debug({ definitionId, promptLength: prompt.length }, 'Built generation prompt');

  try {
    const llmResult = await callLLM(prompt, {
      temperature: 0.7,
      maxTokens: 64000, // Max for claude-sonnet-4
      timeoutMs: 300000, // 5 minutes - scenario expansion can take longer
    });

    log.info(
      { definitionId, responseLength: llmResult.length, preview: llmResult.slice(0, 200) },
      'LLM response received'
    );

    // Extract and parse YAML
    const yamlContent = extractYaml(llmResult);
    log.info(
      { definitionId, yamlLength: yamlContent.length, yamlPreview: yamlContent.slice(0, 300) },
      'Extracted YAML from LLM response'
    );

    const parsed = parseGeneratedScenarios(yamlContent);

    if (!parsed || !parsed.scenarios) {
      log.error(
        { definitionId, hasParsed: !!parsed, hasScenarios: !!(parsed?.scenarios), yamlContent: yamlContent.slice(0, 500) },
        'Failed to parse LLM-generated scenarios'
      );

      // Fallback: create single scenario with raw template
      const scenarioContent: ScenarioContent = {
        preamble: content.preamble || undefined,
        prompt: content.template,
        dimensions: {},
      };

      await db.scenario.create({
        data: {
          definitionId,
          name: 'Default Scenario',
          content: scenarioContent,
        },
      });

      return { created: 1, deleted: deleteResult.count };
    }

    // Create scenario records from parsed YAML
    const scenarioEntries = Object.entries(parsed.scenarios);
    const preamble = parsed.preamble || content.preamble || '';

    const scenarioData = scenarioEntries.map(([scenarioKey, scenario]) => {
      // Extract dimension scores from the scenario key (e.g., scenario_Stakes1_Certainty2)
      const dimensionScores: Record<string, number> = {};

      // Parse dimension scores from key like "scenario_Stakes1_Certainty2"
      for (const dim of dimensionsWithValues) {
        const dimValues = extractDimensionValues(dim);
        // Find which score level was used based on key pattern
        for (const level of dimValues) {
          if (scenarioKey.includes(`${dim.name}${level.score}`)) {
            dimensionScores[dim.name] = level.score;
            break;
          }
        }
      }

      const scenarioContent: ScenarioContent = {
        preamble: preamble || undefined,
        prompt: scenario.body,
        dimensions: dimensionScores,
      };

      return {
        definitionId,
        name: scenario.subject || scenarioKey,
        content: scenarioContent,
      };
    });

    // Create scenarios in batch
    await db.scenario.createMany({ data: scenarioData });

    log.info(
      { definitionId, created: scenarioData.length, deleted: deleteResult.count },
      'Scenarios expanded via LLM'
    );

    return { created: scenarioData.length, deleted: deleteResult.count };
  } catch (err) {
    log.error({ err, definitionId, errorMessage: err instanceof Error ? err.message : String(err) }, 'LLM scenario expansion failed');

    // Fallback: create single scenario with raw template
    const scenarioContent: ScenarioContent = {
      preamble: content.preamble || undefined,
      prompt: content.template,
      dimensions: {},
    };

    await db.scenario.create({
      data: {
        definitionId,
        name: 'Default Scenario',
        content: scenarioContent,
      },
    });

    return { created: 1, deleted: deleteResult.count };
  }
}
