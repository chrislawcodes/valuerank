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

type DefinitionDimension = {
  name?: string;
};

type JobChoiceComponents = {
  value_first?: { token?: string };
  value_second?: { token?: string };
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

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatValueOrderName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  const normalized = trimmed.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const looksLikeToken = /^[a-z0-9 ]+$/.test(normalized);
  return looksLikeToken ? toTitleCase(normalized) : normalized;
}

function readJobChoiceComponents(content: unknown): JobChoiceComponents | null {
  if (!isRecord(content)) return null;
  const raw = content.components;
  if (!isRecord(raw)) return null;

  return {
    value_first: isRecord(raw.value_first) ? { token: toNonEmptyString(raw.value_first.token) ?? undefined } : undefined,
    value_second: isRecord(raw.value_second) ? { token: toNonEmptyString(raw.value_second.token) ?? undefined } : undefined,
  };
}

function readDefinitionDimensions(content: unknown): DefinitionDimension[] {
  if (!isRecord(content) || !Array.isArray(content.dimensions)) {
    return [];
  }

  return content.dimensions.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const name = toNonEmptyString(entry.name);
    return name ? [{ name }] : [];
  });
}

function formatValueOrder(values: [string, string] | null): string | null {
  if (!values) return null;
  return `${values[0]} -> ${values[1]}`;
}

function reverseValueOrder(values: [string, string] | null): [string, string] | null {
  if (!values) return null;
  return [values[1], values[0]];
}

export type PairedOrientationLabels = {
  canonicalValues: [string, string] | null;
  flippedValues: [string, string] | null;
  currentValues: [string, string] | null;
  canonical: string;
  flipped: string;
  current: string;
};

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

export function getPairedOrientationLabels(content: unknown): PairedOrientationLabels {
  const methodology = getDefinitionMethodology(content);
  const components = readJobChoiceComponents(content);
  const dimensions = readDefinitionDimensions(content);

  const componentOrder = (() => {
    const first = toNonEmptyString(components?.value_first?.token);
    const second = toNonEmptyString(components?.value_second?.token);
    if (!first || !second) return null;
    return [formatValueOrderName(first), formatValueOrderName(second)] as [string, string];
  })();

  const canonicalOrderFromMethodology = (() => {
    const raw = methodology?.canonical_value_order;
    if (!raw || raw.length < 2) return null;
    const first = toNonEmptyString(raw[0]);
    const second = toNonEmptyString(raw[1]);
    if (!first || !second) return null;
    return [formatValueOrderName(first), formatValueOrderName(second)] as [string, string];
  })();

  const canonicalOrderFromDimensions = (() => {
    const first = toNonEmptyString(dimensions[0]?.name);
    const second = toNonEmptyString(dimensions[1]?.name);
    if (!first || !second) return null;
    return [formatValueOrderName(first), formatValueOrderName(second)] as [string, string];
  })();

  const canonicalValues = canonicalOrderFromMethodology
    ?? (componentOrder && methodology?.presentation_order === 'B_first'
      ? reverseValueOrder(componentOrder)
      : componentOrder)
    ?? canonicalOrderFromDimensions;

  const currentValues = componentOrder
    ?? (methodology?.presentation_order === 'B_first'
      ? reverseValueOrder(canonicalValues)
      : canonicalValues);

  const flippedValues = reverseValueOrder(canonicalValues);

  return {
    canonicalValues,
    flippedValues,
    currentValues,
    canonical: formatValueOrder(canonicalValues) ?? 'Canonical order',
    flipped: formatValueOrder(flippedValues) ?? 'Flipped order',
    current: formatValueOrder(currentValues) ?? 'Current order',
  };
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
