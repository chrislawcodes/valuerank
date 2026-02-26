/**
 * domain-shape.ts
 *
 * Pure computation helpers for ranking shape analysis (#024).
 * No database access. No external dependencies.
 *
 * Two-axis behavioral classification:
 *   topStructure  — how the model's highest-scoring values are arranged
 *   bottomStructure — whether the model has values it sharply rejects
 *
 * Calibration constants — validate against real domain data before launch.
 * All threshold names match spec documentation for traceability.
 */

export type TopStructureLabel = 'strong_leader' | 'tied_leaders' | 'even_spread';
export type BottomStructureLabel = 'hard_no' | 'mild_avoidance' | 'no_hard_no';

export type RankingShape = {
  topStructure: TopStructureLabel;
  bottomStructure: BottomStructureLabel;
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
// Top structure: one value clearly leads vs shared top vs no clear ordering
const STRONG_LEADER_TOP_GAP = 0.28;   // topGap >= this → strong_leader
const TIED_LEADERS_TOP_GAP = 0.15;    // topGap >= this (but < STRONG) → tied_leaders
// (below TIED_LEADERS_TOP_GAP → even_spread)

// Bottom structure: lowest score determines how strongly a value is rejected
const HARD_NO_MIN_SCORE = -1.0;          // minScore < this → hard_no
const MILD_AVOIDANCE_MIN_SCORE = -0.5;   // minScore < this → mild_avoidance
// (minScore >= MILD_AVOIDANCE → no_hard_no)

const MIN_MODELS_FOR_Z_SCORE = 4; // minimum models for computing domainStdTopGap

type RawMetrics = {
  topGap: number;
  bottomGap: number;
  spread: number;
  steepness: number;
  minScore: number;
};

/**
 * Compute raw shape metrics from a sorted (descending) score array.
 * Steepness uses linearly-decaying weighted mean of consecutive deltas:
 *   w[i] = numDeltas - i  (first delta gets highest weight)
 */
export function computeRawShapeMetrics(sortedScores: number[]): RawMetrics {
  const n = sortedScores.length;
  if (n < 2) {
    return { topGap: 0, bottomGap: 0, spread: 0, steepness: 0, minScore: sortedScores[0] ?? 0 };
  }

  const topGap = (sortedScores[0] ?? 0) - (sortedScores[1] ?? 0);
  const bottomGap = (sortedScores[n - 2] ?? 0) - (sortedScores[n - 1] ?? 0);
  const spread = (sortedScores[0] ?? 0) - (sortedScores[n - 1] ?? 0);
  const minScore = sortedScores[n - 1] ?? 0;

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

  return { topGap, bottomGap, spread, steepness, minScore };
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
 * Classify a single model's shape along two independent axes:
 *   topStructure  — how the leading values are arranged
 *   bottomStructure — how strongly the lowest values are rejected
 *
 * dominanceZScore is retained for diagnostics / potential future use.
 */
export function classifyShape(raw: RawMetrics, benchmarks: RankingShapeBenchmarks): RankingShape {
  const { topGap, bottomGap, spread, steepness, minScore } = raw;
  const { domainMeanTopGap, domainStdTopGap } = benchmarks;

  let dominanceZScore: number | null = null;
  if (domainStdTopGap !== null) {
    dominanceZScore = domainStdTopGap === 0 ? 0 : (topGap - domainMeanTopGap) / domainStdTopGap;
  }

  const topStructure: TopStructureLabel =
    topGap >= STRONG_LEADER_TOP_GAP ? 'strong_leader' :
    topGap >= TIED_LEADERS_TOP_GAP ? 'tied_leaders' :
    'even_spread';

  const bottomStructure: BottomStructureLabel =
    minScore < HARD_NO_MIN_SCORE ? 'hard_no' :
    minScore < MILD_AVOIDANCE_MIN_SCORE ? 'mild_avoidance' :
    'no_hard_no';

  return { topStructure, bottomStructure, topGap, bottomGap, spread, steepness, dominanceZScore };
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
