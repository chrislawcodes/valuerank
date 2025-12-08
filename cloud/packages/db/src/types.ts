/**
 * JSONB content types for database fields.
 * All types include schema_version for read-time migration.
 */

// ============================================================================
// DEFINITION CONTENT
// ============================================================================

/**
 * A level within a dimension representing an intensity of value stakes.
 */
export type DimensionLevel = {
  score: number; // 1-5 intensity scale
  label: string; // Short description
  options?: string[]; // Alternative phrasings for random selection
  description?: string; // Optional longer description
};

/**
 * A dimension represents a VALUE being tested with multiple intensity levels.
 * Named after one of the 14 canonical values.
 */
export type Dimension = {
  name: string;
  // New format: structured levels with scores
  levels?: DimensionLevel[];
  // Legacy format: simple string array (for backward compatibility)
  values?: string[];
  description?: string;
};

/**
 * Schema v1: All fields are required (root definitions or legacy).
 * This is also the "resolved" content type after inheritance is applied.
 */
export type DefinitionContentV1 = {
  schema_version: 1;
  preamble: string;
  template: string;
  dimensions: Dimension[];
  matching_rules?: string;
};

/**
 * Schema v2: Sparse storage for forked definitions.
 * Fields are optional - undefined/missing = inherit from parent.
 * Root definitions should still have all fields present.
 */
export type DefinitionContentV2 = {
  schema_version: 2;
  preamble?: string;
  template?: string;
  dimensions?: Dimension[];
  matching_rules?: string;
};

/**
 * Union type for all stored content versions.
 * Used when reading raw content from database.
 */
export type DefinitionContentStored = DefinitionContentV1 | DefinitionContentV2;

/**
 * Resolved content after inheritance chain is applied.
 * All fields are guaranteed to be present.
 * This is the type consumers should use.
 */
export type DefinitionContent = {
  schema_version: 1 | 2;
  preamble: string;
  template: string;
  dimensions: Dimension[];
  matching_rules?: string;
};

/**
 * Indicates which fields are locally overridden vs inherited.
 * Used by UI to show inheritance indicators.
 */
export type DefinitionOverrides = {
  preamble: boolean;
  template: boolean;
  dimensions: boolean;
  matching_rules: boolean;
};

export type DefinitionContentV0 = {
  preamble: string;
  template: string;
  dimensions: Dimension[];
  matching_rules?: string;
};

// ============================================================================
// RUN CONFIG & PROGRESS
// ============================================================================

export type RunConfig = {
  schema_version: 1;
  models: string[];
  temperature?: number;
  sample_percentage?: number;
};

export type RunProgress = {
  total: number;
  completed: number;
  failed: number;
};

// ============================================================================
// SCENARIO CONTENT
// ============================================================================

export type ScenarioContent = {
  schema_version: 1;
  prompt: string;
  dimension_values: Record<string, string>;
  expected_values?: string[];
};

// ============================================================================
// TRANSCRIPT CONTENT
// ============================================================================

export type TranscriptMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
};

export type TranscriptContent = {
  schema_version: 1;
  messages: TranscriptMessage[];
  model_response?: string;
  raw_output?: string;
};

// ============================================================================
// ANALYSIS TYPES
// ============================================================================

export type AnalysisPlan = {
  schema_version: 1;
  test: string;
  alpha: number;
  correction?: string;
};

export type AnalysisOutput = {
  schema_version: 1;
  results: Record<string, unknown>;
  summary?: string;
  confidence_intervals?: Record<string, { lower: number; upper: number }>;
};

// ============================================================================
// COMPARISON DELTA
// ============================================================================

export type DeltaData = {
  schema_version: 1;
  value_differences: Record<string, { baseline: number; comparison: number; delta: number }>;
  statistical_tests?: Record<string, { p_value: number; significant: boolean }>;
};

// ============================================================================
// RUBRIC CONTENT
// ============================================================================

export type RubricValue = {
  name: string;
  definition: string;
  examples?: string[];
};

export type RubricContent = {
  schema_version: 1;
  values: RubricValue[];
};

// ============================================================================
// COHORT CRITERIA
// ============================================================================

export type CohortCriteria = {
  schema_version: 1;
  filters: Array<{
    field: string;
    operator: 'eq' | 'ne' | 'in' | 'contains' | 'gt' | 'lt';
    value: unknown;
  }>;
};
