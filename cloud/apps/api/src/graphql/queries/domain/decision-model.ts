import { DOMAIN_ANALYSIS_VALUE_KEYS, extractValuePair, toPascalCaseKey, type DomainAnalysisValueKey, type DomainAnalysisValuePair } from '../domain-analysis-values.js';
import { JOB_CHOICE_VALUE_STATEMENTS, labelFromBody } from '@valuerank/shared';

export type DecisionDirection = 'favor_first' | 'favor_second' | 'neutral' | 'refusal' | 'unknown';
export type DecisionStrength = 'strong' | 'lean' | 'neutral' | 'unknown';
export type DecisionSource = 'deterministic' | 'manual' | 'error' | 'unknown';

export type CanonicalAppliedDecision = {
  favoredValueKey: DomainAnalysisValueKey | null;
  opposedValueKey: DomainAnalysisValueKey | null;
  direction: DecisionDirection;
  strength: DecisionStrength;
};

export type RawDecisionEvidence = {
  matchedText: string | null;
  matchedLabel: string | null;
  parseClass: 'exact' | 'fallback_resolved' | 'ambiguous' | 'unparseable' | null;
  parsePath: string | null;
  parserVersion: string | null;
  responseExcerpt: string | null;
  manualOverride: {
    previousValue: string | null;
    overriddenAt: string | null;
    overriddenByUserId: string | null;
  } | null;
};

export type CanonicalDecision = {
  favoredValueKey: DomainAnalysisValueKey | null;
  opposedValueKey: DomainAnalysisValueKey | null;
  direction: DecisionDirection;
  strength: DecisionStrength;
  normalizationApplied: boolean;
  normalizationReason: 'orientation_flipped' | null;
  source: DecisionSource;
};

export type DecisionReadSurface = 'api' | 'web' | 'worker' | 'export';
export type DecisionReadMode = 'v1' | 'v2';
export type DecisionReadRule = {
  surface: DecisionReadSurface;
  defaultMode: DecisionReadMode;
  fallbackLayer: 'server_adapter' | 'none';
};

export const DECISION_MODEL_READ_RULES: Record<DecisionReadSurface, DecisionReadRule> = {
  api: {
    surface: 'api',
    defaultMode: 'v1',
    fallbackLayer: 'server_adapter',
  },
  web: {
    surface: 'web',
    defaultMode: 'v1',
    fallbackLayer: 'none',
  },
  worker: {
    surface: 'worker',
    defaultMode: 'v1',
    fallbackLayer: 'server_adapter',
  },
  export: {
    surface: 'export',
    defaultMode: 'v1',
    fallbackLayer: 'server_adapter',
  },
} as const;

export type DecisionPair = {
  valueA: DomainAnalysisValueKey;
  valueB: DomainAnalysisValueKey;
};

export type DecisionModelInput = {
  pair: DecisionPair | null;
  orientationFlipped: boolean | null | undefined;
  raw: RawDecisionEvidence;
  manualOverridePresent?: boolean;
  manualOverrideDecision?: CanonicalAppliedDecision | null;
  cachedDecision?: CachedWinnerFirstDecision | null;
};

export type DecisionModelResult = {
  raw: RawDecisionEvidence;
  canonical: CanonicalDecision;
};

export type TranscriptDecisionModelInput = {
  decisionCode: string | null;
  decisionMetadata: unknown;
  /** Supply definitionSnapshot OR pairOverride — pairOverride takes precedence if both provided */
  definitionSnapshot?: unknown;
  orientationFlipped: boolean | null | undefined;
  /** Pre-resolved value pair; avoids fetching definitionSnapshot from DB when pair is already known */
  pairOverride?: DomainAnalysisValuePair | null;
};

export type TranscriptDecisionModelResult = DecisionModelResult;

type ParsedDecisionPath = {
  branch: 'exact' | 'fallback' | 'manual';
  direction: DecisionDirection;
  strength: DecisionStrength;
};

type CachedWinnerFirstDecision = {
  cacheVersion: 1;
  decisionState: 'resolved' | 'neutral' | 'unknown';
  favoredValueKey: DomainAnalysisValueKey | null;
  strength: DecisionStrength;
};

function isValueKey(value: string): value is DomainAnalysisValueKey {
  return (DOMAIN_ANALYSIS_VALUE_KEYS as readonly string[]).includes(value);
}

function isDecisionDirection(value: unknown): value is DecisionDirection {
  return value === 'favor_first' || value === 'favor_second' || value === 'neutral' || value === 'refusal' || value === 'unknown';
}

function isDecisionStrength(value: unknown): value is DecisionStrength {
  return value === 'strong' || value === 'lean' || value === 'neutral' || value === 'unknown';
}

function isCanonicalAppliedDecision(value: unknown): value is CanonicalAppliedDecision {
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

function isCachedWinnerFirstDecision(value: unknown): value is CachedWinnerFirstDecision {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidDecisionPair(pair: DecisionPair | null | undefined): pair is DecisionPair {
  if (pair === null || pair === undefined) {
    return false;
  }

  return (
    isValueKey(pair.valueA) &&
    isValueKey(pair.valueB) &&
    pair.valueA !== pair.valueB
  );
}

function parseDecisionPath(parsePath: string | null | undefined): ParsedDecisionPath | null {
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

function isJobChoiceDecisionPath(parsePath: string | null | undefined): boolean {
  return typeof parsePath === 'string' && (
    parsePath.startsWith('numeric_')
    || parsePath.startsWith('text_label_')
  );
}

function flipDirection(direction: DecisionDirection): DecisionDirection {
  if (direction === 'favor_first') return 'favor_second';
  if (direction === 'favor_second') return 'favor_first';
  return direction;
}

function normalizeJobChoiceLabelText(text: string): string {
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

function parseJobChoiceStrengthFromText(text: string): DecisionStrength | null {
  const normalized = normalizeJobChoiceLabelText(text);
  if (normalized.startsWith('strongly support')) return 'strong';
  if (normalized.startsWith('somewhat support')) return 'lean';
  if (normalized.startsWith('neutral')) return 'neutral';
  return null;
}

function resolveJobChoiceValueKeyFromText(text: string): DomainAnalysisValueKey | null {
  const normalized = normalizeJobChoiceLabelText(text);
  if (normalized.length === 0) {
    return null;
  }

  let resolved: DomainAnalysisValueKey | null = null;
  for (const entry of JOB_CHOICE_VALUE_STATEMENTS) {
    const valueKey = toPascalCaseKey(entry.token) as DomainAnalysisValueKey;
    const label = normalizeJobChoiceLabelText(labelFromBody(entry.body));
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

function buildUnknownCanonicalDecision(source: DecisionSource): CanonicalDecision {
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

function canonicalDecisionScoreFromDirectionStrength(
  direction: DecisionDirection,
  strength: DecisionStrength,
): 1 | 2 | 3 | 4 | 5 | null {
  if (direction === 'favor_first' && strength === 'strong') return 5;
  if (direction === 'favor_first' && strength === 'lean') return 4;
  if (direction === 'neutral' && strength === 'neutral') return 3;
  if (direction === 'favor_second' && strength === 'lean') return 2;
  if (direction === 'favor_second' && strength === 'strong') return 1;
  return null;
}
function buildCanonicalDecisionFromPair(
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

export function canonicalDecisionToLegacyScore(
  decision: Pick<CanonicalDecision, 'direction' | 'strength'>,
): 1 | 2 | 3 | 4 | 5 | null {
  return canonicalDecisionScoreFromDirectionStrength(decision.direction, decision.strength);
}

function validateManualAppliedDecision(
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

function extractManualOverrideDecision(
  decisionMetadata: unknown,
): CanonicalAppliedDecision | null {
  const record = isRecord(decisionMetadata) ? decisionMetadata : null;
  const manualOverride = record && isRecord(record.manualOverride) ? record.manualOverride : null;
  if (!manualOverride || !isCanonicalAppliedDecision(manualOverride.appliedDecision)) {
    return null;
  }
  return manualOverride.appliedDecision;
}

function extractCachedWinnerFirstDecision(
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

export function buildRawDecisionEvidence(
  decisionMetadata: unknown,
): RawDecisionEvidence {
  const record = isRecord(decisionMetadata) ? decisionMetadata : null;
  const manualOverride = record && isRecord(record.manualOverride) ? record.manualOverride : null;
  return {
    matchedText:
      record && typeof record.matchedText === 'string'
        ? record.matchedText
        : record && typeof record.matchedLabel === 'string'
          ? record.matchedLabel
          : record && typeof record.responseExcerpt === 'string'
            ? record.responseExcerpt
            : null,
    matchedLabel: record && typeof record.matchedLabel === 'string' ? record.matchedLabel : null,
    parseClass:
      record && (record.parseClass === 'exact' || record.parseClass === 'fallback_resolved' || record.parseClass === 'ambiguous' || record.parseClass === 'unparseable')
        ? record.parseClass
        : null,
    parsePath: record && typeof record.parsePath === 'string' ? record.parsePath : null,
    parserVersion: record && typeof record.parserVersion === 'string' ? record.parserVersion : null,
    responseExcerpt: record && typeof record.responseExcerpt === 'string' ? record.responseExcerpt : null,
    manualOverride:
      manualOverride === null
        ? null
        : {
            previousValue:
              typeof manualOverride.previousValue === 'string'
                ? manualOverride.previousValue
                : typeof manualOverride.previousDecisionCode === 'string'
                  ? manualOverride.previousDecisionCode
                : null,
            overriddenAt:
              typeof manualOverride.overriddenAt === 'string'
                ? manualOverride.overriddenAt
                : null,
            overriddenByUserId:
              typeof manualOverride.overriddenByUserId === 'string'
                ? manualOverride.overriddenByUserId
                : null,
          },
  };
}

export function resolveTranscriptDecisionModel(
  input: TranscriptDecisionModelInput,
): TranscriptDecisionModelResult {
  const pair = input.pairOverride !== undefined ? input.pairOverride : extractValuePair(input.definitionSnapshot);
  const raw = buildRawDecisionEvidence(input.decisionMetadata);
  const manualOverrideDecision = extractManualOverrideDecision(input.decisionMetadata);
  const cachedDecision = extractCachedWinnerFirstDecision(input.decisionMetadata);
  const resolved = resolveDecisionModel({
    pair,
    orientationFlipped: input.orientationFlipped,
    raw,
    manualOverridePresent: manualOverrideDecision !== null,
    manualOverrideDecision,
    cachedDecision,
  });

  return resolved;
}

export function resolveCanonicalDecision(input: DecisionModelInput): CanonicalDecision {
  const pair = isValidDecisionPair(input.pair) ? input.pair : null;
  if (!pair) {
    return input.pair == null ? buildUnknownCanonicalDecision('unknown') : buildUnknownCanonicalDecision('error');
  }

  if (input.manualOverridePresent) {
    const validated = validateManualAppliedDecision(pair, input.manualOverrideDecision);
    if (!validated.ok) {
      return buildUnknownCanonicalDecision('error');
    }
    return validated.canonical;
  }

  const parseClass = input.raw.parseClass;
  if (parseClass !== 'exact' && parseClass !== 'fallback_resolved') {
    return buildUnknownCanonicalDecision('unknown');
  }

  const parsedPath = parseDecisionPath(input.raw.parsePath);
  const cachedDecision = input.cachedDecision ?? null;
  if (cachedDecision) {
    if (cachedDecision.decisionState === 'unknown') {
      return buildUnknownCanonicalDecision('unknown');
    }

    if (cachedDecision.decisionState === 'neutral') {
      return buildCanonicalDecisionFromPair(
        pair,
        'neutral',
        'neutral',
        false,
        'deterministic',
      );
    }

    if (
      cachedDecision.favoredValueKey == null
      || (cachedDecision.favoredValueKey !== pair.valueA && cachedDecision.favoredValueKey !== pair.valueB)
      || cachedDecision.strength === 'unknown'
      || cachedDecision.strength === 'neutral'
    ) {
      return buildUnknownCanonicalDecision('unknown');
    }

    const direction: DecisionDirection = cachedDecision.favoredValueKey === pair.valueA ? 'favor_first' : 'favor_second';
    const opposedValueKey = cachedDecision.favoredValueKey === pair.valueA ? pair.valueB : pair.valueA;

    return {
      favoredValueKey: cachedDecision.favoredValueKey,
      opposedValueKey,
      direction,
      strength: cachedDecision.strength,
      normalizationApplied: false,
      normalizationReason: null,
      source: 'deterministic',
    };
  }

  if (
    input.raw.parserVersion === 'job-choice-v2'
    && isJobChoiceDecisionPath(input.raw.parsePath)
  ) {
    const candidateText = input.raw.matchedLabel ?? input.raw.matchedText ?? input.raw.responseExcerpt;
    if (typeof candidateText !== 'string') {
      return buildUnknownCanonicalDecision('unknown');
    }

    const strength = parseJobChoiceStrengthFromText(candidateText);
    if (strength === null) {
      return buildUnknownCanonicalDecision('unknown');
    }
    if (strength === 'neutral') {
      return buildCanonicalDecisionFromPair(
        pair,
        'neutral',
        'neutral',
        false,
        'deterministic',
      );
    }

    const favoredValueKey = resolveJobChoiceValueKeyFromText(candidateText);
    if (favoredValueKey === null) {
      return buildUnknownCanonicalDecision('unknown');
    }
    if (favoredValueKey !== pair.valueA && favoredValueKey !== pair.valueB) {
      return buildUnknownCanonicalDecision('unknown');
    }

    const direction: DecisionDirection = favoredValueKey === pair.valueA ? 'favor_first' : 'favor_second';
    const opposedValueKey = favoredValueKey === pair.valueA ? pair.valueB : pair.valueA;

    return {
      favoredValueKey,
      opposedValueKey,
      direction,
      strength,
      normalizationApplied: false,
      normalizationReason: null,
      source: 'deterministic',
    };
  }

  if (input.orientationFlipped == null) {
    return buildUnknownCanonicalDecision('unknown');
  }

  if (!parsedPath || parsedPath.branch === 'manual') {
    return buildUnknownCanonicalDecision('unknown');
  }

  if (parsedPath.direction === 'unknown' || parsedPath.strength === 'unknown') {
    return buildUnknownCanonicalDecision('unknown');
  }

  const matchedLabel = input.raw.matchedLabel;
  if (typeof matchedLabel !== 'string' || !isValueKey(matchedLabel)) {
    return buildUnknownCanonicalDecision('unknown');
  }
  if (matchedLabel !== pair.valueA && matchedLabel !== pair.valueB) {
    return buildUnknownCanonicalDecision('unknown');
  }

  const normalizedDirection = input.orientationFlipped ? flipDirection(parsedPath.direction) : parsedPath.direction;
  const normalizationApplied = Boolean(input.orientationFlipped && normalizedDirection !== parsedPath.direction);

  return buildCanonicalDecisionFromPair(
    pair,
    normalizedDirection,
    parsedPath.strength,
    normalizationApplied,
    'deterministic',
  );
}
export function resolveDecisionModel(input: DecisionModelInput): DecisionModelResult {
  const canonical = resolveCanonicalDecision(input);
  return {
    raw: input.raw,
    canonical,
  };
}
