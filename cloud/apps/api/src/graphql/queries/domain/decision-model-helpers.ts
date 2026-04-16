import { DOMAIN_ANALYSIS_VALUE_KEYS, toPascalCaseKey, type DomainAnalysisValueKey } from '../domain-analysis-values.js';
import { JOB_CHOICE_VALUE_STATEMENTS, labelFromBody } from '@valuerank/shared';
import type {
  DecisionDirection,
  DecisionStrength,
  DecisionSource,
  CanonicalAppliedDecision,
  CanonicalDecision,
  DecisionPair,
  ValueStatementEntry,
  ParsedDecisionPath,
  CachedWinnerFirstDecision,
} from './decision-model-types.js';

export { JOB_CHOICE_VALUE_STATEMENTS };

export function isValueKey(value: string): value is DomainAnalysisValueKey {
  return (DOMAIN_ANALYSIS_VALUE_KEYS as readonly string[]).includes(value);
}

export function isDecisionDirection(value: unknown): value is DecisionDirection {
  return value === 'favor_first' || value === 'favor_second' || value === 'neutral' || value === 'refusal' || value === 'unknown';
}

export function isDecisionStrength(value: unknown): value is DecisionStrength {
  return value === 'strong' || value === 'lean' || value === 'neutral' || value === 'unknown';
}

export function isCanonicalAppliedDecision(value: unknown): value is CanonicalAppliedDecision {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const decision = value as CanonicalAppliedDecision;
  return (
    isDecisionDirection(decision.direction) &&
    isDecisionStrength(decision.strength) &&
    (decision.favoredValueKey === null || (typeof decision.favoredValueKey === 'string' && isValueKey(decision.favoredValueKey))) &&
    (decision.opposedValueKey === null || (typeof decision.opposedValueKey === 'string' && isValueKey(decision.opposedValueKey)))
  );
}

export function isCachedWinnerFirstDecision(value: unknown): value is CachedWinnerFirstDecision {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const decision = value as CachedWinnerFirstDecision;
  if (
    decision.cacheVersion !== 1
    || (decision.decisionState !== 'resolved' && decision.decisionState !== 'neutral' && decision.decisionState !== 'unknown')
  ) {
    return false;
  }

  if (decision.decisionState === 'resolved') {
    return (
      typeof decision.favoredValueKey === 'string'
      && isValueKey(decision.favoredValueKey)
      && (decision.strength === 'strong' || decision.strength === 'lean')
    );
  }

  if (decision.decisionState === 'neutral') {
    return decision.favoredValueKey === null && decision.strength === 'neutral';
  }

  return decision.favoredValueKey === null && decision.strength === 'unknown';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isValidDecisionPair(pair: DecisionPair | null | undefined): pair is DecisionPair {
  if (pair === null || pair === undefined) {
    return false;
  }

  return (
    isValueKey(pair.valueA) &&
    isValueKey(pair.valueB) &&
    pair.valueA !== pair.valueB
  );
}

export function parseDecisionPath(parsePath: string | null | undefined): ParsedDecisionPath | null {
  if (typeof parsePath !== 'string') {
    return null;
  }

  const trimmed = parsePath.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const segments = trimmed.split('.');
  if (segments.length > 3) {
    return null;
  }
  const [branch, first, second] = segments;
  const normalizedBranch = branch === 'fallback_resolved' ? 'fallback' : branch;

  if (normalizedBranch !== 'exact' && normalizedBranch !== 'fallback' && normalizedBranch !== 'manual') {
    return null;
  }

  if (normalizedBranch === 'manual') {
    return first === 'override' && second === undefined
      ? { branch: 'manual', direction: 'unknown', strength: 'unknown' }
      : null;
  }

  if (first === 'neutral' && (second === undefined || second === 'neutral')) {
    return { branch: normalizedBranch, direction: 'neutral', strength: 'neutral' };
  }

  if (!isDecisionDirection(first) || !isDecisionStrength(second)) {
    return null;
  }

  return {
    branch: normalizedBranch,
    direction: first,
    strength: second,
  };
}

export function isJobChoiceDecisionPath(parsePath: string | null | undefined): boolean {
  return typeof parsePath === 'string' && (
    parsePath.startsWith('numeric_')
    || parsePath.startsWith('text_label_')
  );
}

export function flipDirection(direction: DecisionDirection): DecisionDirection {
  if (direction === 'favor_first') return 'favor_second';
  if (direction === 'favor_second') return 'favor_first';
  return direction;
}

export function normalizeJobChoiceLabelText(text: string): string {
  const stripped = text
    .replace(/[*_`]+/g, ' ')
    .replace(/^level of support\s*:\s*/i, '')
    .replace(/^(?:my\s+)?(?:final\s+|overall\s+)?(?:judg(?:e)?ment|answer|response|decision|choice|rating|score)(?:\s+on\s+the\s+scale)?\s*(?:(?:is)\s*[:=]?|[:=])?\s*/i, '')
    .trim();

  return stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseJobChoiceStrengthFromText(text: string): DecisionStrength | null {
  const normalized = normalizeJobChoiceLabelText(text);
  if (normalized.startsWith('strongly support')) return 'strong';
  if (normalized.startsWith('somewhat support')) return 'lean';
  if (normalized.startsWith('neutral')) return 'neutral';
  return null;
}

export function resolveValueKeyFromText(
  text: string,
  valueStatements: readonly ValueStatementEntry[] | undefined,
  labelPrefix: string | null,
): DomainAnalysisValueKey | null {
  if (valueStatements == null || valueStatements.length === 0) {
    return null;
  }

  const normalized = normalizeJobChoiceLabelText(text);
  if (normalized.length === 0) {
    return null;
  }

  const prefix = labelPrefix ?? '';
  let resolved: DomainAnalysisValueKey | null = null;
  for (const entry of valueStatements) {
    const valueKey = toPascalCaseKey(entry.token) as DomainAnalysisValueKey;
    const label = normalizeJobChoiceLabelText(labelFromBody(entry.body, prefix));
    if (!label || !normalized.includes(label)) {
      continue;
    }
    if (resolved !== null && resolved !== valueKey) {
      return null;
    }
    resolved = valueKey;
  }

  return resolved;
}

export function buildUnknownCanonicalDecision(source: DecisionSource): CanonicalDecision {
  return {
    favoredValueKey: null,
    opposedValueKey: null,
    direction: 'unknown',
    strength: 'unknown',
    normalizationApplied: false,
    normalizationReason: null,
    source,
  };
}

export function buildCanonicalDecisionFromPair(
  pair: DecisionPair,
  direction: DecisionDirection,
  strength: DecisionStrength,
  normalizationApplied: boolean,
  source: DecisionSource,
): CanonicalDecision {
  if (direction === 'neutral') {
    return {
      favoredValueKey: null,
      opposedValueKey: null,
      direction,
      strength,
      normalizationApplied,
      normalizationReason: normalizationApplied ? 'orientation_flipped' : null,
      source,
    };
  }

  if (direction === 'favor_first') {
    return {
      favoredValueKey: pair.valueA,
      opposedValueKey: pair.valueB,
      direction,
      strength,
      normalizationApplied,
      normalizationReason: normalizationApplied ? 'orientation_flipped' : null,
      source,
    };
  }

  if (direction === 'favor_second') {
    return {
      favoredValueKey: pair.valueB,
      opposedValueKey: pair.valueA,
      direction,
      strength,
      normalizationApplied,
      normalizationReason: normalizationApplied ? 'orientation_flipped' : null,
      source,
    };
  }

  return buildUnknownCanonicalDecision(source);
}

export function validateManualAppliedDecision(
  pair: DecisionPair,
  appliedDecision: unknown,
): { ok: true; canonical: CanonicalDecision } | { ok: false } {
  if (!isCanonicalAppliedDecision(appliedDecision)) {
    return { ok: false };
  }

  const decision = appliedDecision;
  const validKnownPair =
    (decision.direction === 'neutral' &&
      decision.strength === 'neutral' &&
      decision.favoredValueKey === null &&
      decision.opposedValueKey === null) ||
    (decision.direction === 'unknown' &&
      decision.strength === 'unknown' &&
      decision.favoredValueKey === null &&
      decision.opposedValueKey === null) ||
    (decision.direction === 'favor_first' &&
      decision.strength !== 'unknown' &&
      decision.strength !== 'neutral' &&
      decision.favoredValueKey === pair.valueA &&
      decision.opposedValueKey === pair.valueB) ||
    (decision.direction === 'favor_second' &&
      decision.strength !== 'unknown' &&
      decision.strength !== 'neutral' &&
      decision.favoredValueKey === pair.valueB &&
      decision.opposedValueKey === pair.valueA);

  if (!validKnownPair) {
    return { ok: false };
  }

  return {
    ok: true,
    canonical: {
      favoredValueKey: decision.favoredValueKey,
      opposedValueKey: decision.opposedValueKey,
      direction: decision.direction,
      strength: decision.strength,
      normalizationApplied: false,
      normalizationReason: null,
      source: 'manual',
    },
  };
}

export function extractManualOverrideDecision(
  decisionMetadata: unknown,
): CanonicalAppliedDecision | null {
  const record = isRecord(decisionMetadata) ? decisionMetadata : null;
  const manualOverride = record && isRecord(record.manualOverride) ? record.manualOverride : null;
  if (!manualOverride || !isCanonicalAppliedDecision(manualOverride.appliedDecision)) {
    return null;
  }
  return manualOverride.appliedDecision;
}

export function extractCachedWinnerFirstDecision(
  decisionMetadata: unknown,
): CachedWinnerFirstDecision | null {
  const record = isRecord(decisionMetadata) ? decisionMetadata : null;
  const summaryCache = record && isRecord(record.summaryCache) ? record.summaryCache : null;
  const summary = summaryCache && isRecord(summaryCache.summary) ? summaryCache.summary : null;
  const canonicalDecision = summary && isCachedWinnerFirstDecision(summary.canonicalDecision)
    ? summary.canonicalDecision
    : null;

  return canonicalDecision;
}

export function extractValueStatementsFromSnapshot(snapshot: unknown): ValueStatementEntry[] | undefined {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return undefined;
  const components = (snapshot as { components?: unknown }).components;
  if (components === null || typeof components !== 'object' || Array.isArray(components)) return undefined;

  const vf = (components as { value_first?: unknown }).value_first;
  const vs = (components as { value_second?: unknown }).value_second;
  if (!isRecord(vf) || !isRecord(vs)) return undefined;

  const tokenFirst = typeof vf.token === 'string' ? vf.token : null;
  const bodyFirst = typeof vf.body === 'string' ? vf.body : null;
  const tokenSecond = typeof vs.token === 'string' ? vs.token : null;
  const bodySecond = typeof vs.body === 'string' ? vs.body : null;

  if (tokenFirst == null || bodyFirst == null || tokenSecond == null || bodySecond == null) return undefined;
  return [
    { token: tokenFirst, body: bodyFirst },
    { token: tokenSecond, body: bodySecond },
  ];
}

const LABEL_PREFIX_REGEX = /^(?:Strongly|Somewhat) support (.+)$/;

export function extractLabelPrefixFromSnapshot(snapshot: unknown): string | undefined {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return undefined;
  const template = (snapshot as { template?: unknown }).template;
  if (typeof template !== 'string') return undefined;

  const components = (snapshot as { components?: unknown }).components;
  if (components === null || typeof components !== 'object' || Array.isArray(components)) return undefined;
  const vf = (components as { value_first?: unknown }).value_first;
  if (!isRecord(vf) || typeof vf.body !== 'string') return undefined;

  // Extract the short body (before "because") to find it in the scale label
  const shortBody = (vf.body.split(' because')[0] ?? vf.body).trim();
  if (shortBody.length === 0) return undefined;

  // Find a scale label line that ends with the short body
  const lines = template.split('\n');
  for (const line of lines) {
    const trimmed = line.replace(/^- /, '').trim();
    const match = LABEL_PREFIX_REGEX.exec(trimmed);
    if (match == null) continue;
    const afterStrength = match[1] ?? '';
    if (afterStrength.endsWith(shortBody)) {
      const prefix = afterStrength.slice(0, afterStrength.length - shortBody.length).trimEnd();
      if (prefix.length > 0) return prefix;
    }
  }

  return undefined;
}
