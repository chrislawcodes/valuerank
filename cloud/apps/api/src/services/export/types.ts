/**
 * Export Service Types
 *
 * Type definitions for data export services.
 * Supports MD (definition), YAML (scenarios), and other export formats.
 */

import type { Definition, Scenario, Tag } from '@prisma/client';
import type { DefinitionContent, Dimension, DimensionLevel } from '@valuerank/db';

// ============================================================================
// EXPORT RESULT TYPES
// ============================================================================

/**
 * Result of a synchronous export operation.
 * Contains the serialized content ready for download.
 */
export type ExportResult = {
  content: string;
  filename: string;
  mimeType: string;
};

// ============================================================================
// MD FORMAT TYPES (devtool-compatible)
// ============================================================================

/**
 * MD definition format - matches devtool's ScenarioDefinition interface.
 * Used for round-trip export/import with CLI tooling.
 */
export type MDDefinition = {
  name: string;
  base_id: string;
  category: string;
  preamble?: string;
  template: string;
  dimensions: MDDimension[];
  matchingRules: string;
};

/**
 * MD dimension format with explicit score-based levels.
 */
export type MDDimension = {
  name: string;
  values: MDDimensionValue[];
};

/**
 * MD dimension value - score/label/options tuple.
 */
export type MDDimensionValue = {
  score: number;
  label: string;
  options: string[];
};

// ============================================================================
// YAML FORMAT TYPES (CLI-compatible)
// ============================================================================

/**
 * CLI-compatible YAML scenario file structure.
 * Matches the format expected by src/probe.py.
 */
export type CLIScenarioFile = {
  preamble?: string;
  scenarios: Record<string, CLIScenario>;
};

/**
 * Single scenario in CLI YAML format.
 */
export type CLIScenario = {
  base_id: string;
  category: string;
  subject: string;
  body: string;
};

// ============================================================================
// HELPER TYPES FOR CONVERSIONS
// ============================================================================

/**
 * Definition with resolved content and tags for export.
 */
export type DefinitionForExport = Definition & {
  resolvedContent: DefinitionContent;
  tags: Tag[];
};

/**
 * Scenario with content parsed for YAML export.
 */
export type ScenarioForExport = Scenario & {
  definition: Definition;
};

// Re-export for convenience
export type { DefinitionContent, Dimension, DimensionLevel };
