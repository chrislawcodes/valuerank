import { computePairwiseWinRate } from '../../utils/pairwise-math.js';
import {
  DOMAIN_ANALYSIS_VALUE_KEYS,
  type DomainAnalysisValueKey,
} from '../../graphql/queries/domain-analysis-values.js';
import type { DomainAnalysisValueCounts } from '../../graphql/queries/domain/shared.js';
import { decodeCellKey, type CellCounts } from './transcript-cell-accumulator.js';
import { aggregateValueWinRates } from './value-win-rate-aggregation.js';

const SNAPSHOT_DOMAIN_ID = '__snapshot_domain__';

export type CellWeightedDomainModel = {
  model: string;
  counts: Record<string, DomainAnalysisValueCounts>;
  pairwiseWins: Record<string, Record<string, number>>;
  valueWinRates: Record<string, number>;
  vignetteCount: Record<string, number>;
};

function toCountsRecord(valueMap: Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>): Record<string, DomainAnalysisValueCounts> {
  const record: Record<string, DomainAnalysisValueCounts> = {};
  for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
    record[valueKey] = valueMap.get(valueKey) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  return record;
}

function toPairwiseRecord(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
): Record<string, Record<string, number>> {
  const record: Record<string, Record<string, number>> = {};
  for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
    const winnerMap = pairwiseWins.get(valueKey) ?? new Map<DomainAnalysisValueKey, number>();
    record[valueKey] = Object.fromEntries(Array.from(winnerMap.entries()).map(([opponent, count]) => [opponent, count]));
  }
  return record;
}

function addPairwiseWin(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
  winner: DomainAnalysisValueKey,
  loser: DomainAnalysisValueKey,
  count: number,
): void {
  if (count <= 0) return;
  const winnerMap = pairwiseWins.get(winner) ?? new Map<DomainAnalysisValueKey, number>();
  winnerMap.set(loser, (winnerMap.get(loser) ?? 0) + count);
  pairwiseWins.set(winner, winnerMap);
}

function getOrCreateCounts(
  countsByModel: Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>,
  modelId: string,
  valueKey: DomainAnalysisValueKey,
): DomainAnalysisValueCounts {
  const modelCounts = countsByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>();
  if (!countsByModel.has(modelId)) {
    countsByModel.set(modelId, modelCounts);
  }
  const existing = modelCounts.get(valueKey) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
  modelCounts.set(valueKey, existing);
  return existing;
}

function getOrCreatePairwise(
  pairwiseByModel: Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>,
  modelId: string,
): Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>> {
  const existing = pairwiseByModel.get(modelId);
  if (existing !== undefined) return existing;
  const created = new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>();
  pairwiseByModel.set(modelId, created);
  return created;
}

export function computeCellWeightedDomainRates(params: {
  cellMap: Map<string, CellCounts>;
  filteredSourceRunDefinitionById: Map<string, string>;
  definitionValuePairById: Map<string, { valueA: DomainAnalysisValueKey; valueB: DomainAnalysisValueKey; valueFirst?: DomainAnalysisValueKey }>;
}): { models: CellWeightedDomainModel[]; analyzedDefinitionIds: Set<string> } {
  const countsByModel = new Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>();
  const pairwiseWinsByModel = new Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>();
  const ratesByModelDefinitionValue = new Map<string, Map<string, Map<DomainAnalysisValueKey, number[]>>>();
  const analyzedDefinitionIds = new Set<string>();
  const modelsById = new Set<string>();

  for (const [encodedKey, counts] of params.cellMap.entries()) {
    let decoded;
    try {
      decoded = decodeCellKey(encodedKey);
    } catch {
      continue;
    }

    modelsById.add(decoded.modelId);

    const modelCounts = getOrCreateCounts(countsByModel, decoded.modelId, decoded.valueKey);
    modelCounts.prioritized += counts.wins;
    modelCounts.deprioritized += counts.losses;
    modelCounts.neutral += counts.neutrals;

    const rate = computePairwiseWinRate(counts.wins, counts.losses, counts.neutrals);
    if (rate === null) continue;

    analyzedDefinitionIds.add(decoded.definitionId);

    const modelDefinitionRates = ratesByModelDefinitionValue.get(decoded.modelId) ?? new Map<string, Map<DomainAnalysisValueKey, number[]>>();
    if (!ratesByModelDefinitionValue.has(decoded.modelId)) {
      ratesByModelDefinitionValue.set(decoded.modelId, modelDefinitionRates);
    }
    const valueRatesByDefinition = modelDefinitionRates.get(decoded.definitionId) ?? new Map<DomainAnalysisValueKey, number[]>();
    if (!modelDefinitionRates.has(decoded.definitionId)) {
      modelDefinitionRates.set(decoded.definitionId, valueRatesByDefinition);
    }
    const rates = valueRatesByDefinition.get(decoded.valueKey) ?? [];
    rates.push(rate);
    valueRatesByDefinition.set(decoded.valueKey, rates);

    if (counts.wins <= 0) continue;
    const pair = params.definitionValuePairById.get(decoded.definitionId);
    if (pair == null) continue;

    const pairwiseWins = getOrCreatePairwise(pairwiseWinsByModel, decoded.modelId);
    const opponentValueKey = decoded.valueKey === pair.valueA ? pair.valueB : pair.valueA;
    addPairwiseWin(pairwiseWins, decoded.valueKey, opponentValueKey, counts.wins);
  }

  const models = Array.from(modelsById.values())
    .map((modelId) => {
      const valueCounts = countsByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>();
      const modelDefinitionRates = ratesByModelDefinitionValue.get(modelId) ?? new Map<string, Map<DomainAnalysisValueKey, number[]>>();
      const inputs = [];

      for (const [definitionId, valueRatesByDefinition] of modelDefinitionRates.entries()) {
        const pair = params.definitionValuePairById.get(definitionId);
        if (pair == null) continue;
        const pairKey = `${pair.valueA}::${pair.valueB}`;
        const directionKey: DomainAnalysisValueKey = pair.valueFirst ?? pair.valueA;

        for (const [valueKey, rates] of valueRatesByDefinition.entries()) {
          if (rates.length === 0) continue;
          const vignetteRate = rates.reduce((sum, r) => sum + r, 0) / rates.length;
          inputs.push({
            domainId: SNAPSHOT_DOMAIN_ID,
            definitionId,
            valueKey,
            pairKey,
            directionKey,
            vignetteRate,
          });
        }
      }
      const aggregatedValueRates = aggregateValueWinRates(inputs);

      const valueWinRates: Record<string, number> = {};
      const vignetteCount: Record<string, number> = {};
      for (const [valueKey, result] of aggregatedValueRates.entries()) {
        if (result.crossDomainRate == null) continue;
        valueWinRates[valueKey] = result.crossDomainRate * 100;
        vignetteCount[valueKey] = result.domainRates.reduce(
          (sum, domainRate) => sum + domainRate.pairsCounted,
          0,
        );
      }

      return {
        model: modelId,
        counts: toCountsRecord(valueCounts),
        pairwiseWins: toPairwiseRecord(pairwiseWinsByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>()),
        valueWinRates,
        vignetteCount,
      };
    })
    .sort((left, right) => left.model.localeCompare(right.model));

  return { models, analyzedDefinitionIds };
}
