/**
 * MCP Validation Service
 *
 * Validates definition content before database operations.
 * Used by create_definition, fork_definition, and validate_definition tools.
 */

import type { Dimension, DefinitionContent } from '@valuerank/db';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Validation error - blocking issue that prevents saving
 */
export type ValidationError = {
  field: string;
  message: string;
};

/**
 * Validation warning - non-blocking suggestion
 */
export type ValidationWarning = {
  field: string;
  message: string;
};

/**
 * Dimension coverage analysis
 */
export type DimensionCoverage = {
  dimensions: number;
  totalCombinations: number;
  uniqueScenarios: number;
};

/**
 * Result of content validation
 */
export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  estimatedScenarioCount?: number;
  dimensionCoverage?: DimensionCoverage;
};

// ============================================================================
// CONSTANTS
// ============================================================================

export const VALIDATION_LIMITS = {
  maxDimensions: 10,
  maxLevelsPerDimension: 10,
  maxTemplateLength: 10000,
  maxScenarios: 1000,
} as const;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Gets the count of levels/values in a dimension (supports both formats).
 */
function getDimensionLevelCount(dim: Dimension): number {
  if (dim.levels && dim.levels.length > 0) {
    return dim.levels.length;
  }
  return dim.values?.length ?? 0;
}

/**
 * Calculates the number of scenarios that would be generated from dimensions.
 * Each dimension's levels multiply together.
 */
export function calculateScenarioCombinations(dimensions: Dimension[]): number {
  if (dimensions.length === 0) {
    return 0;
  }

  return dimensions.reduce((total, dim) => {
    const levelCount = getDimensionLevelCount(dim);
    return total * Math.max(levelCount, 1);
  }, 1);
}

/**
 * Extracts placeholder names from a template string.
 * Placeholders are enclosed in [square brackets].
 */
export function extractPlaceholders(template: string): string[] {
  const regex = /\[([^\]]+)\]/g;
  const placeholders: string[] = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    const placeholder = match[1];
    if (placeholder !== undefined) {
      placeholders.push(placeholder);
    }
  }

  return [...new Set(placeholders)]; // Return unique placeholders
}

/**
 * Validates definition content structure and limits.
 *
 * @param content - Definition content to validate
 * @returns Validation result with errors, warnings, and metadata
 */
export function validateDefinitionContent(
  content: Partial<DefinitionContent>
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Required field validation
  if (content.preamble === undefined || content.preamble === null) {
    errors.push({ field: 'preamble', message: 'Preamble is required' });
  }

  if (content.template === undefined || content.template === null) {
    errors.push({ field: 'template', message: 'Template is required' });
  }

  if (!Array.isArray(content.dimensions)) {
    errors.push({ field: 'dimensions', message: 'Dimensions must be an array' });
  }

  // If basic structure is invalid, return early
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const dimensions = content.dimensions!;
  const template = content.template!;

  // FR-042: max_template_length: 10000
  if (template.length > VALIDATION_LIMITS.maxTemplateLength) {
    errors.push({
      field: 'template',
      message: `Template must be ${VALIDATION_LIMITS.maxTemplateLength} characters or less (current: ${template.length})`,
    });
  }

  // FR-040: max_dimensions: 10
  if (dimensions.length > VALIDATION_LIMITS.maxDimensions) {
    errors.push({
      field: 'dimensions',
      message: `Maximum ${VALIDATION_LIMITS.maxDimensions} dimensions allowed (current: ${dimensions.length})`,
    });
  }

  // FR-041: max_levels_per_dimension: 10
  for (const dim of dimensions) {
    if (!dim.name || typeof dim.name !== 'string') {
      errors.push({
        field: `dimensions`,
        message: `Dimension must have a name`,
      });
      continue;
    }

    // Support both 'levels' (new format) and 'values' (legacy format)
    const hasLevels = Array.isArray(dim.levels) && dim.levels.length > 0;
    const hasValues = Array.isArray(dim.values) && dim.values.length > 0;

    if (!hasLevels && !hasValues) {
      errors.push({
        field: `dimensions.${dim.name}`,
        message: `Dimension '${dim.name}' must have either 'levels' (preferred) or 'values' array`,
      });
      continue;
    }

    const levelCount = getDimensionLevelCount(dim);

    if (levelCount < 2) {
      errors.push({
        field: `dimensions.${dim.name}`,
        message: `Dimension '${dim.name}' must have at least 2 levels (current: ${levelCount})`,
      });
    }

    if (levelCount > VALIDATION_LIMITS.maxLevelsPerDimension) {
      errors.push({
        field: `dimensions.${dim.name}`,
        message: `Dimension '${dim.name}' exceeds ${VALIDATION_LIMITS.maxLevelsPerDimension} levels limit (current: ${levelCount})`,
      });
    }

    // Validate level structure if using 'levels' format
    if (hasLevels && dim.levels) {
      for (const level of dim.levels) {
        if (typeof level.score !== 'number' || level.score < 1 || level.score > 5) {
          errors.push({
            field: `dimensions.${dim.name}.levels`,
            message: `Level in '${dim.name}' must have score between 1-5`,
          });
        }
        if (!level.label || typeof level.label !== 'string') {
          errors.push({
            field: `dimensions.${dim.name}.levels`,
            message: `Level in '${dim.name}' must have a label`,
          });
        }
      }
    }
  }

  // Calculate scenario count
  const scenarioCount = calculateScenarioCombinations(dimensions);

  // FR-043: max_scenarios: 1000
  if (scenarioCount > VALIDATION_LIMITS.maxScenarios) {
    errors.push({
      field: 'dimensions',
      message: `Would generate ${scenarioCount} scenarios (maximum ${VALIDATION_LIMITS.maxScenarios} allowed)`,
    });
  }

  // Check for template without placeholders
  const placeholders = extractPlaceholders(template);
  if (placeholders.length === 0) {
    warnings.push({
      field: 'template',
      message: 'Template has no [placeholders] - scenarios will be identical',
    });
  }

  // Check for unmatched placeholders (placeholders not in any dimension)
  const dimensionNames = new Set(dimensions.map((d) => d.name));
  const unmatchedPlaceholders = placeholders.filter((p) => !dimensionNames.has(p));

  if (unmatchedPlaceholders.length > 0) {
    warnings.push({
      field: 'template',
      message: `Template has placeholders not matching any dimension: [${unmatchedPlaceholders.join('], [')}]`,
    });
  }

  // Calculate dimension coverage
  const dimensionCoverage: DimensionCoverage = {
    dimensions: dimensions.length,
    totalCombinations: scenarioCount,
    uniqueScenarios: scenarioCount, // All combinations are unique
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedScenarioCount: scenarioCount,
    dimensionCoverage,
  };
}

/**
 * Validates content structure for MCP input.
 * More lenient than full validation - used for structural checks.
 */
export function validateContentStructure(
  content: unknown
): { valid: true; content: Partial<DefinitionContent> } | { valid: false; error: string } {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    return { valid: false, error: 'Content must be a JSON object' };
  }

  const obj = content as Record<string, unknown>;

  // Check required fields exist
  if (obj.preamble !== undefined && typeof obj.preamble !== 'string') {
    return { valid: false, error: 'Preamble must be a string' };
  }

  if (obj.template !== undefined && typeof obj.template !== 'string') {
    return { valid: false, error: 'Template must be a string' };
  }

  if (obj.dimensions !== undefined && !Array.isArray(obj.dimensions)) {
    return { valid: false, error: 'Dimensions must be an array' };
  }

  if (obj.matching_rules !== undefined && typeof obj.matching_rules !== 'string') {
    return { valid: false, error: 'Matching rules must be a string' };
  }

  return {
    valid: true,
    content: {
      preamble: obj.preamble,
      template: obj.template,
      dimensions: obj.dimensions,
      matching_rules: obj.matching_rules,
    } as Partial<DefinitionContent>,
  };
}
