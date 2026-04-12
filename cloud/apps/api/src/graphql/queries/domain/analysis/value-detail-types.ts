import type { DomainAnalysisConditionDetail, DomainAnalysisVignetteDetail } from '../shared.js';
import type { DomainAnalysisValueKey } from '../../domain-analysis-values.js';

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
  const comparisonDenominator = condition.prioritized + condition.deprioritized;
  return {
    scenarioId: condition.scenarioId,
    conditionName: condition.conditionName,
    dimensions: condition.dimensions,
    prioritized: condition.prioritized,
    deprioritized: condition.deprioritized,
    neutral: condition.neutral,
    totalTrials: condition.totalTrials,
    selectedValueWinRate: comparisonDenominator === 0 ? null : condition.prioritized / comparisonDenominator,
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
  const comparisonDenominator = vignette.prioritized + vignette.deprioritized;
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
    selectedValueWinRate: comparisonDenominator === 0 ? null : vignette.prioritized / comparisonDenominator,
    conditions,
  };
}
