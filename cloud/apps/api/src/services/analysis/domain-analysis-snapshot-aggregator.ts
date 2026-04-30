/**
 * Pure aggregation logic for domain-analysis snapshots.
 *
 * No database access — takes pre-fetched analysis rows and value-pair maps,
 * runs two phases of accumulation/normalisation, and returns the per-model
 * model objects that get embedded in the snapshot output.
 */
import {
  DOMAIN_ANALYSIS_VALUE_KEYS,
  type DomainAnalysisValueKey,
} from '../../graphql/queries/domain-analysis-values.js';
import type { DomainAnalysisValueCounts } from '../../graphql/queries/domain/shared.js';
import type { AnalysisOutputRow } from './domain-analysis-cache-types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseCount(raw: unknown): DomainAnalysisValueCounts {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const record = raw as Record<string, unknown>;
  const prioritized = typeof record.prioritized === 'number' && Number.isFinite(record.prioritized) ? record.prioritized : 0;
  const deprioritized = typeof record.deprioritized === 'number' && Number.isFinite(record.deprioritized) ? record.deprioritized : 0;
  const neutral = typeof record.neutral === 'number' && Number.isFinite(record.neutral) ? record.neutral : 0;
  return { prioritized, deprioritized, neutral };
}

function getValueCountsFromAnalysis(output: unknown, modelId: string, valueKey: string): DomainAnalysisValueCounts {
  if (output == null || typeof output !== 'object' || Array.isArray(output)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const perModel = (output as { perModel?: unknown }).perModel;
  if (perModel == null || typeof perModel !== 'object' || Array.isArray(perModel)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const modelData = (perModel as Record<string, unknown>)[modelId];
  if (modelData == null || typeof modelData !== 'object' || Array.isArray(modelData)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const values = (modelData as { values?: unknown }).values;
  if (values == null || typeof values !== 'object' || Array.isArray(values)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  // Analysis outputs store value keys in lowercase (e.g. "power_dominance") while
  // the canonical ValueKey type uses PascalCase (e.g. "Power_Dominance"). Do a
  // case-insensitive lookup so both conventions are handled.
  const valuesRecord = values as Record<string, unknown>;
  const keyLower = valueKey.toLowerCase();
  const valueData = valuesRecord[valueKey]
    ?? Object.entries(valuesRecord).find(([k]) => k.toLowerCase() === keyLower)?.[1];
  if (valueData == null || typeof valueData !== 'object' || Array.isArray(valueData)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  return parseCount((valueData as { count?: unknown }).count);
}

export function toCountsRecord(valueMap: Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>): Record<string, DomainAnalysisValueCounts> {
  const record: Record<string, DomainAnalysisValueCounts> = {};
  for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
    record[valueKey] = valueMap.get(valueKey) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  return record;
}

export function toPairwiseRecord(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
): Record<string, Record<string, number>> {
  const record: Record<string, Record<string, number>> = {};
  for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
    const winnerMap = pairwiseWins.get(valueKey) ?? new Map<DomainAnalysisValueKey, number>();
    record[valueKey] = Object.fromEntries(
      Array.from(winnerMap.entries()).map(([opponent, count]) => [opponent, count]),
    );
  }
  return record;
}

function addPairwiseWins(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
  winner: DomainAnalysisValueKey,
  loser: DomainAnalysisValueKey,
  count: number,
): void {
  if (count <= 0) return;
  const winsForWinner = pairwiseWins.get(winner) ?? new Map<DomainAnalysisValueKey, number>();
  winsForWinner.set(loser, (winsForWinner.get(loser) ?? 0) + count);
  pairwiseWins.set(winner, winsForWinner);
}

// ---------------------------------------------------------------------------
// Public aggregation function
// ---------------------------------------------------------------------------

export type AggregateModelResult = {
  model: string;
  counts: Record<string, DomainAnalysisValueCounts>;
  pairwiseWins: Record<string, Record<string, number>>;
  valueWinRates: Record<string, number>;
  vignetteCount: Record<string, number>;
};

/**
 * Aggregate analysis rows into per-model model objects.
 *
 * Phase 1: accumulate raw counts per (definitionId, modelId), tracking runCount.
 * Phase 2: normalise by runCount (so each vignette weighs equally regardless of
 *          how many runs it had), record one per-vignette win rate per value, then
 *          compute the equal-weight mean win rate and vignette count.
 */
export function aggregateAnalysisRows(params: {
  analysisRows: AnalysisOutputRow[];
  valuePairByDefinition: Map<string, { valueA: DomainAnalysisValueKey; valueB: DomainAnalysisValueKey }>;
  filteredSourceRunDefinitionById: Map<string, string>;
}): { models: AggregateModelResult[]; analyzedDefinitionIds: Set<string> } {
  const { analysisRows, valuePairByDefinition, filteredSourceRunDefinitionById } = params;

  const aggregatedByModel = new Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>();
  const pairwiseWinsByModel = new Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>();
  const analyzedDefinitionIds = new Set<string>();

  // Phase 1: accumulate raw counts + runCount per (definitionId, modelId).
  type DefinitionModelAcc = {
    valueA: DomainAnalysisValueKey;
    valueB: DomainAnalysisValueKey;
    first: DomainAnalysisValueCounts;
    second: DomainAnalysisValueCounts;
    firstRates: number[];
    secondRates: number[];
    runCount: number;
  };
  const defModelAcc = new Map<string, Map<string, DefinitionModelAcc>>();

  for (const analysisRow of analysisRows) {
    const definitionId = filteredSourceRunDefinitionById.get(analysisRow.runId);
    if (definitionId == null || definitionId === '') continue;
    const pair = valuePairByDefinition.get(definitionId);
    if (!pair) continue;

    const output = analysisRow.output;
    if (output == null || typeof output !== 'object' || Array.isArray(output)) continue;
    const perModel = (output as { perModel?: unknown }).perModel;
    if (perModel == null || typeof perModel !== 'object' || Array.isArray(perModel)) continue;

    let modelMap = defModelAcc.get(definitionId);
    if (!modelMap) {
      modelMap = new Map<string, DefinitionModelAcc>();
      defModelAcc.set(definitionId, modelMap);
    }

    for (const modelId of Object.keys(perModel as Record<string, unknown>)) {
      let acc = modelMap.get(modelId);
      if (!acc) {
        acc = {
          valueA: pair.valueA,
          valueB: pair.valueB,
          first: { prioritized: 0, deprioritized: 0, neutral: 0 },
          second: { prioritized: 0, deprioritized: 0, neutral: 0 },
          firstRates: [],
          secondRates: [],
          runCount: 0,
        };
        modelMap.set(modelId, acc);
      }

      const firstCounts = getValueCountsFromAnalysis(output, modelId, pair.valueA);
      const secondCounts = getValueCountsFromAnalysis(output, modelId, pair.valueB);

      acc.first.prioritized += firstCounts.prioritized;
      acc.first.deprioritized += firstCounts.deprioritized;
      acc.first.neutral += firstCounts.neutral;
      acc.second.prioritized += secondCounts.prioritized;
      acc.second.deprioritized += secondCounts.deprioritized;
      acc.second.neutral += secondCounts.neutral;

      const totalFirst = firstCounts.prioritized + firstCounts.deprioritized + firstCounts.neutral;
      if (totalFirst > 0) {
        acc.firstRates.push(firstCounts.prioritized / totalFirst);
      }
      const totalSecond = secondCounts.prioritized + secondCounts.deprioritized + secondCounts.neutral;
      if (totalSecond > 0) {
        acc.secondRates.push(secondCounts.prioritized / totalSecond);
      }

      acc.runCount += 1;
    }
  }

  // Phase 2: normalise by runCount, merge into global aggregates, and record
  // per-vignette win rates for equal-weight averaging.
  const vignetteWinRatesByModel = new Map<string, Map<DomainAnalysisValueKey, number[]>>();

  for (const [definitionId, modelMap] of defModelAcc) {
    for (const [modelId, acc] of modelMap) {
      if (acc.runCount === 0) continue;

      let valueMap = aggregatedByModel.get(modelId);
      if (!valueMap) {
        valueMap = new Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>();
        aggregatedByModel.set(modelId, valueMap);
      }
      let pairwiseWins = pairwiseWinsByModel.get(modelId);
      if (!pairwiseWins) {
        pairwiseWins = new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>();
        pairwiseWinsByModel.set(modelId, pairwiseWins);
      }
      let vigRates = vignetteWinRatesByModel.get(modelId);
      if (!vigRates) {
        vigRates = new Map<DomainAnalysisValueKey, number[]>();
        vignetteWinRatesByModel.set(modelId, vigRates);
      }

      const n = acc.runCount;

      const existingFirst = valueMap.get(acc.valueA) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
      existingFirst.prioritized += acc.first.prioritized / n;
      existingFirst.deprioritized += acc.first.deprioritized / n;
      existingFirst.neutral += acc.first.neutral / n;
      valueMap.set(acc.valueA, existingFirst);

      const existingSecond = valueMap.get(acc.valueB) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
      existingSecond.prioritized += acc.second.prioritized / n;
      existingSecond.deprioritized += acc.second.deprioritized / n;
      existingSecond.neutral += acc.second.neutral / n;
      valueMap.set(acc.valueB, existingSecond);

      addPairwiseWins(pairwiseWins, acc.valueA, acc.valueB, acc.first.prioritized / n);
      addPairwiseWins(pairwiseWins, acc.valueB, acc.valueA, acc.second.prioritized / n);

      // Per-vignette win rate: equal weight per source run (Path B).
      if (acc.firstRates.length > 0) {
        const meanA = acc.firstRates.reduce((s, r) => s + r, 0) / acc.firstRates.length;
        const ratesA = vigRates.get(acc.valueA) ?? [];
        ratesA.push(meanA);
        vigRates.set(acc.valueA, ratesA);
      }
      if (acc.secondRates.length > 0) {
        const meanB = acc.secondRates.reduce((s, r) => s + r, 0) / acc.secondRates.length;
        const ratesB = vigRates.get(acc.valueB) ?? [];
        ratesB.push(meanB);
        vigRates.set(acc.valueB, ratesB);
      }

      analyzedDefinitionIds.add(definitionId);
    }
  }

  // Compute equal-weight mean win rate (0–100) and vignette count per (model, value).
  const valueWinRatesByModel = new Map<string, Map<DomainAnalysisValueKey, number>>();
  const vignetteCountByModel = new Map<string, Map<DomainAnalysisValueKey, number>>();

  for (const [modelId, vigRates] of vignetteWinRatesByModel) {
    const winRateMap = new Map<DomainAnalysisValueKey, number>();
    const countMap = new Map<DomainAnalysisValueKey, number>();
    valueWinRatesByModel.set(modelId, winRateMap);
    vignetteCountByModel.set(modelId, countMap);
    for (const [valueKey, rates] of vigRates) {
      if (rates.length === 0) continue;
      const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
      winRateMap.set(valueKey, mean * 100);
      countMap.set(valueKey, rates.length);
    }
  }

  const models: AggregateModelResult[] = Array.from(aggregatedByModel.entries())
    .map(([modelId, valueMap]) => ({
      model: modelId,
      counts: toCountsRecord(valueMap),
      pairwiseWins: toPairwiseRecord(
        pairwiseWinsByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>(),
      ),
      valueWinRates: Object.fromEntries(
        valueWinRatesByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, number>()
      ),
      vignetteCount: Object.fromEntries(
        vignetteCountByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, number>()
      ),
    }))
    .sort((left, right) => left.model.localeCompare(right.model));

  return { models, analyzedDefinitionIds };
}
