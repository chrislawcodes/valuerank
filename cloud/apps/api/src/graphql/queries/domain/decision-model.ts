import { extractValuePair } from '../domain-analysis-values.js';
import {
  isValidDecisionPair,
  isValueKey,
  parseDecisionPath,
  isJobChoiceDecisionPath,
  flipDirection,
  parseJobChoiceStrengthFromText,
  resolveValueKeyFromText,
  buildUnknownCanonicalDecision,
  buildCanonicalDecisionFromPair,
  validateManualAppliedDecision,
  extractManualOverrideDecision,
  extractCachedWinnerFirstDecision,
  extractValueStatementsFromSnapshot,
  extractLabelPrefixFromSnapshot,
  JOB_CHOICE_VALUE_STATEMENTS,
} from './decision-model-helpers.js';
import { isRecord } from '../../../utils/isRecord.js';

// Re-export all types for backward compatibility
export type {
  DecisionDirection,
  DecisionStrength,
  DecisionSource,
  CanonicalAppliedDecision,
  RawDecisionEvidence,
  CanonicalDecision,
  DecisionReadSurface,
  DecisionReadMode,
  DecisionReadRule,
  DecisionPair,
  ValueStatementEntry,
  DecisionModelInput,
  DecisionModelResult,
  TranscriptDecisionModelInput,
  TranscriptDecisionModelResult,
} from './decision-model-types.js';
export { DECISION_MODEL_READ_RULES } from './decision-model-types.js';

import type {
  RawDecisionEvidence,
  CanonicalDecision,
  DecisionDirection,
  DecisionModelInput,
  DecisionModelResult,
  TranscriptDecisionModelInput,
  TranscriptDecisionModelResult,
} from './decision-model-types.js';

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
    refusal: record ? record.refusal === true : false,
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

  const valueStatements = extractValueStatementsFromSnapshot(input.definitionSnapshot);
  const labelPrefix = extractLabelPrefixFromSnapshot(input.definitionSnapshot) ?? null;

  const resolved = resolveDecisionModel({
    pair,
    orientationFlipped: input.orientationFlipped,
    raw,
    manualOverridePresent: manualOverrideDecision !== null,
    manualOverrideDecision,
    cachedDecision,
    valueStatements,
    labelPrefix,
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

  // First-class refusal signal from the Python worker (A9). Takes precedence
  // over everything except manual overrides, so refusals never fall through
  // to unknown just because parseClass is null or the parser path isn't exact.
  if (input.raw.refusal) {
    return {
      favoredValueKey: null,
      opposedValueKey: null,
      direction: 'refusal',
      strength: 'unknown',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'deterministic',
    };
  }

  const parseClass = input.raw.parseClass;
  if (parseClass !== 'exact' && parseClass !== 'fallback_resolved') {
    return buildUnknownCanonicalDecision('unknown');
  }

  const parsedPath = parseDecisionPath(input.raw.parsePath);
  const cachedDecision = input.cachedDecision ?? null;
  if (
    cachedDecision
    && cachedDecision.decisionState !== 'unknown'
    && cachedDecision.decisionState !== 'parse_failed'
  ) {
    // When cachedDecision.decisionState is 'unknown' or 'parse_failed', skip
    // the cache and fall through to re-resolve from raw evidence. Both states
    // signal "no decision recovered" — re-resolving may succeed if the cache
    // was built with incorrect config (wrong value statements or label prefix)
    // or if the parser was upgraded after the empty-response was recorded.

    if (cachedDecision.decisionState === 'neutral') {
      return buildCanonicalDecisionFromPair(
        pair,
        'neutral',
        'neutral',
        false,
        'deterministic',
      );
    }

    // Refusal cached rows: return refusal directly. Symmetric to the neutral
    // special-case above. Without this, refusal cached rows fall into the
    // null-key check below and get returned as unknown, losing the signal.
    if (cachedDecision.decisionState === 'refusal') {
      return {
        favoredValueKey: null,
        opposedValueKey: null,
        direction: 'refusal',
        strength: 'unknown',
        normalizationApplied: false,
        normalizationReason: null,
        source: 'deterministic',
      };
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
    (input.raw.parserVersion === 'job-choice-v2' || input.raw.parserVersion === 'paired-v2')
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

    // When the caller supplies pairOverride without a definitionSnapshot (e.g. domain-analysis
    // aggregation paths), valueStatements is undefined. For job-choice-v2 transcripts, fall back
    // to the global JOB_CHOICE_VALUE_STATEMENTS so all 10 values resolve correctly.
    const effectiveValueStatements = (input.valueStatements != null && input.valueStatements.length > 0)
      ? input.valueStatements
      : (input.raw.parserVersion === 'job-choice-v2' ? JOB_CHOICE_VALUE_STATEMENTS : undefined);
    const favoredValueKey = resolveValueKeyFromText(candidateText, effectiveValueStatements, input.labelPrefix ?? null);
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
