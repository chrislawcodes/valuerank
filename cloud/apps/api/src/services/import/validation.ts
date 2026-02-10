/**
 * Import Validation Service
 *
 * Database-level validation for imported definitions.
 * Checks for conflicts, duplicates, and other business rules.
 */

import { db } from '@valuerank/db';
import type { DefinitionContent } from '@valuerank/db';
import type { ImportError } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

export type ValidationResult = {
  valid: boolean;
  errors: ImportError[];
  suggestions?: {
    alternativeName?: string;
  };
};

// ============================================================================
// NAME VALIDATION
// ============================================================================

/**
 * Check if a definition name already exists.
 */
export async function checkNameConflict(name: string): Promise<{
  exists: boolean;
  existingId?: string;
}> {
  const existing = await db.definition.findFirst({
    where: {
      name,
      deletedAt: null,
    },
    select: { id: true },
  });

  return {
    exists: existing !== null,
    existingId: existing?.id,
  };
}

/**
 * Generate an alternative name by appending a suffix.
 */
export function generateAlternativeName(baseName: string): string {
  const timestamp = Date.now().toString(36).slice(-4);
  return `${baseName}-${timestamp}`;
}

// ============================================================================
// CONTENT VALIDATION
// ============================================================================

/**
 * Validate imported definition content matches schema requirements.
 * This is a lighter validation than the full MCP validation.
 */
export function validateImportedContent(content: DefinitionContent): ImportError[] {
  const errors: ImportError[] = [];

  // Check preamble
  // Check preamble (optional)
  if (content.preamble !== undefined && typeof content.preamble !== 'string') {
    errors.push({
      field: 'content.preamble',
      message: 'Preamble must be a string if provided',
    });
  }

  // Check template
  if (!content.template || typeof content.template !== 'string') {
    errors.push({
      field: 'content.template',
      message: 'Template must be a non-empty string',
    });
  }

  // Check dimensions array
  if (!Array.isArray(content.dimensions)) {
    errors.push({
      field: 'content.dimensions',
      message: 'Dimensions must be an array',
    });
  } else {
    // Validate each dimension
    for (let i = 0; i < content.dimensions.length; i++) {
      const dim = content.dimensions[i];
      if (!dim) continue;

      if (!dim.name || typeof dim.name !== 'string') {
        errors.push({
          field: `content.dimensions[${i}].name`,
          message: `Dimension ${i + 1} must have a name`,
        });
      }

      // Check for levels (new format) or values (legacy format)
      const hasLevels = Array.isArray(dim.levels) && dim.levels.length > 0;
      const hasValues = Array.isArray(dim.values) && dim.values.length > 0;

      if (!hasLevels && !hasValues) {
        errors.push({
          field: `content.dimensions[${i}]`,
          message: `Dimension '${dim.name || i + 1}' must have levels or values`,
        });
      }
    }
  }

  return errors;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Validate an imported definition before saving.
 *
 * @param name - Proposed definition name
 * @param content - Parsed definition content
 * @param options - Validation options
 * @returns ValidationResult with errors and suggestions
 */
export async function validateImport(
  name: string,
  content: DefinitionContent,
  options: { checkNameConflict?: boolean } = { checkNameConflict: true }
): Promise<ValidationResult> {
  const errors: ImportError[] = [];
  const suggestions: ValidationResult['suggestions'] = {};

  // Validate name
  if (!name || name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Definition name is required',
    });
  }

  // Check for name conflict
  if (options.checkNameConflict === true && name !== '') {
    const conflict = await checkNameConflict(name);
    if (conflict.exists) {
      errors.push({
        field: 'name',
        message: `A definition named '${name}' already exists`,
      });
      suggestions.alternativeName = generateAlternativeName(name);
    }
  }

  // Validate content
  const contentErrors = validateImportedContent(content);
  errors.push(...contentErrors);

  return {
    valid: errors.length === 0,
    errors,
    suggestions: Object.keys(suggestions).length > 0 ? suggestions : undefined,
  };
}
