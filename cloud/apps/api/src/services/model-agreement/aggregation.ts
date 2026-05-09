import {
  cohensKappa,
  isTied,
  kappaInterpretation,
  MIN_TRIALS_FOR_CONSISTENCY,
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

export type DomainKappaEntry = {
  domainId: string;
  domainName: string;
  kappa: number | null;
  cellCount: number;
};

export type PairwiseKappaBreakdown = {
  averageKappa: number | null;
  kappaByDomain: DomainKappaEntry[];
  spread: number | null;
  domainCount: number;
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
  const total = outcome.aChoices + outcome.bChoices + outcome.neutrals;
  if (total <= 0) {
    return null;
  }

  return (outcome.aChoices + 0.5 * outcome.neutrals) / total;
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

type NestedCellValues = Map<string /* valuePairKey */, Map<string /* definitionId */, number[]>>;

function pushNested(
  map: NestedCellValues,
  valuePairKey: string,
  definitionId: string,
  value: number,
): void {
  let byVignette = map.get(valuePairKey);
  if (byVignette == null) {
    byVignette = new Map<string, number[]>();
    map.set(valuePairKey, byVignette);
  }
  const bucket = byVignette.get(definitionId) ?? [];
  bucket.push(value);
  byVignette.set(definitionId, bucket);
}

/**
 * Three-level equal-weight aggregation: cell → vignette → value-pair → headline.
 *
 * Each vignette is the equal-weighted mean of its cells. Each value pair is the
 * equal-weighted mean of its vignettes. The headline is the equal-weighted mean
 * of all value pairs. A value pair backed by 6 vignettes contributes the same
 * to the headline as one backed by 1 vignette.
 *
 * Returns null if there is no data at any level.
 */
function aggregateNested(map: NestedCellValues): number | null {
  const valuePairAverages: number[] = [];
  for (const byVignette of map.values()) {
    const vignetteAverages: number[] = [];
    for (const cellValues of byVignette.values()) {
      if (cellValues.length === 0) continue;
      vignetteAverages.push(cellValues.reduce((sum, value) => sum + value, 0) / cellValues.length);
    }
    if (vignetteAverages.length === 0) continue;
    valuePairAverages.push(vignetteAverages.reduce((sum, value) => sum + value, 0) / vignetteAverages.length);
  }
  if (valuePairAverages.length === 0) return null;
  return valuePairAverages.reduce((sum, value) => sum + value, 0) / valuePairAverages.length;
}

/**
 * Weighted Cohen's kappa over A / TIED / B with linear ordinal weights and
 * three-level equal-weight aggregation.
 *
 * Aggregation chain: cell → vignette → value-pair → headline. Each level is
 * equal-weighted, so neither cells-per-vignette nor vignettes-per-value-pair
 * bias the headline. A value pair tested by many vignettes contributes the
 * same to the cross-pair number as one tested by few.
 *
 * Ordinal weights over A < TIED < B:
 *   same category → weight 1 (full agreement)
 *   one step apart (A↔TIED or TIED↔B) → weight 0.5 (soft disagreement)
 *   two steps apart (A↔B) → weight 0 (hard disagreement)
 *
 * percentAgreement stays as the unweighted binary same-category rate —
 * useful as a diagnostic alongside the weighted kappa.
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

  const agreement: NestedCellValues = new Map();
  const weightedAgreement: NestedCellValues = new Map();
  const divergence: NestedCellValues = new Map();
  const indicatorAx: NestedCellValues = new Map();
  const indicatorTx: NestedCellValues = new Map();
  const indicatorBx: NestedCellValues = new Map();
  const indicatorAy: NestedCellValues = new Map();
  const indicatorTy: NestedCellValues = new Map();
  const indicatorBy: NestedCellValues = new Map();

  for (const cell of cells) {
    // Binary same-category agreement (for percentAgreement diagnostic)
    pushNested(agreement, cell.valuePairKey, cell.definitionId, cell.agrees ? 1 : 0);

    // Weighted agreement: same=1, one-step-apart=0.5, two-steps-apart=0
    let cellWeightedAgreement: number;
    if (cell.modelAChoice === cell.modelBChoice) {
      cellWeightedAgreement = 1.0;
    } else if (
      (cell.modelAChoice === 'A' && cell.modelBChoice === 'B')
      || (cell.modelAChoice === 'B' && cell.modelBChoice === 'A')
    ) {
      cellWeightedAgreement = 0.0;
    } else {
      // One of {A↔TIED, TIED↔A, TIED↔B, B↔TIED}
      cellWeightedAgreement = 0.5;
    }
    pushNested(weightedAgreement, cell.valuePairKey, cell.definitionId, cellWeightedAgreement);

    pushNested(divergence, cell.valuePairKey, cell.definitionId, cell.divergence);
    pushNested(indicatorAx, cell.valuePairKey, cell.definitionId, cell.modelAChoice === 'A' ? 1 : 0);
    pushNested(indicatorTx, cell.valuePairKey, cell.definitionId, cell.modelAChoice === 'TIED' ? 1 : 0);
    pushNested(indicatorBx, cell.valuePairKey, cell.definitionId, cell.modelAChoice === 'B' ? 1 : 0);
    pushNested(indicatorAy, cell.valuePairKey, cell.definitionId, cell.modelBChoice === 'A' ? 1 : 0);
    pushNested(indicatorTy, cell.valuePairKey, cell.definitionId, cell.modelBChoice === 'TIED' ? 1 : 0);
    pushNested(indicatorBy, cell.valuePairKey, cell.definitionId, cell.modelBChoice === 'B' ? 1 : 0);
  }

  const percentAgreementValue = aggregateNested(agreement);
  const pObservedWeighted = aggregateNested(weightedAgreement);
  const meanAbsoluteDivergence = aggregateNested(divergence);

  const pAx = aggregateNested(indicatorAx);
  const pTx = aggregateNested(indicatorTx);
  const pBx = aggregateNested(indicatorBx);
  const pAy = aggregateNested(indicatorAy);
  const pTy = aggregateNested(indicatorTy);
  const pBy = aggregateNested(indicatorBy);

  // Weighted chance agreement:
  //   P_chance_w = pAx*pAy*1 + pAx*pTy*0.5 + pAx*pBy*0
  //              + pTx*pAy*0.5 + pTx*pTy*1 + pTx*pBy*0.5
  //              + pBx*pAy*0 + pBx*pTy*0.5 + pBx*pBy*1
  // Simplified: pAx*pAy + pTx*pTy + pBx*pBy
  //           + 0.5 * (pAx*pTy + pTx*pAy + pTx*pBy + pBx*pTy)
  const chanceAgreement = pAx != null && pTx != null && pBx != null
    && pAy != null && pTy != null && pBy != null
    ? (pAx * pAy) + (pTx * pTy) + (pBx * pBy)
      + 0.5 * ((pAx * pTy) + (pTx * pAy) + (pTx * pBy) + (pBx * pTy))
    : null;

  const kappa = pObservedWeighted != null && chanceAgreement != null
    ? cohensKappa(pObservedWeighted, chanceAgreement)
    : null;

  return {
    totalCells: cells.length,
    percentAgreement: percentAgreementValue,
    cohensKappa: kappa,
    kappaInterpretation: kappaInterpretation(kappa),
    meanAbsoluteDivergence,
  };
}

/**
 * Computes Cohen's kappa independently for each domain that has cells for this
 * model pair. Uses the same three-level equal-weight aggregation as
 * summarizePairCells, but scoped to one domain at a time.
 *
 * @param cells - All comparable cells for the model pair (across all domains)
 * @param definitionDomainIdById - Maps definitionId → domainId
 * @param domainsById - Maps domainId → { id, name }
 */
export function computeKappaPerDomain(
  cells: ReadonlyArray<ComparableCell>,
  definitionDomainIdById: ReadonlyMap<string, string>,
  domainsById: ReadonlyMap<string, { id: string; name: string }>,
): DomainKappaEntry[] {
  const cellsByDomain = new Map<string, ComparableCell[]>();
  for (const cell of cells) {
    const domainId = definitionDomainIdById.get(cell.definitionId);
    if (domainId == null) {
      continue;
    }

    const bucket = cellsByDomain.get(domainId) ?? [];
    bucket.push(cell);
    cellsByDomain.set(domainId, bucket);
  }

  const entries: DomainKappaEntry[] = [];
  for (const [domainId, domainCells] of cellsByDomain.entries()) {
    const domain = domainsById.get(domainId);
    const metrics = summarizePairCells(domainCells);
    entries.push({
      domainId,
      domainName: domain?.name ?? domainId,
      kappa: metrics.cohensKappa,
      cellCount: domainCells.length,
    });
  }

  entries.sort((a, b) => a.domainName.localeCompare(b.domainName));
  return entries;
}

/**
 * Computes the per-domain kappa breakdown and derives headline statistics.
 *
 * averageKappa is the equal-weighted mean of per-domain kappa values (only
 * domains with non-null kappa are included in the mean). This matches the
 * existing summarizePairCells headline because summarizePairCells already
 * weights domains equally via three-level aggregation.
 *
 * spread is max(kappa) - min(kappa) across domains. Null when fewer than 2
 * domains have a non-null kappa.
 */
export function computePairwiseKappaWithBreakdown(
  cells: ReadonlyArray<ComparableCell>,
  definitionDomainIdById: ReadonlyMap<string, string>,
  domainsById: ReadonlyMap<string, { id: string; name: string }>,
): PairwiseKappaBreakdown {
  const kappaByDomain = computeKappaPerDomain(cells, definitionDomainIdById, domainsById);
  const domainCount = kappaByDomain.length;

  const validKappas = kappaByDomain
    .map((entry) => entry.kappa)
    .filter((kappa): kappa is number => kappa != null && Number.isFinite(kappa));

  const averageKappa = validKappas.length > 0
    ? validKappas.reduce((sum, kappa) => sum + kappa, 0) / validKappas.length
    : null;

  const spread = validKappas.length >= 2
    ? Math.max(...validKappas) - Math.min(...validKappas)
    : null;

  return { averageKappa, kappaByDomain, spread, domainCount };
}

/**
 * Trial consistency for a single model with three-level equal-weight
 * aggregation (cell → vignette → value-pair → headline). Each value pair
 * contributes equally to the headline regardless of how many vignettes
 * back it.
 */
export function summarizeTrialConsistency(params: {
  positionCells: ReadonlyMap<string, PositionCell>;
  modelId: string;
}): {
  cellsObserved: number;
  meanTrialConsistency: number | null;
} {
  const consistency: NestedCellValues = new Map();
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

    const valuePairKey = `${position.canonicalA}::${position.canonicalB}`;
    pushNested(consistency, valuePairKey, position.definitionId, Math.max(proportionA, 1 - proportionA));
    cellsObserved += 1;
  }

  return {
    cellsObserved,
    meanTrialConsistency: aggregateNested(consistency),
  };
}

export function buildUnavailableModelInfo(model: ModelSummary): UnavailableModelInfoShape {
  return {
    modelId: model.modelId,
    label: model.label,
    reason: 'No cell-level outcomes were available for the selected scope.',
  };
}

/**
 * Wide-spread threshold: a per-domain kappa spread is considered "wide" when
 * the max-minus-min range exceeds this value.
 */
export const KAPPA_SPREAD_WIDE_THRESHOLD = 0.30;

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
