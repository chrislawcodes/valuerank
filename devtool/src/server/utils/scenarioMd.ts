/**
 * Scenario Definition Markdown Format
 *
 * The .md file is a structured document that defines how to generate scenario combinations.
 * Format:
 *
 * ---
 * name: exp-009.building_planning
 * base_id: scenario_009
 * category: Economics_vs_Environment
 * ---
 *
 * # Preamble
 *
 * Instructions for the AI model...
 *
 * # Template
 *
 * The scenario template with [placeholders]...
 *
 * # Dimensions
 *
 * ## DimensionName
 *
 * | Score | Label | Options |
 * |-------|-------|---------|
 * | 1 | Low | option1, option2 |
 * | 2 | Medium | option3 |
 *
 * ## AnotherDimension
 * ...
 *
 * # Matching Rules
 *
 * Optional constraints for valid combinations...
 */

export interface ScenarioDefinition {
  name: string;
  base_id: string;
  category: string;
  preamble: string;
  template: string;
  dimensions: {
    name: string;
    values: { score: number; label: string; options: string[] }[];
  }[];
  matchingRules: string;
}

export function parseScenarioMd(content: string): ScenarioDefinition {
  const lines = content.split('\n');

  // Parse frontmatter
  const frontmatter: Record<string, string> = {};
  let i = 0;

  if (lines[0]?.trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i]?.trim() !== '---') {
      const match = lines[i].match(/^(\w+):\s*(.+)$/);
      if (match) {
        frontmatter[match[1]] = match[2].trim();
      }
      i++;
    }
    i++; // Skip closing ---
  }

  // Find sections
  const sections: Record<string, string[]> = {};
  let currentSection = '';

  for (; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^#\s+(.+)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].toLowerCase();
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  // Parse dimensions
  const dimensions: ScenarioDefinition['dimensions'] = [];
  const dimensionsContent = sections['dimensions']?.join('\n') || '';
  const dimSections = dimensionsContent.split(/^##\s+/m).filter(s => s.trim());

  for (const dimSection of dimSections) {
    const dimLines = dimSection.split('\n');
    const dimName = dimLines[0]?.trim();
    if (!dimName) continue;

    const values: { score: number; label: string; options: string[] }[] = [];

    // Find table rows (skip header and separator)
    let inTable = false;
    for (const line of dimLines.slice(1)) {
      if (line.includes('|') && line.includes('Score')) {
        inTable = true;
        continue;
      }
      if (line.match(/^\|[-\s|]+\|$/)) continue; // Skip separator

      if (inTable && line.includes('|')) {
        const cells = line.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length >= 3) {
          const score = parseInt(cells[0]) || 0;
          const label = cells[1] || '';
          const options = cells[2]?.split(',').map(o => o.trim()).filter(o => o) || [];
          if (score > 0) {
            values.push({ score, label, options });
          }
        }
      }
    }

    if (values.length > 0) {
      // Sort values by score ascending
      values.sort((a, b) => a.score - b.score);
      dimensions.push({ name: dimName, values });
    }
  }

  return {
    name: frontmatter['name'] || 'unnamed',
    base_id: frontmatter['base_id'] || 'scenario_001',
    category: frontmatter['category'] || '',
    preamble: sections['preamble']?.join('\n').trim() || '',
    template: sections['template']?.join('\n').trim() || '',
    dimensions,
    matchingRules: sections['matching rules']?.join('\n').trim() || '',
  };
}

export function serializeScenarioMd(def: ScenarioDefinition): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`name: ${def.name}`);
  lines.push(`base_id: ${def.base_id}`);
  lines.push(`category: ${def.category}`);
  lines.push('---');
  lines.push('');

  // Preamble
  lines.push('# Preamble');
  lines.push('');
  lines.push(def.preamble);
  lines.push('');

  // Template
  lines.push('# Template');
  lines.push('');
  lines.push(def.template);
  lines.push('');

  // Dimensions
  lines.push('# Dimensions');
  lines.push('');

  for (const dim of def.dimensions) {
    lines.push(`## ${dim.name}`);
    lines.push('');
    lines.push('| Score | Label | Options |');
    lines.push('|-------|-------|---------|');
    // Sort values by score ascending before writing
    const sortedValues = [...dim.values].sort((a, b) => a.score - b.score);
    for (const val of sortedValues) {
      lines.push(`| ${val.score} | ${val.label} | ${val.options.join(', ')} |`);
    }
    lines.push('');
  }

  // Matching Rules
  if (def.matchingRules) {
    lines.push('# Matching Rules');
    lines.push('');
    lines.push(def.matchingRules);
    lines.push('');
  }

  return lines.join('\n');
}

export function buildGenerationPrompt(def: ScenarioDefinition): string {
  const dimensionDefs = def.dimensions
    .map((dim) => {
      const valueLines = dim.values
        .map((v) => `  Score ${v.score} (${v.label}): ${v.options.join(', ')}`)
        .join('\n');
      return `${dim.name}:\n${valueLines}`;
    })
    .join('\n\n');

  const placeholders = def.dimensions.map((d) => `[${d.name.toLowerCase()}]`).join(', ');

  return `You are a scenario generator for a moral values research project. Generate a YAML file with all valid combinations of the following dimensions.

## Preamble (use exactly):
${def.preamble}

## Scenario Template:
The template uses these placeholders: ${placeholders}
Each placeholder should be replaced with an option from the corresponding dimension score.

Template:
${def.template}

## Dimensions and Scores:
${dimensionDefs}

${def.matchingRules ? `## Matching Rules:\n${def.matchingRules}` : ''}

## Output Format:
Generate valid YAML with this structure:
\`\`\`yaml
preamble: >
  [the preamble text]

scenarios:
  ${def.base_id}_[Dim1Score]_[Dim2Score]_...:
    base_id: ${def.base_id}
    category: ${def.category || def.dimensions.map(d => d.name).join('_vs_')}
    subject: [descriptive title with scores]
    body: |
      [filled template with natural grammar]
\`\`\`

Generate ALL valid combinations. For each combination:
1. Pick a random option from each dimension's score level
2. Replace placeholders in the template
3. Smooth the grammar so sentences flow naturally
4. Use the naming convention: ${def.base_id}_[Dim1Name][Score]_[Dim2Name][Score]_...

${def.matchingRules ? 'Skip combinations that violate the matching rules.' : ''}

Output ONLY the YAML, no explanations.`;
}
