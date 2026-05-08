import {
  cohensKappa,
  equalWeightAggregate,
  isTied,
  kappaInterpretation,
  MIN_TRIALS_FOR_CONSISTENCY,
  percentAgreement,
} from './math.js';
import type {
  ModelAgreementBuildProgressShape,
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

/**
 * Three-category coding for a model's choice on a cell:
 * - 'A' = the model picked canonical-A more than canonical-B
 * - 'B' = the model picked canonical-B more
 * - 'TIED' = the model split 50/50 (within KAPPA_TIE_EPSILON)
 *
 * Tied cells are real data (the model is genuinely undecided) and are kept in
 * every metric. For Cohen's kappa we use a 3-category coding where "both tied"
 * counts as agreement. This is the standard variant used in content-coding
 * reliability work when raters are allowed a "neutral" / "unclear" label.
 */
export type CellChoice = 'A' | 'TIED' | 'B';

export type ComparableCell = {
  definitionId: string;
  valuePairKey: string;
  modelAProportionA: number;
  modelBProportionA: number;
  modelAChoice: CellChoice;
  modelBChoice: CellChoice;
  divergence: number;
  agrees: boolean;
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

function classifyChoice(proportionA: number): CellChoice {
  if (isTied(proportionA)) return 'TIED';
  return proportionA > 0.5 ? 'A' : 'B';
}

export function collectComparableCells(params: {
  positionCells: ReadonlyMap<string, PositionCell>;
  modelAId: string;
  modelBId: string;
}): {
  cells: ComparableCell[];
  tiedCells: number;
} {
  const cells: ComparableCell[] = [];
  let tiedCells = 0;

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

    const modelAChoice = classifyChoice(proportionA);
    const modelBChoice = classifyChoice(proportionB);

    if (modelAChoice === 'TIED' || modelBChoice === 'TIED') {
      tiedCells += 1;
    }

    cells.push({
      definitionId: position.definitionId,
      valuePairKey: `${position.canonicalA}::${position.canonicalB}`,
      modelAProportionA: proportionA,
      modelBProportionA: proportionB,
      modelAChoice,
      modelBChoice,
      divergence: Math.abs(proportionA - proportionB),
      agrees: modelAChoice === modelBChoice,
    });
  }

  return { cells, tiedCells };
}

/**
 * Three-category Cohen's kappa over A / TIED / B.
 *
 * Per-vignette aggregation: for each vignette compute the fraction of cells
 * in each category for each model, then equal-weight average those fractions
 * across vignettes. P_chance = sum over categories of pX(k) * pY(k). Both
 * models tied counts as agreement; one tied + one decided counts as
 * disagreement.
 */
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
  const perVignetteFractionsAByModel: Record<'A' | 'B', Map<string, number[]>> = {
    A: new Map<string, number[]>(),
    B: new Map<string, number[]>(),
  };
  const perVignetteFractionsTiedByModel: Record<'A' | 'B', Map<string, number[]>> = {
    A: new Map<string, number[]>(),
    B: new Map<string, number[]>(),
  };
  const perVignetteFractionsBByModel: Record<'A' | 'B', Map<string, number[]>> = {
    A: new Map<string, number[]>(),
    B: new Map<string, number[]>(),
  };

  function pushChoiceIndicator(
    map: Map<string, number[]>,
    definitionId: string,
    indicator: number,
  ): void {
    const bucket = map.get(definitionId) ?? [];
    bucket.push(indicator);
    map.set(definitionId, bucket);
  }

  for (const cell of cells) {
    const agreementBucket = perVignetteAgreementRates.get(cell.definitionId) ?? { matchedCells: 0, totalCells: 0 };
    agreementBucket.totalCells += 1;
    if (cell.agrees) {
      agreementBucket.matchedCells += 1;
    }
    perVignetteAgreementRates.set(cell.definitionId, agreementBucket);

    const divergenceBucket = perVignetteDivergences.get(cell.definitionId) ?? [];
    divergenceBucket.push(cell.divergence);
    perVignetteDivergences.set(cell.definitionId, divergenceBucket);

    pushChoiceIndicator(perVignetteFractionsAByModel.A, cell.definitionId, cell.modelAChoice === 'A' ? 1 : 0);
    pushChoiceIndicator(perVignetteFractionsTiedByModel.A, cell.definitionId, cell.modelAChoice === 'TIED' ? 1 : 0);
    pushChoiceIndicator(perVignetteFractionsBByModel.A, cell.definitionId, cell.modelAChoice === 'B' ? 1 : 0);
    pushChoiceIndicator(perVignetteFractionsAByModel.B, cell.definitionId, cell.modelBChoice === 'A' ? 1 : 0);
    pushChoiceIndicator(perVignetteFractionsTiedByModel.B, cell.definitionId, cell.modelBChoice === 'TIED' ? 1 : 0);
    pushChoiceIndicator(perVignetteFractionsBByModel.B, cell.definitionId, cell.modelBChoice === 'B' ? 1 : 0);
  }

  const agreementRates = Array.from(perVignetteAgreementRates.values())
    .map((bucket) => percentAgreement(bucket.matchedCells, bucket.totalCells))
    .filter((value): value is number => value != null);
  const percentAgreementValue = mean(agreementRates);
  const meanAbsoluteDivergence = equalWeightAggregate(Array.from(perVignetteDivergences.values()));

  const pAx = equalWeightAggregate(Array.from(perVignetteFractionsAByModel.A.values()));
  const pTx = equalWeightAggregate(Array.from(perVignetteFractionsTiedByModel.A.values()));
  const pBx = equalWeightAggregate(Array.from(perVignetteFractionsBByModel.A.values()));
  const pAy = equalWeightAggregate(Array.from(perVignetteFractionsAByModel.B.values()));
  const pTy = equalWeightAggregate(Array.from(perVignetteFractionsTiedByModel.B.values()));
  const pBy = equalWeightAggregate(Array.from(perVignetteFractionsBByModel.B.values()));

  const chanceAgreement = pAx != null && pTx != null && pBx != null
    && pAy != null && pTy != null && pBy != null
    ? (pAx * pAy) + (pTx * pTy) + (pBx * pBy)
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

export function buildEmptyAgreementResult(
  pending = true,
  buildProgress: ModelAgreementBuildProgressShape | null = null,
): ModelAgreementResultShape {
  return {
    pending,
    buildProgress,
    models: [],
    unavailableModels: [],
    excludedNonBinaryCells: 0,
    tiedCells: 0,
    pairwiseAgreementMatrix: [],
    trialConsistency: [],
  };
}

export function buildEmptyPairBreakdown(
  modelAId: string,
  modelALabel: string,
  modelBId: string,
  modelBLabel: string,
  buildProgress: ModelAgreementBuildProgressShape | null = null,
): PairDivergenceBreakdownShape {
  return {
    pending: buildProgress != null,
    buildProgress,
    modelAId,
    modelALabel,
    modelBId,
    modelBLabel,
    perValuePair: [],
  };
}
