export type ScenarioAnalysisSourceFormat = 'dimensions' | 'dimension_values' | 'mixed';

export type NormalizedScenarioAnalysisMetadata = {
  groupingDimensions: Record<string, string>;
  numericDimensions: Record<string, number>;
  displayDimensions: Record<string, string>;
  sourceFormat: ScenarioAnalysisSourceFormat;
};

type ScenarioContentLike = {
  dimensions?: unknown;
  dimension_values?: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDimensionValue(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}

function toRawDimensionRecord(value: unknown): Record<string, number | string> | null {
  if (!isPlainObject(value)) return null;

  const sanitized: Record<string, number | string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isDimensionValue(entry)) continue;
    sanitized[key] = entry;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function toComparableNumber(value: number | string): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = value.trim();
  if (trimmed === '') return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function valuesAreEquivalent(left: number | string, right: number | string): boolean {
  if (String(left) === String(right)) return true;

  const leftNumeric = toComparableNumber(left);
  const rightNumeric = toComparableNumber(right);
  return leftNumeric !== null && rightNumeric !== null && leftNumeric === rightNumeric;
}

function buildNormalizedMetadata(
  raw: Record<string, number | string>,
  sourceFormat: ScenarioAnalysisSourceFormat,
): NormalizedScenarioAnalysisMetadata | null {
  const groupingDimensions: Record<string, string> = {};
  const numericDimensions: Record<string, number> = {};
  const displayDimensions: Record<string, string> = {};

  for (const [key, value] of Object.entries(raw)) {
    const displayValue = String(value);
    groupingDimensions[key] = displayValue;
    displayDimensions[key] = displayValue;

    const numericValue = toComparableNumber(value);
    if (numericValue !== null) {
      numericDimensions[key] = numericValue;
    }
  }

  if (Object.keys(groupingDimensions).length === 0) return null;

  return {
    groupingDimensions,
    numericDimensions,
    displayDimensions,
    sourceFormat,
  };
}

export function normalizeScenarioAnalysisMetadata(
  content: unknown,
): NormalizedScenarioAnalysisMetadata | null {
  if (!isPlainObject(content)) return null;

  const typedContent = content as ScenarioContentLike;
  const dimensions = toRawDimensionRecord(typedContent.dimensions);
  const dimensionValues = toRawDimensionRecord(typedContent.dimension_values);

  if (dimensions !== null && dimensionValues !== null) {
    const merged: Record<string, number | string> = { ...dimensions };

    for (const [key, value] of Object.entries(dimensionValues)) {
      const existing = merged[key];
      if (existing !== undefined && !valuesAreEquivalent(existing, value)) {
        return null;
      }

      merged[key] = value;
    }

    return buildNormalizedMetadata(merged, 'mixed');
  }

  if (dimensions !== null) {
    return buildNormalizedMetadata(dimensions, 'dimensions');
  }

  if (dimensionValues !== null) {
    return buildNormalizedMetadata(dimensionValues, 'dimension_values');
  }

  return null;
}

export function buildScenarioAnalysisDimensionRecord(
  metadata: NormalizedScenarioAnalysisMetadata | null,
): Record<string, number | string> {
  if (metadata === null) return {};

  const analysisDimensions: Record<string, number | string> = {};
  for (const key of Object.keys(metadata.groupingDimensions).sort()) {
    analysisDimensions[key] = metadata.numericDimensions[key] ?? metadata.groupingDimensions[key] ?? metadata.displayDimensions[key] ?? '';
  }
  return analysisDimensions;
}
