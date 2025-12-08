/**
 * Import Service Types
 *
 * Type definitions for data import services.
 * Supports MD definition import from devtool format.
 */

import type { DefinitionContent } from '@valuerank/db';

// ============================================================================
// IMPORT RESULT TYPES
// ============================================================================

/**
 * Result of parsing an import file.
 * Either success with parsed data or failure with errors.
 */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ImportError[] };

/**
 * Import validation error with field context.
 */
export type ImportError = {
  field: string;
  message: string;
  line?: number;
};

// ============================================================================
// MD IMPORT TYPES
// ============================================================================

/**
 * Parsed MD definition ready for database insertion.
 */
export type ParsedMDDefinition = {
  name: string;
  content: DefinitionContent;
  category?: string;
  baseId?: string;
};

/**
 * Options for MD import operation.
 */
export type MDImportOptions = {
  /** Override the name from frontmatter */
  name?: string;
  /** Add suffix if name conflicts */
  handleConflict?: 'rename' | 'error';
};
