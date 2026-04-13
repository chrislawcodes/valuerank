import type { DomainAnalysisValueKey } from '../domain-analysis-values.js';
import { DOMAIN_ANALYSIS_VALUE_KEYS } from '../domain-analysis-values.js';
import { resolveTranscriptDecisionModel } from './decision-model.js';
import type {
  DomainAnalysisValueCounts,
  DomainAnalysisValuePair,
} from './shared.js';

function incrementValueCount(
  modelMap: Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>,
  valueKey: DomainAnalysisValueKey,
  field: 'prioritized' | 'deprioritized' | 'neutral',
): void {
  const current = modelMap.get(valueKey) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
  current[field] += 1;
  modelMap.set(valueKey, current);
}

export function incrementPairwiseWin(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
  winner: DomainAnalysisValueKey,
  loser: DomainAnalysisValueKey,
): void {
  const winnerMap = pairwiseWins.get(winner) ?? new Map<DomainAnalysisValueKey, number>();
  winnerMap.set(loser, (winnerMap.get(loser) ?? 0) + 1);
  pairwiseWins.set(winner, winnerMap);
}

export function isDomainAnalysisValueKey(value: string): value is DomainAnalysisValueKey {
  return DOMAIN_ANALYSIS_VALUE_KEYS.includes(value as DomainAnalysisValueKey);
}

export function aggregateValueCountsFromTranscripts(
  transcripts: Array<{
    runId: string;
    modelId: string;
    decisionCode: string | null;
    decisionMetadata: unknown;
    scenario: { orientationFlipped: boolean | null } | null;
  }>,
  sourceRunDefinitionById: Map<string, string>,
  valuePairByDefinition: Map<string, DomainAnalysisValuePair>,
): {
  aggregatedByModel: Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>;
  pairwiseWinsByModel: Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>;
  analyzedDefinitionIds: Set<string>;
} {
  const aggregatedByModel = new Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>();
  const pairwiseWinsByModel = new Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>();
  const analyzedDefinitionIds = new Set<string>();

  for (const transcript of transcripts) {
    const definitionId = sourceRunDefinitionById.get(transcript.runId);
    if (definitionId == null || definitionId === '') continue;
    const pair = valuePairByDefinition.get(definitionId);
    if (!pair) continue;

    const resolved = resolveTranscriptDecisionModel({
      decisionCode: transcript.decisionCode,
      decisionMetadata: transcript.decisionMetadata,
      orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
      pairOverride: pair,
    });
    const canonical = resolved.canonical;
    if (canonical.direction === 'unknown') continue;

    let valueMap = aggregatedByModel.get(transcript.modelId);
    if (!valueMap) {
      valueMap = new Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>();
      aggregatedByModel.set(transcript.modelId, valueMap);
    }

    let pairwiseWins = pairwiseWinsByModel.get(transcript.modelId);
    if (!pairwiseWins) {
      pairwiseWins = new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>();
      pairwiseWinsByModel.set(transcript.modelId, pairwiseWins);
    }

    if (
      canonical.direction !== 'neutral'
      && canonical.favoredValueKey != null
      && canonical.opposedValueKey != null
    ) {
      incrementValueCount(valueMap, canonical.favoredValueKey, 'prioritized');
      incrementValueCount(valueMap, canonical.opposedValueKey, 'deprioritized');
      incrementPairwiseWin(pairwiseWins, canonical.favoredValueKey, canonical.opposedValueKey);
    } else {
      incrementValueCount(valueMap, pair.valueA, 'neutral');
      incrementValueCount(valueMap, pair.valueB, 'neutral');
    }

    analyzedDefinitionIds.add(definitionId);
  }

  return { aggregatedByModel, pairwiseWinsByModel, analyzedDefinitionIds };
}
