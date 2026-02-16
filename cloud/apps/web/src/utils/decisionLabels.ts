type DefinitionContentShape = {
  template?: string;
  dimensions?: Array<{
    name?: string;
    levels?: Array<{
      score?: number;
      label?: string;
    }>;
  }>;
};

type ScenarioDimensions = Record<string, Record<string, string | number>>;

const TEMPLATE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'between',
  'by',
  'choose',
  'choosing',
  'do',
  'for',
  'from',
  'give',
  'he',
  'her',
  'his',
  'i',
  'if',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'project',
  'scale',
  'student',
  'support',
  'somewhat',
  'strongly',
  'the',
  'their',
  'them',
  'they',
  'to',
  'unsure',
  'we',
  'with',
  'you',
  'your',
]);

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

function normalizeDimensionToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenizeName(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function nameSimilarity(a: string, b: string): number {
  const normalizedA = normalizeDimensionToken(a);
  const normalizedB = normalizeDimensionToken(b);
  if (normalizedA === normalizedB) return 100;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 60;

  const tokensA = new Set(tokenizeName(a));
  const tokensB = new Set(tokenizeName(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) overlap += 1;
  });
  return overlap * 10;
}

function tokenizeText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TEMPLATE_STOP_WORDS.has(token));
}

function getTwoAttributeOptionOrder(content: DefinitionContentShape): {
  optionAName: string;
  optionBName: string;
} {
  const fallback = {
    optionAName: content.dimensions?.[0]?.name ?? 'Option A',
    optionBName: content.dimensions?.[1]?.name ?? 'Option B',
  };

  if (typeof content.template !== 'string' || content.template.trim() === '') {
    return fallback;
  }

  const namesByToken = new Map<string, string>();
  (content.dimensions ?? []).forEach((dimension) => {
    if (!dimension.name) return;
    namesByToken.set(normalizeDimensionToken(dimension.name), dimension.name);
  });

  const orderedNames: string[] = [];
  const seen = new Set<string>();
  const placeholderPattern = /\[([^\]]+)\]/g;
  let match = placeholderPattern.exec(content.template);
  while (match) {
    const rawToken = match[1]?.trim();
    if (rawToken) {
      const resolvedName = namesByToken.get(normalizeDimensionToken(rawToken));
      if (resolvedName && !seen.has(resolvedName)) {
        orderedNames.push(resolvedName);
        seen.add(resolvedName);
        if (orderedNames.length === 2) {
          break;
        }
      }
    }
    match = placeholderPattern.exec(content.template);
  }

  if (orderedNames.length < 2) {
    return fallback;
  }

  return {
    optionAName: orderedNames[0] ?? fallback.optionAName,
    optionBName: orderedNames[1] ?? fallback.optionBName,
  };
}

function inferTemplateScoreDirection(
  content: DefinitionContentShape,
  optionAName: string,
  optionBName: string
): Record<'1' | '2' | '4' | '5', string> | null {
  if (typeof content.template !== 'string' || content.template.trim() === '') {
    return null;
  }

  const namesByToken = new Map<string, string>();
  (content.dimensions ?? []).forEach((dimension) => {
    if (!dimension.name) return;
    namesByToken.set(normalizeDimensionToken(dimension.name), dimension.name);
  });

  const optionKeywords = new Map<string, Set<string>>();
  const placeholderLinePattern = /\[([^\]]+)\]/g;
  const lines = content.template.split('\n');
  lines.forEach((line) => {
    let placeholderMatch = placeholderLinePattern.exec(line);
    while (placeholderMatch) {
      const token = placeholderMatch[1]?.trim();
      if (token) {
        const optionName = namesByToken.get(normalizeDimensionToken(token));
        if (optionName && (optionName === optionAName || optionName === optionBName)) {
          const existing = optionKeywords.get(optionName) ?? new Set<string>();
          tokenizeText(line.replace(/\[[^\]]+\]/g, ' ')).forEach((word) => existing.add(word));
          if (existing.size > 0) {
            optionKeywords.set(optionName, existing);
          }
        }
      }
      placeholderMatch = placeholderLinePattern.exec(line);
    }
    placeholderLinePattern.lastIndex = 0;
  });

  const keywordsA = optionKeywords.get(optionAName);
  const keywordsB = optionKeywords.get(optionBName);
  if (!keywordsA || !keywordsB || keywordsA.size === 0 || keywordsB.size === 0) {
    return null;
  }

  const scoreToOption = new Map<'1' | '2' | '4' | '5', string>();
  const scoreLinePattern = /^\s*([1-5])\s*[—–\-:]\s*(.+?)\s*$/;
  lines.forEach((line) => {
    const match = line.match(scoreLinePattern);
    if (!match) return;
    const score = match[1];
    if (score !== '1' && score !== '2' && score !== '4' && score !== '5') return;
    const description = match[2] ?? '';
    const tokens = tokenizeText(description);
    if (tokens.length === 0) return;

    let overlapA = 0;
    let overlapB = 0;
    tokens.forEach((token) => {
      if (keywordsA.has(token)) overlapA += 1;
      if (keywordsB.has(token)) overlapB += 1;
    });
    if (overlapA === overlapB || (overlapA === 0 && overlapB === 0)) return;

    scoreToOption.set(score, overlapA > overlapB ? optionAName : optionBName);
  });

  if (!scoreToOption.has('1') || !scoreToOption.has('5')) {
    return null;
  }

  return {
    '1': scoreToOption.get('1') ?? optionBName,
    '2': scoreToOption.get('2') ?? scoreToOption.get('1') ?? optionBName,
    '4': scoreToOption.get('4') ?? scoreToOption.get('5') ?? optionAName,
    '5': scoreToOption.get('5') ?? optionAName,
  };
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
    const { optionAName, optionBName } = getTwoAttributeOptionOrder(content);
    const inferredDirection = inferTemplateScoreDirection(content, optionAName, optionBName);
    if (inferredDirection) {
      return {
        '1': `Strongly Support ${inferredDirection['1']}`,
        '2': `Somewhat Support ${inferredDirection['2']}`,
        '3': 'Neutral',
        '4': `Somewhat Support ${inferredDirection['4']}`,
        '5': `Strongly Support ${inferredDirection['5']}`,
      };
    }
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

export function mapDecisionSidesToScenarioAttributes(
  lowSideName: string,
  highSideName: string,
  availableAttributes: string[]
): { lowAttribute: string; highAttribute: string } {
  if (availableAttributes.length < 2) {
    return { lowAttribute: lowSideName, highAttribute: highSideName };
  }

  const attributeA = availableAttributes[0] ?? lowSideName;
  const attributeB = availableAttributes[1] ?? highSideName;
  const assignmentA =
    nameSimilarity(lowSideName, attributeA) + nameSimilarity(highSideName, attributeB);
  const assignmentB =
    nameSimilarity(lowSideName, attributeB) + nameSimilarity(highSideName, attributeA);

  if (assignmentB > assignmentA) {
    return { lowAttribute: attributeB, highAttribute: attributeA };
  }

  return { lowAttribute: attributeA, highAttribute: attributeB };
}

export function resolveScenarioAxisDimensions(
  availableAttributes: string[],
  requestedRowDim: string,
  requestedColDim: string
): { rowDim: string; colDim: string } {
  // URL params can be stale (bookmarks/shared links) after scenario attributes change.
  // Always resolve to currently available attributes, and avoid duplicate row/col axes.
  if (availableAttributes.length === 0) {
    return { rowDim: requestedRowDim, colDim: requestedColDim };
  }

  const fallbackRowDim = availableAttributes[0] ?? requestedRowDim;
  const fallbackColDim = availableAttributes.find((attribute) => attribute !== fallbackRowDim) ?? fallbackRowDim;

  const rowDim = availableAttributes.includes(requestedRowDim) ? requestedRowDim : fallbackRowDim;
  let colDim = availableAttributes.includes(requestedColDim) ? requestedColDim : fallbackColDim;

  if (colDim === rowDim) {
    colDim = availableAttributes.find((attribute) => attribute !== rowDim) ?? colDim;
  }

  return { rowDim, colDim };
}

export function getDominantScenarioAttributes(
  scenarioDimensions?: ScenarioDimensions
): string[] {
  // Fallback source when vignette definition attributes are unavailable.
  // We treat each scenario key-set as a signature and select the most frequent one.
  // Ties are resolved lexicographically so the choice is deterministic.
  if (!scenarioDimensions) return [];

  const signatureCounts = new Map<string, number>();
  const keysBySignature = new Map<string, string[]>();

  Object.values(scenarioDimensions).forEach((dimensions) => {
    const keys = Object.keys(dimensions).sort();
    if (keys.length === 0) return;
    const signature = keys.join('||');
    keysBySignature.set(signature, keys);
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
  });

  if (signatureCounts.size === 0) return [];

  const sorted = [...signatureCounts.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const dominantSignature = sorted[0]?.[0];
  if (!dominantSignature) return [];

  return keysBySignature.get(dominantSignature) ?? [];
}

export function deriveScenarioAttributesFromDefinition(
  definitionContent: unknown
): string[] {
  // Vignette definition is canonical for display labels.
  // Decision-like dimensions are excluded because they are not scenario axes.
  const content = definitionContent as DefinitionContentShape | undefined;
  if (!content?.dimensions?.length) return [];

  const excluded = new Set(['decision', 'rubric', 'evaluation']);
  const names = content.dimensions
    .map((dimension) => dimension.name?.trim() ?? '')
    .filter((name) => name !== '' && !excluded.has(name.toLowerCase()));

  return [...new Set(names)];
}

export function resolveScenarioAttributes(
  scenarioDimensions: ScenarioDimensions | undefined,
  preferredAttributes: string[]
): string[] {
  // Resolution order:
  // 1) Prefer vignette-derived attributes that are present in scenario data.
  // 2) If only one preferred attribute is present, pair it with dominant fallback.
  // 3) Otherwise use dominant scenario attribute signature.
  const dominant = getDominantScenarioAttributes(scenarioDimensions);
  if (!scenarioDimensions || preferredAttributes.length === 0) {
    return dominant;
  }

  const allObservedKeys = new Set<string>();
  Object.values(scenarioDimensions).forEach((dimensions) => {
    Object.keys(dimensions).forEach((key) => allObservedKeys.add(key));
  });

  const preferredPresent = preferredAttributes.filter((name) => allObservedKeys.has(name));
  if (preferredPresent.length >= 2) {
    return preferredPresent.slice(0, 2);
  }

  if (preferredPresent.length === 1) {
    const preferred = preferredPresent[0];
    if (!preferred) return dominant;
    const fallback = dominant.find((name) => name !== preferred);
    return fallback ? [preferred, fallback] : [preferred];
  }

  return dominant;
}
