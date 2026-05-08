import {
  cohensKappa,
  equalWeightAggregate,
  isTied,
  kappaInterpretation,
  MIN_TRIALS_FOR_CONSISTENCY,
  percentAgreement,
} from './math.js';
import type {
  ModelAgreementResultShape,
  PairDivergenceBreakdownShape,
  UnavailableModelInfoShape,
} from '../../graphql/types/model-agreement-on-tradeoffs.js';

export type ModelSummary = {
  modelId: string;
  label: string;
};

export type CellOutcome = {
  aChoices: number;
  bChoices: number;
  neutrals: number;
};

export type PositionCell = {
  definitionId: string;
  canonicalA: string;
  canonicalB: string;
  ownLevel: string;
  opponentLevel: string;
  byModelId: Map<string, CellOutcome>;
};

export type ComparableCell = {
  definitionId: string;
  valuePairKey: string;
  modelAProportionA: number;
  modelBProportionA: number;
  divergence: number;
  agreesBinary: boolean;
};

export type PairMetrics = {
  totalCells: number;
  percentAgreement: number | null;
  cohensKappa: number | null;
  kappaInterpretation: string | null;
  meanAbsoluteDivergence: number | null;
};

export function normalizeModelIds(modelIds: ReadonlyArray<string | number>): string[] {
  return [...new Set(modelIds.map((modelId) => String(modelId).trim()).filter((modelId) => modelId.length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

export function sortModels(models: ReadonlyArray<ModelSummary>): ModelSummary[] {
  return [...models].sort((left, right) => {
    const labelDelta = left.label.localeCompare(right.label);
    return labelDelta !== 0 ? labelDelta : left.modelId.localeCompare(right.modelId);
  });
}

function mean(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function parseCellLevelOutcomeKey(key: string): {
  definitionId: string;
  modelId: string;
  canonicalA: string;
  canonicalB: string;
  ownLevel: string;
  opponentLevel: string;
} | null {
  const parts = key.split('::');
  if (parts.length !== 6) {
    return null;
  }

  const [definitionId, modelId, canonicalA, canonicalB, ownLevel, opponentLevel] = parts;
  if (
    definitionId === undefined
    || modelId === undefined
    || canonicalA === undefined
    || canonicalB === undefined
    || ownLevel === undefined
    || opponentLevel === undefined
  ) {
    return null;
  }

  return {
    definitionId,
    modelId,
    canonicalA,
    canonicalB,
    ownLevel,
    opponentLevel,
  };
}

export function computeProportionA(outcome: CellOutcome): number | null {
  const total = outcome.aChoices + outcome.bChoices;
  if (total <= 0) {
    return null;
  }

  return outcome.aChoices / total;
}

export function buildSelectedModels(
  modelIds: ReadonlyArray<string>,
  labelByModelId: Map<string, string>,
): ModelSummary[] {
  return sortModels(modelIds.map((modelId) => ({
    modelId,
    label: labelByModelId.get(modelId) ?? modelId,
  })));
}

export function buildPositionCells(
  cellLevelOutcomes: Record<string, CellOutcome>,
  selectedModelIdSet: Set<string>,
): {
  positionCells: Map<string, PositionCell>;
  cellsObservedByModelId: Map<string, number>;
} {
  const positionCells = new Map<string, PositionCell>();
  const cellsObservedByModelId = new Map<string, number>();

  for (const [key, outcome] of Object.entries(cellLevelOutcomes)) {
    const parsed = parseCellLevelOutcomeKey(key);
    if (parsed == null || !selectedModelIdSet.has(parsed.modelId)) {
      continue;
    }

    cellsObservedByModelId.set(parsed.modelId, (cellsObservedByModelId.get(parsed.modelId) ?? 0) + 1);

    const positionKey = `${parsed.definitionId}::${parsed.canonicalA}::${parsed.canonicalB}::${parsed.ownLevel}::${parsed.opponentLevel}`;
    const existing = positionCells.get(positionKey);
    if (existing == null) {
      positionCells.set(positionKey, {
        definitionId: parsed.definitionId,
        canonicalA: parsed.canonicalA,
        canonicalB: parsed.canonicalB,
        ownLevel: parsed.ownLevel,
        opponentLevel: parsed.opponentLevel,
        byModelId: new Map([[parsed.modelId, outcome]]),
      });
    } else {
      existing.byModelId.set(parsed.modelId, outcome);
    }
  }

  return { positionCells, cellsObservedByModelId };
}

export function collectComparableCells(params: {
  positionCells: ReadonlyMap<string, PositionCell>;
  modelAId: string;
  modelBId: string;
}): {
  cells: ComparableCell[];
  excludedTiedCells: number;
} {
  const cells: ComparableCell[] = [];
  let excludedTiedCells = 0;

  for (const position of params.positionCells.values()) {
    const outcomeA = position.byModelId.get(params.modelAId);
    const outcomeB = position.byModelId.get(params.modelBId);
    if (outcomeA == null || outcomeB == null) {
      continue;
    }

    const proportionA = computeProportionA(outcomeA);
    const proportionB = computeProportionA(outcomeB);
    if (proportionA == null || proportionB == null) {
      continue;
    }

    if (isTied(proportionA) || isTied(proportionB)) {
      excludedTiedCells += 1;
      continue;
    }

    cells.push({
      definitionId: position.definitionId,
      valuePairKey: `${position.canonicalA}::${position.canonicalB}`,
      modelAProportionA: proportionA,
      modelBProportionA: proportionB,
      divergence: Math.abs(proportionA - proportionB),
      agreesBinary:
        (proportionA > 0.5 && proportionB > 0.5)
        || (proportionA < 0.5 && proportionB < 0.5),
    });
  }

  return { cells, excludedTiedCells };
}

export function summarizePairCells(cells: ReadonlyArray<ComparableCell>): PairMetrics {
  if (cells.length === 0) {
    return {
      totalCells: 0,
      percentAgreement: null,
      cohensKappa: null,
      kappaInterpretation: null,
      meanAbsoluteDivergence: null,
    };
  }

  const perVignetteAgreementRates = new Map<string, { matchedCells: number; totalCells: number }>();
  const perVignetteDivergences = new Map<string, number[]>();
  const perVignetteModelAProportions = new Map<string, number[]>();
  const perVignetteModelBProportions = new Map<string, number[]>();

  for (const cell of cells) {
    const agreementBucket = perVignetteAgreementRates.get(cell.definitionId) ?? { matchedCells: 0, totalCells: 0 };
    agreementBucket.totalCells += 1;
    if (cell.agreesBinary) {
      agreementBucket.matchedCells += 1;
    }
    perVignetteAgreementRates.set(cell.definitionId, agreementBucket);

    const divergenceBucket = perVignetteDivergences.get(cell.definitionId) ?? [];
    divergenceBucket.push(cell.divergence);
    perVignetteDivergences.set(cell.definitionId, divergenceBucket);

    const modelABucket = perVignetteModelAProportions.get(cell.definitionId) ?? [];
    modelABucket.push(cell.modelAProportionA);
    perVignetteModelAProportions.set(cell.definitionId, modelABucket);

    const modelBBucket = perVignetteModelBProportions.get(cell.definitionId) ?? [];
    modelBBucket.push(cell.modelBProportionA);
    perVignetteModelBProportions.set(cell.definitionId, modelBBucket);
  }

  const agreementRates = Array.from(perVignetteAgreementRates.values())
    .map((bucket) => percentAgreement(bucket.matchedCells, bucket.totalCells))
    .filter((value): value is number => value != null);
  const percentAgreementValue = mean(agreementRates);
  const modelAProportionA = equalWeightAggregate(Array.from(perVignetteModelAProportions.values()));
  const modelBProportionA = equalWeightAggregate(Array.from(perVignetteModelBProportions.values()));
  const meanAbsoluteDivergence = equalWeightAggregate(Array.from(perVignetteDivergences.values()));
  const chanceAgreement = modelAProportionA != null && modelBProportionA != null
    ? (modelAProportionA * modelBProportionA) + ((1 - modelAProportionA) * (1 - modelBProportionA))
    : null;
  const kappa = percentAgreementValue != null && chanceAgreement != null
    ? cohensKappa(percentAgreementValue, chanceAgreement)
    : null;

  return {
    totalCells: cells.length,
    percentAgreement: percentAgreementValue,
    cohensKappa: kappa,
    kappaInterpretation: kappaInterpretation(kappa),
    meanAbsoluteDivergence,
  };
}

export function summarizeTrialConsistency(params: {
  positionCells: ReadonlyMap<string, PositionCell>;
  modelId: string;
}): {
  cellsObserved: number;
  meanTrialConsistency: number | null;
} {
  const perVignetteConsistencies = new Map<string, number[]>();
  let cellsObserved = 0;

  for (const position of params.positionCells.values()) {
    const outcome = position.byModelId.get(params.modelId);
    if (outcome == null) {
      continue;
    }

    const totalTrials = outcome.aChoices + outcome.bChoices;
    if (totalTrials < MIN_TRIALS_FOR_CONSISTENCY) {
      continue;
    }

    const proportionA = computeProportionA(outcome);
    if (proportionA == null) {
      continue;
    }

    const consistency = Math.max(proportionA, 1 - proportionA);
    const bucket = perVignetteConsistencies.get(position.definitionId) ?? [];
    bucket.push(consistency);
    perVignetteConsistencies.set(position.definitionId, bucket);
    cellsObserved += 1;
  }

  return {
    cellsObserved,
    meanTrialConsistency: equalWeightAggregate(Array.from(perVignetteConsistencies.values())),
  };
}

export function buildUnavailableModelInfo(model: ModelSummary): UnavailableModelInfoShape {
  return {
    modelId: model.modelId,
    label: model.label,
    reason: 'No cell-level outcomes were available for the selected scope.',
  };
}

export function buildEmptyAgreementResult(): ModelAgreementResultShape {
  return {
    pending: true,
    models: [],
    unavailableModels: [],
    excludedNonBinaryCells: 0,
    excludedTiedCells: 0,
    pairwiseAgreementMatrix: [],
    trialConsistency: [],
  };
}

export function buildEmptyPairBreakdown(
  modelAId: string,
  modelALabel: string,
  modelBId: string,
  modelBLabel: string,
): PairDivergenceBreakdownShape {
  return {
    pending: false,
    modelAId,
    modelALabel,
    modelBId,
    modelBLabel,
    perValuePair: [],
  };
}
