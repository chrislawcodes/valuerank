/**
 * Read-time JSONB schema migration utilities.
 *
 * Strategy: All JSONB content includes a schema_version field.
 * When reading, we check the version and migrate if needed.
 * This allows zero-downtime schema evolution.
 */

import type {
  DefinitionContent,
  DefinitionContentV0,
  DefinitionContentV1,
  DefinitionContentV2,
  DefinitionContentStored,
  DefinitionOverrides,
  Dimension,
  RunConfig,
  ScenarioContent,
  TranscriptContent,
  AnalysisOutput,
  RubricContent,
  CohortCriteria,
} from './types.js';

// ============================================================================
// VERSION CONSTANTS
// ============================================================================

export const CURRENT_DEFINITION_VERSION = 2;
export const CURRENT_RUN_CONFIG_VERSION = 1;
export const CURRENT_SCENARIO_VERSION = 1;
export const CURRENT_TRANSCRIPT_VERSION = 1;
export const CURRENT_ANALYSIS_VERSION = 1;
export const CURRENT_RUBRIC_VERSION = 1;
export const CURRENT_COHORT_VERSION = 1;

// ============================================================================
// DEFINITION CONTENT MIGRATIONS
// ============================================================================

function migrateDefinitionV0toV1(data: DefinitionContentV0): DefinitionContentV1 {
  return {
    schema_version: 1,
    preamble: data.preamble ?? '',
    template: data.template ?? '',
    dimensions: data.dimensions ?? [],
    matching_rules: data.matching_rules,
  };
}

/**
 * Migrate v1 content to v2 format.
 * V1 content has all fields, V2 keeps them but marks schema_version as 2.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future migration use
function migrateDefinitionV1toV2(data: DefinitionContentV1): DefinitionContentV2 {
  return {
    schema_version: 2,
    preamble: data.preamble,
    template: data.template,
    dimensions: data.dimensions,
    matching_rules: data.matching_rules,
  };
}

/**
 * Parse raw database content into a typed stored content object.
 * Does NOT resolve inheritance - use resolveDefinitionContent for that.
 * @throws Error if schema_version is unknown/unsupported
 */
export function parseStoredContent(raw: unknown): DefinitionContentStored {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Definition content must be an object');
  }

  const data = raw as Record<string, unknown>;
  const version = typeof data.schema_version === 'number' ? data.schema_version : 0;

  switch (version) {
    case 0:
      return migrateDefinitionV0toV1(data as unknown as DefinitionContentV0);
    case 1:
      return data as unknown as DefinitionContentV1;
    case 2:
      return data as unknown as DefinitionContentV2;
    default:
      throw new Error(`Unknown definition content schema version: ${version}`);
  }
}

/**
 * Load and migrate definition content to current version.
 * For root definitions or legacy data, returns full content.
 * For forked definitions with sparse content, returns stored content as-is.
 * @throws Error if schema_version is unknown/unsupported
 * @deprecated Use parseStoredContent + resolveDefinitionContent for inheritance support
 */
export function loadDefinitionContent(raw: unknown): DefinitionContent {
  const stored = parseStoredContent(raw);

  // For v1 or v2 with all fields present, return as-is
  // This maintains backward compatibility
  if (stored.schema_version === 1) {
    return stored;
  }

  // For v2, if all fields are present, return as resolved
  if (
    stored.preamble !== undefined &&
    stored.template !== undefined &&
    stored.dimensions !== undefined
  ) {
    return {
      schema_version: stored.schema_version,
      preamble: stored.preamble,
      template: stored.template,
      dimensions: stored.dimensions,
      matching_rules: stored.matching_rules,
    };
  }

  // V2 with missing fields - return with empty defaults
  // (This shouldn't happen for root definitions, but provides fallback)
  return {
    schema_version: stored.schema_version,
    preamble: stored.preamble ?? '',
    template: stored.template ?? '',
    dimensions: stored.dimensions ?? [],
    matching_rules: stored.matching_rules,
  };
}

/**
 * Create sparse v2 content for a forked definition.
 * All fields are undefined (inherits everything from parent).
 */
export function createInheritingContent(): DefinitionContentV2 {
  return {
    schema_version: 2,
    // All fields undefined = inherit from parent
  };
}

/**
 * Create v2 content with specific overrides.
 * Only the provided fields will be stored; others inherit from parent.
 */
export function createPartialContent(overrides: {
  preamble?: string;
  template?: string;
  dimensions?: Dimension[];
  matching_rules?: string;
}): DefinitionContentV2 {
  return {
    schema_version: 2,
    ...overrides,
  };
}

/**
 * Determine which fields are locally overridden (not inherited).
 */
export function getContentOverrides(content: DefinitionContentStored): DefinitionOverrides {
  if (content.schema_version === 1) {
    // V1 content always has all fields (no inheritance)
    return {
      preamble: true,
      template: true,
      dimensions: true,
      matching_rules: content.matching_rules !== undefined,
    };
  }

  // V2: check which fields are present
  return {
    preamble: content.preamble !== undefined,
    template: content.template !== undefined,
    dimensions: content.dimensions !== undefined,
    matching_rules: content.matching_rules !== undefined,
  };
}

/**
 * Resolve content by merging with parent content.
 * Parent content must already be fully resolved.
 * Child content overrides parent where fields are present.
 */
export function mergeContent(
  child: DefinitionContentStored,
  parent: DefinitionContent
): DefinitionContent {
  // V1 content is always complete, no merging needed
  if (child.schema_version === 1) {
    return child;
  }

  // V2: merge with parent, child overrides parent
  return {
    schema_version: 2,
    preamble: child.preamble ?? parent.preamble,
    template: child.template ?? parent.template,
    dimensions: child.dimensions ?? parent.dimensions,
    matching_rules: child.matching_rules ?? parent.matching_rules,
  };
}

// ============================================================================
// RUN CONFIG MIGRATIONS
// ============================================================================

/**
 * Load and migrate run config to current version.
 */
export function loadRunConfig(raw: unknown): RunConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Run config must be an object');
  }

  const data = raw as Record<string, unknown>;
  const version = typeof data.schema_version === 'number' ? data.schema_version : 0;

  switch (version) {
    case 0:
      // V0 had no schema_version, add it
      return {
        schema_version: 1,
        models: Array.isArray(data.models) ? data.models as string[] : [],
        temperature: typeof data.temperature === 'number' ? data.temperature : undefined,
        sample_percentage: typeof data.sample_percentage === 'number' ? data.sample_percentage : undefined,
      };
    case 1:
      return data as unknown as RunConfig;
    default:
      throw new Error(`Unknown run config schema version: ${version}`);
  }
}

// ============================================================================
// SCENARIO CONTENT MIGRATIONS
// ============================================================================

/**
 * Load and migrate scenario content to current version.
 */
export function loadScenarioContent(raw: unknown): ScenarioContent {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Scenario content must be an object');
  }

  const data = raw as Record<string, unknown>;
  const version = typeof data.schema_version === 'number' ? data.schema_version : 0;

  switch (version) {
    case 0:
      return {
        schema_version: 1,
        prompt: typeof data.prompt === 'string' ? data.prompt : '',
        dimension_values: (data.dimension_values ?? {}) as Record<string, string>,
        expected_values: Array.isArray(data.expected_values) ? data.expected_values as string[] : undefined,
      };
    case 1:
      return data as unknown as ScenarioContent;
    default:
      throw new Error(`Unknown scenario content schema version: ${version}`);
  }
}

// ============================================================================
// TRANSCRIPT CONTENT MIGRATIONS
// ============================================================================

/**
 * Load and migrate transcript content to current version.
 */
export function loadTranscriptContent(raw: unknown): TranscriptContent {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Transcript content must be an object');
  }

  const data = raw as Record<string, unknown>;
  const version = typeof data.schema_version === 'number' ? data.schema_version : 0;

  switch (version) {
    case 0:
      return {
        schema_version: 1,
        messages: Array.isArray(data.messages) ? data.messages as TranscriptContent['messages'] : [],
        model_response: typeof data.model_response === 'string' ? data.model_response : undefined,
        raw_output: typeof data.raw_output === 'string' ? data.raw_output : undefined,
      };
    case 1:
      return data as unknown as TranscriptContent;
    default:
      throw new Error(`Unknown transcript content schema version: ${version}`);
  }
}

// ============================================================================
// ANALYSIS OUTPUT MIGRATIONS
// ============================================================================

/**
 * Load and migrate analysis output to current version.
 */
export function loadAnalysisOutput(raw: unknown): AnalysisOutput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Analysis output must be an object');
  }

  const data = raw as Record<string, unknown>;
  const version = typeof data.schema_version === 'number' ? data.schema_version : 0;

  switch (version) {
    case 0:
      return {
        schema_version: 1,
        results: (data.results ?? data) as Record<string, unknown>,
        summary: typeof data.summary === 'string' ? data.summary : undefined,
      };
    case 1:
      return data as unknown as AnalysisOutput;
    default:
      throw new Error(`Unknown analysis output schema version: ${version}`);
  }
}

// ============================================================================
// RUBRIC CONTENT MIGRATIONS
// ============================================================================

/**
 * Load and migrate rubric content to current version.
 */
export function loadRubricContent(raw: unknown): RubricContent {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Rubric content must be an object');
  }

  const data = raw as Record<string, unknown>;
  const version = typeof data.schema_version === 'number' ? data.schema_version : 0;

  switch (version) {
    case 0:
      return {
        schema_version: 1,
        values: Array.isArray(data.values) ? data.values as RubricContent['values'] : [],
      };
    case 1:
      return data as unknown as RubricContent;
    default:
      throw new Error(`Unknown rubric content schema version: ${version}`);
  }
}

// ============================================================================
// COHORT CRITERIA MIGRATIONS
// ============================================================================

/**
 * Load and migrate cohort criteria to current version.
 */
export function loadCohortCriteria(raw: unknown): CohortCriteria {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Cohort criteria must be an object');
  }

  const data = raw as Record<string, unknown>;
  const version = typeof data.schema_version === 'number' ? data.schema_version : 0;

  switch (version) {
    case 0:
      return {
        schema_version: 1,
        filters: Array.isArray(data.filters) ? data.filters as CohortCriteria['filters'] : [],
      };
    case 1:
      return data as unknown as CohortCriteria;
    default:
      throw new Error(`Unknown cohort criteria schema version: ${version}`);
  }
}
