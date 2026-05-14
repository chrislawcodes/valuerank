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

    const totalTrials = outcome.aChoices + outcome.bChoices + outcome.neutrals;
    if (totalTrials < MIN_TRIALS_FOR_CONSISTENCY) {
      continue;
    }

    const modal = Math.max(outcome.aChoices, outcome.bChoices, outcome.neutrals);
    const valuePairKey = `${position.canonicalA}::${position.canonicalB}`;
    pushNested(consistency, valuePairKey, position.definitionId, modal / totalTrials);
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
 * Symmetry tolerance: if the upper-distance from the point estimate and the
 * lower-distance differ by at most this amount, the CI is considered symmetric.
 * Defined here so tests can import it.
 */
export const KAPPA_CI_SYMMETRY_TOLERANCE = 0.01;

/**
 * Wide-CI threshold: a confidence interval is considered "wide" (data too thin
 * to constrain the estimate) when its width exceeds this value or when it
 * crosses zero (low < 0).
 */
export const KAPPA_CI_WIDE_THRESHOLD = 0.30;

export type KappaConfidenceInterval = {
  /** 2.5th percentile of bootstrap distribution, or null if not computable. */
  low: number | null;
  /** 97.5th percentile of bootstrap distribution, or null if not computable. */
  high: number | null;
  /** True when |upper-distance - lower-distance| ≤ KAPPA_CI_SYMMETRY_TOLERANCE. */
  isSymmetric: boolean;
};

/**
 * Groups a flat array of ComparableCell[] by definitionId (vignette).
 * The returned Map keys are vignette IDs; values are the cells that belong to
 * that vignette for this pair.
 */
export function groupCellsByVignette(cells: ReadonlyArray<ComparableCell>): Map<string, ComparableCell[]> {
  const map = new Map<string, ComparableCell[]>();
  for (const cell of cells) {
    const bucket = map.get(cell.definitionId) ?? [];
    bucket.push(cell);
    map.set(cell.definitionId, bucket);
  }
  return map;
}

/**
 * Yield to the Node event loop so other concurrently-issued requests can
 * progress while a long-running CPU-bound bootstrap is in flight. Without
 * this, the entire process blocks for tens of seconds on large all-domains
 * scopes and other queries (e.g. domainAnalysis from the same page) time out
 * at the proxy with a "Failed to fetch" browser error.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => { setImmediate(resolve); });
}

// Yield every N bootstrap iterations. Tuned so a single yield is rarely more
// than ~50ms of CPU work even on the largest realistic input (≈360 vignettes
// × ~6 cells each), keeping concurrent fast queries responsive.
const BOOTSTRAP_YIELD_EVERY_ITERATIONS = 25;

/**
 * Bootstrap 95% confidence interval for Cohen's kappa by resampling whole
 * vignettes with replacement (1000 iterations by default).
 *
 * Resampling at the vignette level (not cell level) respects the clustering
 * structure — cells within a vignette share context and aren't independent.
 *
 * Async to keep the Node event loop responsive — yields every
 * BOOTSTRAP_YIELD_EVERY_ITERATIONS iterations so concurrent requests are not
 * starved while a long bootstrap runs.
 *
 * Returns { low: null, high: null, isSymmetric: true } when:
 *   - The point estimate is null (no data to resample).
 *   - There are no vignettes (empty input).
 *   - Fewer than 100 valid bootstrap samples were produced (degenerate case).
 */
export async function bootstrapKappaConfidence(
  cellsByVignette: Map<string, ComparableCell[]>,
  pointEstimateKappa: number | null,
  iterations: number = 1000,
): Promise<KappaConfidenceInterval> {
  if (pointEstimateKappa == null || cellsByVignette.size === 0) {
    return { low: null, high: null, isSymmetric: true };
  }

  const vignetteIds = Array.from(cellsByVignette.keys());
  const n = vignetteIds.length;
  const kappaSamples: number[] = [];

  for (let iter = 0; iter < iterations; iter += 1) {
    // Resample vignettes WITH REPLACEMENT.
    // Each draw gets a unique synthetic vignette ID so that duplicate draws
    // (e.g. drawing vignette A twice) are not collapsed back into one group
    // by summarizePairCells. Without this, drawing {A, A, B} produces the
    // same kappa as drawing {A, B} because cells keep their original
    // definitionId and the 3-level aggregation deduplicates them.
    const resampledCells: ComparableCell[] = [];
    for (let i = 0; i < n; i += 1) {
      const idx = Math.floor(Math.random() * n);
      const sourceVignetteId = vignetteIds[idx]!;
      const syntheticVignetteId = `bootstrap-${iter}-${i}`;
      const cellsForVignette = cellsByVignette.get(sourceVignetteId) ?? [];
      for (const c of cellsForVignette) {
        resampledCells.push({ ...c, definitionId: syntheticVignetteId });
      }
    }
    const sampleKappa = summarizePairCells(resampledCells).cohensKappa;
    if (sampleKappa != null && Number.isFinite(sampleKappa)) {
      kappaSamples.push(sampleKappa);
    }

    if ((iter + 1) % BOOTSTRAP_YIELD_EVERY_ITERATIONS === 0 && iter + 1 < iterations) {
      await yieldToEventLoop();
    }
  }

  // Too few valid samples to make a meaningful CI
  if (kappaSamples.length < 100) {
    return { low: null, high: null, isSymmetric: true };
  }

  kappaSamples.sort((a, b) => a - b);
  const lowIdx = Math.floor(kappaSamples.length * 0.025);
  const highIdx = Math.floor(kappaSamples.length * 0.975);
  const low = kappaSamples[lowIdx]!;
  const high = kappaSamples[highIdx]!;

  // Symmetry check: upper-distance from point estimate vs lower-distance.
  const upperDist = high - pointEstimateKappa;
  const lowerDist = pointEstimateKappa - low;
  const isSymmetric = Math.abs(upperDist - lowerDist) <= KAPPA_CI_SYMMETRY_TOLERANCE;

  return { low, high, isSymmetric };
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
