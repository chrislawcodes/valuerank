/**
 * domain-shape.ts
 *
 * Pure computation helpers for ranking shape analysis (#024).
 * No database access. No external dependencies.
 *
 * Calibration constants — validate against real domain data before launch.
 * All threshold names match spec documentation for traceability.
 */

export type RankingShapeLabel = 'dominant_leader' | 'gradual_slope' | 'no_clear_leader' | 'bimodal';

export type RankingShape = {
  label: RankingShapeLabel;
  topGap: number;
  bottomGap: number;
  spread: number;
  steepness: number;
  dominanceZScore: number | null;
};

export type RankingShapeBenchmarks = {
  domainMeanTopGap: number;
  domainStdTopGap: number | null; // null when model count < MIN_MODELS_FOR_Z_SCORE
  medianSpread: number;
};

export type ModelWithSortedScores = {
  model: string;
  sortedScores: number[]; // BT log-strength scores, sorted descending, length 10
};

export type RankingShapesResult = {
  shapes: Map<string, RankingShape>;
  benchmarks: RankingShapeBenchmarks;
};

// --- Calibration constants ---
const BIMODAL_GAP_FRACTION = 0.4; // each gap must consume >= 40% of total spread
const BIMODAL_MIN_SPREAD = 0.3;   // guard: ignore near-flat profiles
const DOMINANT_Z_THRESHOLD = 1.5;
const NO_CLEAR_LEADER_Z_THRESHOLD = -0.5;
const DOMINANT_ABS_THRESHOLD = 0.5;    // fallback when N < MIN_MODELS_FOR_Z_SCORE
const NO_CLEAR_ABS_TOP_GAP = 0.1;      // fallback when N < MIN_MODELS_FOR_Z_SCORE
const NO_CLEAR_ABS_SPREAD = 0.4;       // fallback when N < MIN_MODELS_FOR_Z_SCORE
const MIN_MODELS_FOR_Z_SCORE = 4;

type RawMetrics = {
  topGap: number;
  bottomGap: number;
  spread: number;
  steepness: number;
};

/**
 * Compute raw shape metrics from a sorted (descending) score array.
 * Steepness uses linearly-decaying weighted mean of consecutive deltas:
 *   w[i] = numDeltas - i  (first delta gets highest weight)
 */
export function computeRawShapeMetrics(sortedScores: number[]): RawMetrics {
  const n = sortedScores.length;
  if (n < 2) {
    return { topGap: 0, bottomGap: 0, spread: 0, steepness: 0 };
  }

  const topGap = (sortedScores[0] ?? 0) - (sortedScores[1] ?? 0);
  const bottomGap = (sortedScores[n - 2] ?? 0) - (sortedScores[n - 1] ?? 0);
  const spread = (sortedScores[0] ?? 0) - (sortedScores[n - 1] ?? 0);

  const numDeltas = n - 1;
  let weightedSum = 0;
  let weightSum = 0;
  for (let i = 0; i < numDeltas; i++) {
    const delta = (sortedScores[i] ?? 0) - (sortedScores[i + 1] ?? 0);
    const weight = numDeltas - i;
    weightedSum += weight * delta;
    weightSum += weight;
  }
  const steepness = weightSum > 0 ? weightedSum / weightSum : 0;

  return { topGap, bottomGap, spread, steepness };
}

/**
 * Compute domain-level benchmarks from raw metrics across all models.
 */
export function computeDomainBenchmarks(allRaw: RawMetrics[]): RankingShapeBenchmarks {
  const n = allRaw.length;
  if (n === 0) {
    return { domainMeanTopGap: 0, domainStdTopGap: null, medianSpread: 0 };
  }

  const topGaps = allRaw.map((m) => m.topGap);
  const spreads = allRaw.map((m) => m.spread);

  const domainMeanTopGap = topGaps.reduce((a, b) => a + b, 0) / n;

  let domainStdTopGap: number | null = null;
  if (n >= MIN_MODELS_FOR_Z_SCORE) {
    const variance = topGaps.reduce((sum, g) => sum + (g - domainMeanTopGap) ** 2, 0) / n;
    domainStdTopGap = Math.sqrt(variance);
  }

  const sortedSpreads = [...spreads].sort((a, b) => a - b);
  const mid = Math.floor(sortedSpreads.length / 2);
  const medianSpread =
    sortedSpreads.length % 2 === 0
      ? ((sortedSpreads[mid - 1] ?? 0) + (sortedSpreads[mid] ?? 0)) / 2
      : (sortedSpreads[mid] ?? 0);

  return { domainMeanTopGap, domainStdTopGap, medianSpread };
}

/**
 * Classify a single model's shape.
 * Rules applied in strict precedence order — mutually exclusive and exhaustive.
 */
export function classifyShape(raw: RawMetrics, benchmarks: RankingShapeBenchmarks): RankingShape {
  const { topGap, bottomGap, spread, steepness } = raw;
  const { domainMeanTopGap, domainStdTopGap, medianSpread } = benchmarks;

  let dominanceZScore: number | null = null;
  if (domainStdTopGap !== null) {
    dominanceZScore = domainStdTopGap === 0 ? 0 : (topGap - domainMeanTopGap) / domainStdTopGap;
  }

  let label: RankingShapeLabel;

  // 1. Bimodal: top and bottom gaps each consume >= 40% of spread
  if (
    spread > BIMODAL_MIN_SPREAD &&
    topGap > spread * BIMODAL_GAP_FRACTION &&
    bottomGap > spread * BIMODAL_GAP_FRACTION
  ) {
    label = 'bimodal';
  }
  // 2. Dominant leader
  else if (
    dominanceZScore !== null
      ? dominanceZScore > DOMINANT_Z_THRESHOLD
      : topGap > DOMINANT_ABS_THRESHOLD
  ) {
    label = 'dominant_leader';
  }
  // 3. No clear leader
  else if (
    dominanceZScore !== null
      ? dominanceZScore < NO_CLEAR_LEADER_Z_THRESHOLD && spread < medianSpread
      : topGap < NO_CLEAR_ABS_TOP_GAP && spread < NO_CLEAR_ABS_SPREAD
  ) {
    label = 'no_clear_leader';
  }
  // 4. Default
  else {
    label = 'gradual_slope';
  }

  return { label, topGap, bottomGap, spread, steepness, dominanceZScore };
}

/**
 * Main entry point.
 * Pass 1: compute raw metrics per model.
 * Pass 2: compute domain benchmarks, then classify each model.
 */
export function computeRankingShapes(models: ModelWithSortedScores[]): RankingShapesResult {
  if (models.length === 0) {
    return {
      shapes: new Map(),
      benchmarks: { domainMeanTopGap: 0, domainStdTopGap: null, medianSpread: 0 },
    };
  }

  // Pass 1
  const rawMap = new Map<string, RawMetrics>();
  for (const { model, sortedScores } of models) {
    rawMap.set(model, computeRawShapeMetrics(sortedScores));
  }

  // Pass 2
  const benchmarks = computeDomainBenchmarks(Array.from(rawMap.values()));
  const shapes = new Map<string, RankingShape>();
  for (const { model } of models) {
    const raw = rawMap.get(model);
    if (raw !== undefined) {
      shapes.set(model, classifyShape(raw, benchmarks));
    }
  }

  return { shapes, benchmarks };
}
