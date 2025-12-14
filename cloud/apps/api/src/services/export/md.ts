/**
 * Markdown Definition Serializer
 *
 * Exports definitions to devtool-compatible markdown format.
 * Port of devtool/src/server/utils/scenarioMd.ts with cloud type mapping.
 */

import type { Definition, Tag } from '@prisma/client';
import type { DefinitionContent, Dimension } from '@valuerank/db';
import type { MDDefinition, MDDimension, MDDimensionValue, ExportResult } from './types.js';

// ============================================================================
// TYPE CONVERSION
// ============================================================================

/**
 * Convert cloud Dimension to MD format.
 */
function dimensionToMD(dim: Dimension): MDDimension {
  const values: MDDimensionValue[] = [];

  if (dim.levels && dim.levels.length > 0) {
    for (const level of dim.levels) {
      values.push({
        score: level.score,
        label: level.label,
        options: level.options ?? [],
      });
    }
  }

  // Sort by score ascending
  values.sort((a, b) => a.score - b.score);

  return {
    name: dim.name,
    values,
  };
}

/**
 * Convert cloud definition content to MD definition format.
 */
export function contentToMDDefinition(
  definition: Definition,
  content: DefinitionContent,
  tags: Tag[]
): MDDefinition {
  // Extract category from first tag, or construct from dimension names
  const category =
    tags.length > 0
      ? tags[0]!.name
      : content.dimensions.map((d) => d.name).join('_vs_');

  // Generate base_id from definition name
  const baseId = `scenario_${definition.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`;

  return {
    name: definition.name,
    base_id: baseId,
    category,
    preamble: content.preamble,
    template: content.template,
    dimensions: content.dimensions.map(dimensionToMD),
    matchingRules: content.matching_rules ?? '',
  };
}

// ============================================================================
// MD SERIALIZATION
// ============================================================================

/**
 * Serialize MD definition to markdown string.
 * Matches devtool's serializeScenarioMd() output format exactly.
 */
export function serializeDefinitionToMd(mdDef: MDDefinition): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`name: ${mdDef.name}`);
  lines.push(`base_id: ${mdDef.base_id}`);
  lines.push(`category: ${mdDef.category}`);
  lines.push('---');
  lines.push('');

  // Preamble
  lines.push('# Preamble');
  lines.push('');
  lines.push(mdDef.preamble);
  lines.push('');

  // Template
  lines.push('# Template');
  lines.push('');
  lines.push(mdDef.template);
  lines.push('');

  // Dimensions
  lines.push('# Dimensions');
  lines.push('');

  for (const dim of mdDef.dimensions) {
    lines.push(`## ${dim.name}`);
    lines.push('');
    lines.push('| Score | Label | Options |');
    lines.push('|-------|-------|---------|');

    // Sort values by score ascending before writing
    const sortedValues = [...dim.values].sort((a, b) => a.score - b.score);
    for (const val of sortedValues) {
      const options = val.options.join(', ');
      lines.push(`| ${val.score} | ${val.label} | ${options} |`);
    }
    lines.push('');
  }

  // Matching Rules (optional)
  if (mdDef.matchingRules && mdDef.matchingRules.trim()) {
    lines.push('# Matching Rules');
    lines.push('');
    lines.push(mdDef.matchingRules);
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Export a definition to markdown format.
 *
 * @param definition - The definition entity
 * @param content - Resolved definition content (with inheritance applied)
 * @param tags - Tags associated with the definition
 * @returns ExportResult with markdown content
 */
export function exportDefinitionAsMd(
  definition: Definition,
  content: DefinitionContent,
  tags: Tag[]
): ExportResult {
  const mdDef = contentToMDDefinition(definition, content, tags);
  const mdContent = serializeDefinitionToMd(mdDef);

  // Generate safe filename from definition name
  const safeName = definition.name
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);

  return {
    content: mdContent,
    filename: `${safeName}.md`,
    mimeType: 'text/markdown',
  };
}

/**
 * Generate filename for MD export.
 */
export function generateMdFilename(definitionName: string): string {
  const safeName = definitionName
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);
  return `${safeName}.md`;
}
