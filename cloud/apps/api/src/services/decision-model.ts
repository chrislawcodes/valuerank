import { config } from '../config.js';
import {
  resolveTranscriptDecisionModel,
  type CanonicalDecision,
  type DecisionModelResult,
  type TranscriptDecisionModelInput,
} from '../graphql/queries/domain/shared.js';

type DecisionValueOutcome = 'prioritized' | 'deprioritized' | 'neutral';

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

export function resolveAnalysisDecisionModel(
  input: TranscriptDecisionModelInput,
  useDecisionModelV2: boolean = config.DECISION_MODEL_V2,
): DecisionModelResult | null {
  if (!useDecisionModelV2) {
    return null;
  }

  return resolveTranscriptDecisionModel(input);
}

export function resolveAnalysisValueOutcomes(
  input: TranscriptDecisionModelInput,
  valueA: string | null,
  valueB: string | null,
  useDecisionModelV2: boolean = config.DECISION_MODEL_V2,
): Record<string, DecisionValueOutcome> | undefined {
  const decisionModel = resolveTranscriptDecisionModel(input);
  const canonicalOutcomes = buildValueOutcomesFromCanonical(
    decisionModel.canonical,
    valueA,
    valueB,
  );

  if (canonicalOutcomes !== undefined) {
    return canonicalOutcomes;
  }

  return undefined;
}
