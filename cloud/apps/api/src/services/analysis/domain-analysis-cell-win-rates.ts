import { SCHWARTZ_CIRCULAR_ORDER } from '@valuerank/shared/schwartz';
import { computePairwiseWinRate } from '../../utils/pairwise-math.js';
import {
  DOMAIN_ANALYSIS_VALUE_KEYS,
  type DomainAnalysisValueKey,
} from '../../graphql/queries/domain-analysis-values.js';
import type { DomainAnalysisValueCounts } from '../../graphql/queries/domain/shared.js';
import type { PairwiseWinRateModel } from '../../graphql/queries/domain/types.js';
import { decodeCellKey, type CellCounts } from './transcript-cell-accumulator.js';
import { aggregateValueWinRates, type ValueRateInput } from './value-win-rate-aggregation.js';

const SNAPSHOT_DOMAIN_ID = '__snapshot_domain__';

export type CellWeightedDomainModel = {
  model: string;
  counts: Record<string, DomainAnalysisValueCounts>;
  // Vignette-averaged pairwise win-rate matrices (each cell is the equal-weight
  // mean of per-vignette rates, not a pooled trial-count ratio).
  pairwiseWinRateModel: PairwiseWinRateModel;
  valueWinRates: Record<string, number>;
  vignetteCount: Record<string, number>;
  // Condition-weighted neutral rate (0–1 fraction): per-condition neutral share,
  // averaged per vignette, then averaged across vignettes. null when no trials.
  neutralRate: number | null;
};

type PairwiseRateMap = Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number[]>>;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toCountsRecord(valueMap: Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>): Record<string, DomainAnalysisValueCounts> {
  const record: Record<string, DomainAnalysisValueCounts> = {};
  for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
    record[valueKey] = valueMap.get(valueKey) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  return record;
}

function pushPairwiseRate(
  rateMap: PairwiseRateMap,
  winner: DomainAnalysisValueKey,
  loser: DomainAnalysisValueKey,
  rate: number,
): void {
  const winnerMap = rateMap.get(winner) ?? new Map<DomainAnalysisValueKey, number[]>();
  const rates = winnerMap.get(loser) ?? [];
  rates.push(rate);
  winnerMap.set(loser, rates);
  rateMap.set(winner, winnerMap);
}

// Builds the pairwise win-rate matrices. Win rates are the equal-weight mean of
// per-vignette rates (vignette-averaged, not pooled). Trial counts stay as raw
// pooled totals — they describe how much data informed each cell.
function buildPairwiseWinRateModel(
  ratesMap: PairwiseRateMap,
  excNeutralRatesMap: PairwiseRateMap,
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
  pairwiseNeutrals: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
): PairwiseWinRateModel {
  const order = [...SCHWARTZ_CIRCULAR_ORDER] as DomainAnalysisValueKey[];
  const n = order.length;
  const winRateMatrix: Array<Array<number | null>> = [];
  const winRateExcNeutralMatrix: Array<Array<number | null>> = [];
  const trialCountMatrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const winRateRow: Array<number | null> = [];
    const excNeutralRow: Array<number | null> = [];
    const trialRow: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        winRateRow.push(null);
        excNeutralRow.push(null);
        trialRow.push(0);
        continue;
      }
      const keyI = order[i] as DomainAnalysisValueKey;
      const keyJ = order[j] as DomainAnalysisValueKey;
      winRateRow.push(mean(ratesMap.get(keyI)?.get(keyJ) ?? []));
      excNeutralRow.push(mean(excNeutralRatesMap.get(keyI)?.get(keyJ) ?? []));
      const winsIJ = pairwiseWins.get(keyI)?.get(keyJ) ?? 0;
      const winsJI = pairwiseWins.get(keyJ)?.get(keyI) ?? 0;
      // Neutrals are stored from the valueA side only, so check both directions.
      const neutralsIJ = pairwiseNeutrals.get(keyI)?.get(keyJ) ?? pairwiseNeutrals.get(keyJ)?.get(keyI) ?? 0;
      trialRow.push(winsIJ + winsJI + neutralsIJ);
    }
    winRateMatrix.push(winRateRow);
    winRateExcNeutralMatrix.push(excNeutralRow);
    trialCountMatrix.push(trialRow);
  }
  return { valueOrder: order, winRateMatrix, winRateExcNeutralMatrix, trialCountMatrix };
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

// Adds neutral counts for pair (valueA, valueB). Only called from the valueA side of each
// vignette to avoid double-counting — a neutral outcome is shared by both values in the pair.
function addPairwiseNeutral(
  pairwiseNeutrals: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
  valueA: DomainAnalysisValueKey,
  valueB: DomainAnalysisValueKey,
  count: number,
): void {
  if (count <= 0) return;
  const aMap = pairwiseNeutrals.get(valueA) ?? new Map<DomainAnalysisValueKey, number>();
  aMap.set(valueB, (aMap.get(valueB) ?? 0) + count);
  pairwiseNeutrals.set(valueA, aMap);
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
}): { models: CellWeightedDomainModel[]; analyzedDefinitionIds: Set<string>; excNeutralValueWinRatesByModel: Map<string, Record<string, number>> } {
  const countsByModel = new Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>();
  const pairwiseWinsByModel = new Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>();
  const pairwiseNeutralsByModel = new Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>();
  const ratesByModelDefinitionValue = new Map<string, Map<string, Map<DomainAnalysisValueKey, number[]>>>();
  const excNeutralRatesByModelDefinitionValue = new Map<string, Map<string, Map<DomainAnalysisValueKey, number[]>>>();
  const excNeutralValueWinRatesByModel = new Map<string, Record<string, number>>();
  // Per-cell neutral share, bucketed by model -> definition, for the
  // condition-weighted per-model neutral rate.
  const neutralSharesByModelDefinition = new Map<string, Map<string, number[]>>();
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

    const excNeutralRate = computePairwiseWinRate(counts.wins, counts.losses, 0);
    if (excNeutralRate !== null) {
      const excNeutralModelRates = excNeutralRatesByModelDefinitionValue.get(decoded.modelId)
        ?? new Map<string, Map<DomainAnalysisValueKey, number[]>>();
      if (!excNeutralRatesByModelDefinitionValue.has(decoded.modelId)) {
        excNeutralRatesByModelDefinitionValue.set(decoded.modelId, excNeutralModelRates);
      }
      const excNeutralValueRates = excNeutralModelRates.get(decoded.definitionId)
        ?? new Map<DomainAnalysisValueKey, number[]>();
      if (!excNeutralModelRates.has(decoded.definitionId)) {
        excNeutralModelRates.set(decoded.definitionId, excNeutralValueRates);
      }
      const excRates = excNeutralValueRates.get(decoded.valueKey) ?? [];
      excRates.push(excNeutralRate);
      excNeutralValueRates.set(decoded.valueKey, excRates);
    }

    analyzedDefinitionIds.add(decoded.definitionId);

    // Per-cell neutral share. `rate` is non-null here, so the denominator is > 0.
    const cellTotal = counts.wins + counts.losses + counts.neutrals;
    const modelNeutralShares = neutralSharesByModelDefinition.get(decoded.modelId) ?? new Map<string, number[]>();
    if (!neutralSharesByModelDefinition.has(decoded.modelId)) {
      neutralSharesByModelDefinition.set(decoded.modelId, modelNeutralShares);
    }
    const definitionNeutralShares = modelNeutralShares.get(decoded.definitionId) ?? [];
    definitionNeutralShares.push(counts.neutrals / cellTotal);
    modelNeutralShares.set(decoded.definitionId, definitionNeutralShares);

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

    const pair = params.definitionValuePairById.get(decoded.definitionId);
    if (pair != null && decoded.valueKey === pair.valueA && counts.neutrals > 0) {
      const pairwiseNeutrals = getOrCreatePairwise(pairwiseNeutralsByModel, decoded.modelId);
      addPairwiseNeutral(pairwiseNeutrals, pair.valueA, pair.valueB, counts.neutrals);
    }

    if (counts.wins <= 0) continue;
    if (pair == null) continue;

    const pairwiseWins = getOrCreatePairwise(pairwiseWinsByModel, decoded.modelId);
    const opponentValueKey = decoded.valueKey === pair.valueA ? pair.valueB : pair.valueA;
    addPairwiseWin(pairwiseWins, decoded.valueKey, opponentValueKey, counts.wins);
  }

  const models = Array.from(modelsById.values())
    .map((modelId) => {
      const valueCounts = countsByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>();
      const modelDefinitionRates = ratesByModelDefinitionValue.get(modelId) ?? new Map<string, Map<DomainAnalysisValueKey, number[]>>();
      const inputs: ValueRateInput[] = [];

      // Per-vignette pairwise win rates for this model, keyed winner -> loser.
      const modelPairwiseRates: PairwiseRateMap = new Map();
      const modelPairwiseExcNeutralRates: PairwiseRateMap = new Map();

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
          const opponentValueKey: DomainAnalysisValueKey = valueKey === pair.valueA ? pair.valueB : pair.valueA;
          pushPairwiseRate(modelPairwiseRates, valueKey, opponentValueKey, vignetteRate);
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

      const excNeutralModelRateMap = excNeutralRatesByModelDefinitionValue.get(modelId)
        ?? new Map<string, Map<DomainAnalysisValueKey, number[]>>();
      const excNeutralInputs: ValueRateInput[] = [];
      for (const [definitionId, valueRatesByDefinition] of excNeutralModelRateMap.entries()) {
        const pair = params.definitionValuePairById.get(definitionId);
        if (pair == null) continue;
        const pairKey = `${pair.valueA}::${pair.valueB}`;
        const directionKey: DomainAnalysisValueKey = pair.valueFirst ?? pair.valueA;
        for (const [valueKey, rates] of valueRatesByDefinition.entries()) {
          if (rates.length === 0) continue;
          const vignetteRate = rates.reduce((sum, r) => sum + r, 0) / rates.length;
          excNeutralInputs.push({ domainId: SNAPSHOT_DOMAIN_ID, definitionId, valueKey, pairKey, directionKey, vignetteRate });
          const opponentValueKey: DomainAnalysisValueKey = valueKey === pair.valueA ? pair.valueB : pair.valueA;
          pushPairwiseRate(modelPairwiseExcNeutralRates, valueKey, opponentValueKey, vignetteRate);
        }
      }
      const aggregatedExcNeutralRates = aggregateValueWinRates(excNeutralInputs);
      const excNeutralValueWinRates: Record<string, number> = {};
      for (const [valueKey, result] of aggregatedExcNeutralRates.entries()) {
        if (result.crossDomainRate == null) continue;
        excNeutralValueWinRates[valueKey] = result.crossDomainRate * 100;
      }
      excNeutralValueWinRatesByModel.set(modelId, excNeutralValueWinRates);

      // Condition-weighted neutral rate: per-cell neutral share -> mean per
      // vignette -> mean across vignettes. Each vignette counts equally.
      const definitionNeutralRates: number[] = [];
      for (const shares of (neutralSharesByModelDefinition.get(modelId) ?? new Map<string, number[]>()).values()) {
        const vignetteNeutralRate = mean(shares);
        if (vignetteNeutralRate !== null) definitionNeutralRates.push(vignetteNeutralRate);
      }
      const neutralRate = mean(definitionNeutralRates);

      return {
        model: modelId,
        counts: toCountsRecord(valueCounts),
        pairwiseWinRateModel: buildPairwiseWinRateModel(
          modelPairwiseRates,
          modelPairwiseExcNeutralRates,
          pairwiseWinsByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>(),
          pairwiseNeutralsByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>(),
        ),
        valueWinRates,
        vignetteCount,
        neutralRate,
      };
    })
    .sort((left, right) => left.model.localeCompare(right.model));

  return { models, analyzedDefinitionIds, excNeutralValueWinRatesByModel };
}
