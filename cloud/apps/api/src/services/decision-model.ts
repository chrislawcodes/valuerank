import { config } from '../config.js';
import {
  resolveTranscriptDecisionModel,
  type CanonicalDecision,
  type DecisionModelResult,
  type TranscriptDecisionModelInput,
} from '../graphql/queries/domain/shared.js';

type DecisionValueOutcome = 'prioritized' | 'deprioritized' | 'neutral';

function parseLegacyDecisionCode(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }

  return parsed;
}

function buildValueOutcomesFromCanonical(
  canonical: CanonicalDecision,
  valueA: string | null,
  valueB: string | null,
): Record<string, DecisionValueOutcome> | undefined {
  if (valueA === null || valueB === null) {
    return undefined;
  }

  if (canonical.direction === 'neutral') {
    return {
      [valueA]: 'neutral',
      [valueB]: 'neutral',
    };
  }

  if (canonical.direction === 'favor_first') {
    return {
      [valueA]: 'prioritized',
      [valueB]: 'deprioritized',
    };
  }

  if (canonical.direction === 'favor_second') {
    return {
      [valueA]: 'deprioritized',
      [valueB]: 'prioritized',
    };
  }

  return undefined;
}

function buildValueOutcomesFromScore(
  score: number | null,
  orientationFlipped: boolean,
  valueA: string | null,
  valueB: string | null,
): Record<string, DecisionValueOutcome> | undefined {
  if (score === null || valueA === null || valueB === null) {
    return undefined;
  }

  const normalizedScore = orientationFlipped ? 6 - score : score;

  if (normalizedScore >= 4) {
    return {
      [valueA]: 'prioritized',
      [valueB]: 'deprioritized',
    };
  }

  if (normalizedScore <= 2) {
    return {
      [valueA]: 'deprioritized',
      [valueB]: 'prioritized',
    };
  }

  return {
    [valueA]: 'neutral',
    [valueB]: 'neutral',
  };
}

export function resolveAnalysisDecisionModel(
  input: TranscriptDecisionModelInput,
  useDecisionModelV2: boolean = config.DECISION_MODEL_V2,
): DecisionModelResult | null {
  if (!useDecisionModelV2) {
    return null;
  }

  return resolveTranscriptDecisionModel(input);
}

export function resolveAnalysisScore(
  input: TranscriptDecisionModelInput,
  useDecisionModelV2: boolean = config.DECISION_MODEL_V2,
): number | null {
  const legacyScore = parseLegacyDecisionCode(input.decisionCode);

  if (!useDecisionModelV2) {
    return legacyScore;
  }

  const decisionModel = resolveTranscriptDecisionModel(input);
  return decisionModel.legacy.canonicalScore ?? decisionModel.legacy.rawScore ?? legacyScore;
}

export function resolveAnalysisValueOutcomes(
  input: TranscriptDecisionModelInput,
  valueA: string | null,
  valueB: string | null,
  useDecisionModelV2: boolean = config.DECISION_MODEL_V2,
): Record<string, DecisionValueOutcome> | undefined {
  const legacyScore = parseLegacyDecisionCode(input.decisionCode);

  if (!useDecisionModelV2) {
    return buildValueOutcomesFromScore(
      legacyScore,
      Boolean(input.orientationFlipped),
      valueA,
      valueB,
    );
  }

  const decisionModel = resolveTranscriptDecisionModel(input);
  const canonicalOutcomes = buildValueOutcomesFromCanonical(
    decisionModel.canonical,
    valueA,
    valueB,
  );

  if (canonicalOutcomes !== undefined) {
    return canonicalOutcomes;
  }

  return buildValueOutcomesFromScore(
    decisionModel.legacy.canonicalScore ?? decisionModel.legacy.rawScore ?? legacyScore,
    Boolean(input.orientationFlipped),
    valueA,
    valueB,
  );
}
