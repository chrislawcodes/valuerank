/**
 * Markdown Definition Parser
 *
 * Imports definitions from devtool-compatible markdown format.
 * Port of devtool/src/server/utils/scenarioMd.ts parser with cloud type mapping.
 */

import type { DefinitionContent, DimensionLevel } from '@valuerank/db';
import type { ParseResult, ParsedMDDefinition, ImportError } from './types.js';

// ============================================================================
// FRONTMATTER PARSING
// ============================================================================

type Frontmatter = {
  name?: string;
  base_id?: string;
  category?: string;
};

/**
 * Parse YAML-like frontmatter from markdown.
 */
function parseFrontmatter(lines: string[]): { frontmatter: Frontmatter; endIndex: number } {
  const frontmatter: Frontmatter = {};
  let i = 0;

  // Check for opening delimiter
  if (lines[0]?.trim() !== '---') {
    return { frontmatter, endIndex: 0 };
  }

  i = 1;
  while (i < lines.length && lines[i]?.trim() !== '---') {
    const match = lines[i]?.match(/^(\w+):\s*(.+)$/);
    if (match && match[1] && match[2]) {
      const key = match[1] as keyof Frontmatter;
      frontmatter[key] = match[2].trim();
    }
    i++;
  }

  // Skip closing delimiter
  if (lines[i]?.trim() === '---') {
    i++;
  }

  return { frontmatter, endIndex: i };
}

// ============================================================================
// SECTION PARSING
// ============================================================================

type Sections = {
  preamble: string[];
  template: string[];
  dimensions: string[];
  'matching rules': string[];
};

/**
 * Extract sections from markdown content.
 */
function parseSections(lines: string[], startIndex: number): Sections {
  const sections: Sections = {
    preamble: [],
    template: [],
    dimensions: [],
    'matching rules': [],
  };
  let currentSection = '';

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const headerMatch = line.match(/^#\s+(.+)$/);

    if (headerMatch && headerMatch[1]) {
      currentSection = headerMatch[1].toLowerCase();
      continue;
    }

    if (currentSection && currentSection in sections) {
      sections[currentSection as keyof Sections].push(line);
    }
  }

  return sections;
}

// ============================================================================
// DIMENSION PARSING
// ============================================================================

type ParsedDimension = {
  name: string;
  levels: DimensionLevel[];
};

/**
 * Parse dimension tables from the dimensions section.
 */
function parseDimensions(dimensionsContent: string[]): ParsedDimension[] {
  const dimensions: ParsedDimension[] = [];
  const content = dimensionsContent.join('\n');

  // Split by ## headers (dimension names)
  const dimSections = content.split(/^##\s+/m).filter(s => s.trim());

  for (const dimSection of dimSections) {
    const dimLines = dimSection.split('\n');
    const dimName = dimLines[0]?.trim();
    if (!dimName) continue;

    const levels: DimensionLevel[] = [];

    // Find table rows (skip header and separator)
    let inTable = false;
    for (const line of dimLines.slice(1)) {
      // Check for table header
      if (line.includes('|') && line.toLowerCase().includes('score')) {
        inTable = true;
        continue;
      }
      // Skip table separator line
      if (line.match(/^\|[-\s|]+\|$/)) continue;

      // Parse table data rows
      if (inTable && line.includes('|')) {
        const cells = line.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length >= 3 && cells[0] && cells[1]) {
          const score = parseInt(cells[0]) || 0;
          const label = cells[1];
          const options = cells[2]?.split(',').map(o => o.trim()).filter(o => o) || [];

          if (score > 0) {
            levels.push({ score, label, options });
          }
        }
      }
    }

    if (levels.length > 0) {
      // Sort by score ascending
      levels.sort((a, b) => a.score - b.score);
      dimensions.push({ name: dimName, levels });
    }
  }

  return dimensions;
}

// ============================================================================
// MD CONTENT TO DEFINITION CONTENT
// ============================================================================

/**
 * Convert parsed MD data to cloud DefinitionContent format.
 */
function toDefinitionContent(
  sections: Sections,
  dimensions: ParsedDimension[]
): DefinitionContent {
  return {
    schema_version: 1,
    preamble: sections.preamble.join('\n').trim(),
    template: sections.template.join('\n').trim(),
    dimensions: dimensions.map(d => ({
      name: d.name,
      levels: d.levels,
    })),
    matching_rules: sections['matching rules'].join('\n').trim() || undefined,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate the parsed content has required sections.
 */
function validateContent(
  frontmatter: Frontmatter,
  sections: Sections,
  dimensions: ParsedDimension[]
): ImportError[] {
  const errors: ImportError[] = [];

  // Check required frontmatter
  if (!frontmatter.name) {
    errors.push({
      field: 'frontmatter.name',
      message: 'Definition name is required in frontmatter',
    });
  }

  // Check required sections
  const preamble = sections.preamble.join('\n').trim();
  if (!preamble) {
    errors.push({
      field: 'preamble',
      message: 'Preamble section is required',
    });
  }

  const template = sections.template.join('\n').trim();
  if (!template) {
    errors.push({
      field: 'template',
      message: 'Template section is required',
    });
  }

  // Dimensions are optional but if the section exists, it should have content
  const dimContent = sections.dimensions.join('\n').trim();
  if (dimContent && dimensions.length === 0) {
    errors.push({
      field: 'dimensions',
      message: 'Dimensions section exists but no valid dimensions found. Check table format.',
    });
  }

  return errors;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Parse markdown content into a definition structure.
 *
 * @param mdContent - Raw markdown string
 * @returns ParseResult with parsed data or errors
 */
export function parseMdToDefinition(mdContent: string): ParseResult<ParsedMDDefinition> {
  const lines = mdContent.split('\n');

  // Parse frontmatter
  const { frontmatter, endIndex } = parseFrontmatter(lines);

  // Parse sections
  const sections = parseSections(lines, endIndex);

  // Parse dimensions
  const dimensions = parseDimensions(sections.dimensions);

  // Validate
  const errors = validateContent(frontmatter, sections, dimensions);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Build result
  const content = toDefinitionContent(sections, dimensions);

  return {
    success: true,
    data: {
      name: frontmatter.name!,
      content,
      category: frontmatter.category,
      baseId: frontmatter.base_id,
    },
  };
}

/**
 * Check if content looks like valid MD format (quick check).
 * Useful for early validation before full parsing.
 */
export function isValidMdFormat(content: string): boolean {
  // Must have frontmatter
  if (!content.startsWith('---')) return false;

  // Must have closing frontmatter
  const secondDelim = content.indexOf('---', 3);
  if (secondDelim === -1) return false;

  // Must have at least preamble and template sections
  const lowerContent = content.toLowerCase();
  if (!lowerContent.includes('# preamble')) return false;
  if (!lowerContent.includes('# template')) return false;

  return true;
}
