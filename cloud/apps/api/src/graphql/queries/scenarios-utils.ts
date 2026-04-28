import { toComparableNumber } from '../../services/analysis/scenario-metadata.js';

export type DefinitionDimension = {
  name?: unknown;
  levels?: unknown;
  values?: unknown;
};

export type SafeLevelLookupExclusionReason =
  | 'collision'
  | 'out-of-range'
  | 'empty-levels'
  | 'legacy-values-only';

export type SafeLevelLookup = {
  lookup: (rawLabel: unknown) => number | null;
  exclusionReason: SafeLevelLookupExclusionReason | null;
};

type RawLevel = { score: number; label: string };

function parseRawLevel(level: unknown): RawLevel | 'invalid' {
  if (level === null || typeof level !== 'object') return 'invalid';
  const score = (level as { score?: unknown }).score;
  const label = (level as { label?: unknown }).label;
  if (typeof score !== 'number' || typeof label !== 'string') return 'invalid';
  if (label.trim() === '') return 'invalid';
  return { score, label };
}

function normalizeLabelKey(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

/**
 * Build a label-to-score lookup that is safe for use in pressure-sensitivity aggregation.
 *
 * Wraps a Definition's `dimensions[].levels[]` array with three additional guarantees that
 * `getLevelNormalizationMap` does NOT provide (per spec FR-002a, FR-002b, FR-020):
 *   - rejects collisions (label-vs-label, score-vs-score, label-vs-score after numeric coercion)
 *   - rejects out-of-range or non-integer scores (must be 1..5 inclusive)
 *   - falls back to a counted exclusion when `levels[]` is missing/empty (legacy `values[]` only,
 *     or empty entirely)
 *
 * Input lookup values are trimmed, lowercased, and numeric-coerced via `toComparableNumber`
 * before map lookup, so `' moderate '`, `'Moderate'`, `'1.0'`, and `1` all resolve correctly.
 */
export function buildSafeLevelLookup(definitionDimension: DefinitionDimension | undefined): SafeLevelLookup {
  const empty: SafeLevelLookup = {
    lookup: () => null,
    exclusionReason: null,
  };

  if (!definitionDimension) {
    return { ...empty, exclusionReason: 'empty-levels' };
  }

  const hasLevels = Array.isArray(definitionDimension.levels) && definitionDimension.levels.length > 0;
  const hasValues = Array.isArray(definitionDimension.values) && definitionDimension.values.length > 0;

  if (!hasLevels) {
    return { ...empty, exclusionReason: hasValues ? 'legacy-values-only' : 'empty-levels' };
  }

  const rawLevels: RawLevel[] = [];
  for (const entry of definitionDimension.levels as unknown[]) {
    const parsed = parseRawLevel(entry);
    if (parsed === 'invalid') {
      return { ...empty, exclusionReason: 'empty-levels' };
    }
    if (!Number.isInteger(parsed.score) || parsed.score < 1 || parsed.score > 5) {
      return { ...empty, exclusionReason: 'out-of-range' };
    }
    rawLevels.push(parsed);
  }

  const seenScores = new Set<number>();
  const seenLabels = new Set<string>();
  for (const level of rawLevels) {
    if (seenScores.has(level.score)) {
      return { ...empty, exclusionReason: 'collision' };
    }
    const labelKey = normalizeLabelKey(level.label);
    if (labelKey === null || seenLabels.has(labelKey)) {
      return { ...empty, exclusionReason: 'collision' };
    }
    seenScores.add(level.score);
    seenLabels.add(labelKey);
  }

  // Label-vs-score collision: any level's normalized label coerces to a number that
  // matches a different level's score.
  for (const level of rawLevels) {
    const numericLabel = toComparableNumber(level.label);
    if (numericLabel === null) continue;
    if (Number.isInteger(numericLabel) && numericLabel !== level.score) {
      const collidesWithOtherScore = rawLevels.some(
        (other) => other.score === numericLabel && other !== level,
      );
      if (collidesWithOtherScore) {
        return { ...empty, exclusionReason: 'collision' };
      }
    }
  }

  const map = new Map<string, number>();
  for (const level of rawLevels) {
    const labelKey = normalizeLabelKey(level.label);
    if (labelKey !== null) map.set(labelKey, level.score);
    map.set(String(level.score), level.score);
  }

  const lookup = (rawLabel: unknown): number | null => {
    if (typeof rawLabel === 'number') {
      if (!Number.isFinite(rawLabel)) return null;
      const direct = map.get(String(rawLabel));
      if (direct !== undefined) return direct;
      const numericKey = toComparableNumber(rawLabel);
      if (numericKey === null) return null;
      const fallback = map.get(String(numericKey));
      return fallback ?? null;
    }
    if (typeof rawLabel !== 'string') return null;
    const numericKey = toComparableNumber(rawLabel);
    if (numericKey !== null) {
      const direct = map.get(String(numericKey));
      if (direct !== undefined) return direct;
    }
    const labelKey = normalizeLabelKey(rawLabel);
    if (labelKey === null) return null;
    return map.get(labelKey) ?? null;
  };

  return { lookup, exclusionReason: null };
}

export function getDimensionLevelsFromDefinition(definitionDimension: DefinitionDimension | undefined): string[] {
  if (!definitionDimension) {
    return [];
  }

  if (Array.isArray(definitionDimension.levels)) {
    return definitionDimension.levels
      .map((level) => {
        if (level !== null && typeof level === 'object') {
          const score = (level as { score?: unknown }).score;
          if (typeof score === 'number' || typeof score === 'string') {
            return String(score);
          }
          const label = (level as { label?: unknown }).label;
          if (typeof label === 'string' && label.trim() !== '') {
            return label;
          }
        }
        return null;
      })
      .filter((value): value is string => value !== null);
  }

  if (Array.isArray(definitionDimension.values)) {
    return definitionDimension.values
      .map((value) => (typeof value === 'string' ? value : null))
      .filter((value): value is string => value !== null);
  }

  return [];
}

export function getScenarioDimensions(content: unknown): Record<string, string> {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) {
    return {};
  }
  const dimensions = (content as { dimensions?: unknown }).dimensions;
  if (dimensions === null || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(dimensions)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    } else if (typeof value === 'number') {
      normalized[key] = String(value);
    }
  }
  return normalized;
}

export function getLevelNormalizationMap(definitionDimension: DefinitionDimension | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!definitionDimension || !Array.isArray(definitionDimension.levels)) {
    return map;
  }

  for (const level of definitionDimension.levels) {
    if (level === null || typeof level !== 'object') {
      continue;
    }
    const score = (level as { score?: unknown }).score;
    const label = (level as { label?: unknown }).label;
    const scoreText = typeof score === 'number' || typeof score === 'string' ? String(score) : null;
    const labelText = typeof label === 'string' ? label : null;
    if (scoreText !== null) {
      map.set(scoreText, scoreText);
      if (labelText !== null && labelText.trim() !== '') {
        map.set(labelText, scoreText);
      }
    }
  }

  return map;
}
