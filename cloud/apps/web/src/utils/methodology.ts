type DefinitionMethodology = {
  family?: string;
  response_scale?: 'numeric' | 'option_text' | 'value_labels';
  legacy_label?: string;
  canonical_value_order?: string[];
  presentation_order?: 'A_first' | 'B_first';
  pair_key?: string;
};

type DecisionScaleLabel = {
  code: string;
  label: string;
};

export type DecisionMetadata = {
  parserVersion?: string;
  parseClass?: 'exact' | 'fallback_resolved' | 'ambiguous';
  parsePath?: string;
  responseSha256?: string;
  responseExcerpt?: string;
  matchedLabel?: string | null;
  scaleLabels?: DecisionScaleLabel[];
  manualOverride?: {
    previousDecisionCode?: string | null;
    overriddenAt?: string;
    overriddenByUserId?: string | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getDefinitionMethodology(content: unknown): DefinitionMethodology | null {
  if (!isRecord(content)) return null;
  const raw = content.methodology;
  if (!isRecord(raw)) return null;

  const family = typeof raw.family === 'string' ? raw.family : undefined;
  const responseScale = raw.response_scale;
  const legacyLabel = typeof raw.legacy_label === 'string' ? raw.legacy_label : undefined;
  const presentationOrder = raw.presentation_order;
  const pairKey = typeof raw.pair_key === 'string' ? raw.pair_key : undefined;
  const canonicalValueOrder = Array.isArray(raw.canonical_value_order)
    ? raw.canonical_value_order.filter((value): value is string => typeof value === 'string')
    : undefined;

  return {
    family,
    response_scale:
      responseScale === 'numeric' || responseScale === 'option_text' || responseScale === 'value_labels'
        ? responseScale
        : undefined,
    legacy_label: legacyLabel,
    canonical_value_order: canonicalValueOrder,
    presentation_order:
      presentationOrder === 'A_first' || presentationOrder === 'B_first'
        ? presentationOrder
        : undefined,
    pair_key: pairKey,
  };
}

export function getDecisionMetadata(value: unknown): DecisionMetadata | null {
  if (!isRecord(value)) return null;

  const scaleLabels = Array.isArray(value.scaleLabels)
    ? value.scaleLabels.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        if (typeof entry.code !== 'string' || typeof entry.label !== 'string') return [];
        return [{ code: entry.code, label: entry.label }];
      })
    : undefined;

  const manualOverride = isRecord(value.manualOverride)
    ? {
        previousDecisionCode:
          typeof value.manualOverride.previousDecisionCode === 'string'
            ? value.manualOverride.previousDecisionCode
            : value.manualOverride.previousDecisionCode === null
              ? null
              : undefined,
        overriddenAt:
          typeof value.manualOverride.overriddenAt === 'string'
            ? value.manualOverride.overriddenAt
            : undefined,
        overriddenByUserId:
          typeof value.manualOverride.overriddenByUserId === 'string'
            ? value.manualOverride.overriddenByUserId
            : value.manualOverride.overriddenByUserId === null
              ? null
              : undefined,
      }
    : undefined;

  return {
    parserVersion: typeof value.parserVersion === 'string' ? value.parserVersion : undefined,
    parseClass:
      value.parseClass === 'exact' || value.parseClass === 'fallback_resolved' || value.parseClass === 'ambiguous'
        ? value.parseClass
        : undefined,
    parsePath: typeof value.parsePath === 'string' ? value.parsePath : undefined,
    responseSha256: typeof value.responseSha256 === 'string' ? value.responseSha256 : undefined,
    responseExcerpt: typeof value.responseExcerpt === 'string' ? value.responseExcerpt : undefined,
    matchedLabel:
      typeof value.matchedLabel === 'string'
        ? value.matchedLabel
        : value.matchedLabel === null
          ? null
          : undefined,
    scaleLabels,
    manualOverride,
  };
}

export function isJobChoiceMethodology(content: unknown): boolean {
  return getDefinitionMethodology(content)?.family === 'job-choice';
}

export function getDefinitionMethodologyLabel(
  content: unknown,
  domainName?: string | null,
): 'Job Choice' | 'Old V1' | null {
  const methodology = getDefinitionMethodology(content);
  if (methodology?.family === 'job-choice') {
    return 'Job Choice';
  }

  if (domainName?.toLowerCase() === 'professional') {
    return 'Old V1';
  }

  return null;
}
