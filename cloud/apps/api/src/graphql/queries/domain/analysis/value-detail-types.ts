import type { DomainAnalysisConditionDetail, DomainAnalysisVignetteDetail } from '../shared.js';
import type { DomainAnalysisValueKey } from '../../domain-analysis-values.js';
import { computePairwiseWinRate } from '../../../../utils/pairwise-math.js';

export type MutableCondition = {
  scenarioId: string | null;
  conditionName: string;
  dimensions: Record<string, string | number> | null;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  strongly: number;
  somewhat: number;
  opponentSomewhat: number;
  opponentStrongly: number;
  unknownCount: number;
};

export type MutableVignette = {
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  aggregateRunId: string | null;
  otherValueKey: DomainAnalysisValueKey;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  conditions: Map<string, MutableCondition>;
};

export function mapCondition(condition: MutableCondition): DomainAnalysisConditionDetail {
  return {
    scenarioId: condition.scenarioId,
    conditionName: condition.conditionName,
    dimensions: condition.dimensions,
    prioritized: condition.prioritized,
    deprioritized: condition.deprioritized,
    neutral: condition.neutral,
    totalTrials: condition.totalTrials,
    selectedValueWinRate: computePairwiseWinRate(condition.prioritized, condition.deprioritized, condition.neutral),
    strongly: condition.strongly,
    somewhat: condition.somewhat,
    opponentSomewhat: condition.opponentSomewhat,
    opponentStrongly: condition.opponentStrongly,
    unknownCount: condition.unknownCount,
  };
}

export function mapVignette(vignette: MutableVignette): DomainAnalysisVignetteDetail {
  const conditions: DomainAnalysisConditionDetail[] = Array.from(vignette.conditions.values())
    .sort((left, right) => left.conditionName.localeCompare(right.conditionName))
    .map(mapCondition);
  // Equal-weight the per-condition win rates rather than pooling raw trial
  // counts, so conditions with more trials don't dominate the vignette rate.
  // This matches the per-vignette averaging used everywhere else on the Win
  // Rate page (see value-win-rate-aggregation.ts).
  const conditionRates = conditions
    .map((condition) => condition.selectedValueWinRate)
    .filter((rate): rate is number => rate !== null);
  const selectedValueWinRate = conditionRates.length > 0
    ? conditionRates.reduce((sum, rate) => sum + rate, 0) / conditionRates.length
    : null;
  return {
    definitionId: vignette.definitionId,
    definitionName: vignette.definitionName,
    definitionVersion: vignette.definitionVersion,
    aggregateRunId: vignette.aggregateRunId,
    otherValueKey: vignette.otherValueKey,
    prioritized: vignette.prioritized,
    deprioritized: vignette.deprioritized,
    neutral: vignette.neutral,
    totalTrials: vignette.totalTrials,
    selectedValueWinRate,
    conditions,
  };
}
