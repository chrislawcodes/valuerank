type DefinitionContentShape = {
  dimensions?: Array<{
    name?: string;
    levels?: Array<{
      score?: number;
      label?: string;
    }>;
  }>;
};

export function extractAttributeName(label: string): string {
  const prefixes = [
    'Strongly Support ',
    'Somewhat Support ',
    'Strongly Oppose ',
    'Somewhat Oppose ',
  ];
  for (const prefix of prefixes) {
    if (label.startsWith(prefix)) return label.slice(prefix.length).trim();
  }
  return label.trim();
}

/**
 * Build decision-code labels (1..5) from definition content.
 *
 * For two-attribute definitions, score direction follows probe prompts:
 * - 5 supports option A (first attribute)
 * - 1 supports option B (second attribute)
 */
export function deriveDecisionDimensionLabels(
  definitionContent: unknown
): Record<string, string> | undefined {
  const content = definitionContent as DefinitionContentShape | undefined;
  if (!content?.dimensions?.length) return undefined;

  const decisionDim = content.dimensions.find((dimension) => (
    ['decision', 'rubric', 'evaluation'].some((term) => dimension.name?.toLowerCase() === term)
  ));

  if (decisionDim?.levels?.length === 5) {
    const labels: Record<string, string> = {};
    let validCount = 0;
    decisionDim.levels.forEach((level) => {
      if (level?.score != null && level?.label?.trim()) {
        labels[String(level.score)] = level.label;
        validCount++;
      }
    });
    if (validCount === 5) return labels;
  }

  if (content.dimensions.length === 2) {
    const optionAName = content.dimensions[0]?.name ?? 'Option A';
    const optionBName = content.dimensions[1]?.name ?? 'Option B';
    return {
      '1': `Strongly Support ${optionBName}`,
      '2': `Somewhat Support ${optionBName}`,
      '3': 'Neutral',
      '4': `Somewhat Support ${optionAName}`,
      '5': `Strongly Support ${optionAName}`,
    };
  }

  if (content.dimensions.length === 1) {
    const dimName = content.dimensions[0]?.name ?? 'Attribute';
    return {
      '1': `Strongly Support ${dimName}`,
      '2': `Somewhat Support ${dimName}`,
      '3': 'Neutral',
      '4': `Somewhat Oppose ${dimName}`,
      '5': `Strongly Oppose ${dimName}`,
    };
  }

  return undefined;
}

export function getDecisionSideNames(
  dimensionLabels?: Record<string, string>
): { aName: string; bName: string } {
  const aName = dimensionLabels?.['1'] ? extractAttributeName(dimensionLabels['1']) : 'Attribute A';
  const bName = dimensionLabels?.['5'] ? extractAttributeName(dimensionLabels['5']) : 'Attribute B';
  return { aName, bName };
}
