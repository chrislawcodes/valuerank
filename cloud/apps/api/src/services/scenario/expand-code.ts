/**
 * Code-based Scenario Expansion
 *
 * Generates scenarios using combinatorial logic instead of LLM calls.
 * This is faster, deterministic, and doesn't incur LLM costs.
 */

import { createLogger } from '@valuerank/shared';

const log = createLogger('services:scenario:expand-code');

// Dimension level structure (matches definition content format)
type DimensionLevel = {
  score: number;
  label: string;
  options?: string[];
  description?: string;
};

// Dimension structure from definition content
type Dimension = {
  name: string;
  levels: DimensionLevel[];
  // Legacy format support
  values?: string[];
};

// Input content structure (matches DefinitionContent)
type DefinitionContent = {
  preamble?: string;
  template: string;
  dimensions: Dimension[];
  matching_rules?: string;
};

// Generated scenario structure (matches what expand.ts expects)
export type GeneratedScenario = {
  name: string;
  content: {
    preamble?: string;
    prompt: string;
    dimensions: Record<string, number>;
  };
};

// Result structure (matches GenerateScenariosOutput success case)
export type CodeExpansionResult = {
  success: true;
  scenarios: GeneratedScenario[];
  metadata: {
    inputTokens: number;
    outputTokens: number;
    modelVersion: string | null;
  };
  debug?: {
    rawResponse: string | null;
    extractedYaml: string | null;
    parseError: string | null;
  };
};

/**
 * Generate all combinations of dimension levels.
 * Returns array of tuples: [dimension_name, level][]
 */
function generateCombinations(dimensions: Dimension[]): Array<Array<{ name: string; level: DimensionLevel }>> {
  if (dimensions.length === 0) {
    return [[]];
  }

  const first = dimensions[0]!;
  const rest = dimensions.slice(1);
  const restCombinations = generateCombinations(rest);
  const results: Array<Array<{ name: string; level: DimensionLevel }>> = [];

  // Get levels - support both new 'levels' format and legacy 'values' format
  const levels = first.levels ?? first.values?.map((v, i) => ({
    score: i + 1,
    label: v,
    options: [v],
  })) ?? [];

  for (const level of levels) {
    for (const combo of restCombinations) {
      results.push([{ name: first.name, level }, ...combo]);
    }
  }

  return results;
}

/**
 * Replace template placeholders with dimension values.
 * Placeholders are in format [DimensionName] - matching is case-insensitive.
 */
function fillTemplate(template: string, combination: Array<{ name: string; level: DimensionLevel }>): string {
  let result = template;

  for (const { name, level } of combination) {
    // Use a random option if available, otherwise use the label
    let value: string;
    if (level.options && level.options.length > 0) {
      const randomIndex = Math.floor(Math.random() * level.options.length);
      value = level.options[randomIndex] ?? level.label;
    } else {
      value = level.label;
    }

    // Case-insensitive replacement using regex
    const placeholderRegex = new RegExp(`\\[${escapeRegex(name)}\\]`, 'gi');
    result = result.replace(placeholderRegex, value);
  }

  return result;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate a scenario name from dimension values.
 * Format: DimName1_Score1 / DimName2_Score2 / ...
 */
function generateScenarioName(combination: Array<{ name: string; level: DimensionLevel }>): string {
  return combination
    .map(({ name, level }) => `${name}_${level.score}`)
    .join(' / ');
}

/**
 * Normalize preamble - returns undefined if empty or whitespace-only.
 */
function normalizePreamble(preamble: string | undefined): string | undefined {
  if (!preamble || preamble.trim().length === 0) {
    return undefined;
  }
  return preamble;
}

/**
 * Generate scenarios using code-based combinatorial expansion.
 *
 * @param content - The definition content with template and dimensions
 * @returns Generated scenarios ready to be stored
 */
export function expandScenariosWithCode(content: DefinitionContent): CodeExpansionResult {
  log.info(
    { dimensionCount: content.dimensions?.length ?? 0 },
    'Starting code-based scenario expansion'
  );

  const dimensions = content.dimensions ?? [];

  // Generate all combinations
  const combinations = generateCombinations(dimensions);

  log.info({ combinationCount: combinations.length }, 'Generated dimension combinations');

  // Generate scenarios from combinations
  const scenarios: GeneratedScenario[] = combinations.map((combination) => {
    const prompt = fillTemplate(content.template, combination);
    const dimensionScores: Record<string, number> = {};

    for (const { name, level } of combination) {
      dimensionScores[name] = level.score;
    }

    return {
      name: generateScenarioName(combination),
      content: {
        preamble: normalizePreamble(content.preamble),
        prompt,
        dimensions: dimensionScores,
      },
    };
  });

  log.info(
    { scenarioCount: scenarios.length },
    'Code-based scenario expansion complete'
  );

  return {
    success: true,
    scenarios,
    metadata: {
      inputTokens: 0,
      outputTokens: 0,
      modelVersion: 'code-generation',
    },
    debug: {
      rawResponse: null,
      extractedYaml: null,
      parseError: null,
    },
  };
}
