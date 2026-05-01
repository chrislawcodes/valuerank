/**
 * Pure aggregation primitives for the pressure-sensitivity report.
 *
 * Per spec FR-003 / FR-005 / FR-006 / FR-007 / FR-008 / FR-021. Each function is pure: no
 * logger imports, no I/O, no globals. Designed to be called from the resolver after
 * transcripts have been canonicalized via `resolveTranscriptDecisionModel` and bucketed
 * into (own × opponent) cells via the value-pair helpers.
 */

import type { AssignedOutcome } from './value-pair.js';

export type DecisionStrength = 'strong' | 'lean' | null;

export const FLAT_DELTA_THRESHOLD = 0.02;

export type Observation = {
  outcome: AssignedOutcome;
  strength: DecisionStrength;
};

export type CellMetrics = {
  n: number;
  unscoredCount: number;
  successes: number;
  winRate: number | null;
  conviction: number | null;
  netScore: number | null;
};

export type Cell = CellMetrics & {
  ownLevel: number;
  opponentLevel: number;
  lowData: boolean;
};

export type VignetteWeightedCellMetrics = CellMetrics & {
  n: number;
  lowData: boolean;
};

export type PressureResponseReason =
  | 'directional-thin'
  | 'inverted-thin'
  | 'baseline-thin'
  | 'directional-and-inverted-thin'
  | null;

export type PressureResponseResult = {
  value: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  baselineRate: number | null;
  pushTowardFirstRate: number | null;
  pushTowardSecondRate: number | null;
  reason: PressureResponseReason;
  qualifyingTrials: number;
};

export type PressureResponseSummary = {
  mean: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  pairsMeasured: number;
};

const Z_95 = 1.96;
const STUDENT_T_975 = [
  12.706204736174694,
  4.302652729749462,
  3.182446305283708,
  2.776445105197793,
  2.570581835636315,
  2.446911851144979,
  2.364624251592784,
  2.306004135204166,
  2.262157162798205,
  2.228138851986274,
  2.200985160091638,
  2.178812829667228,
  2.160368656462791,
  2.144786687917804,
  2.131449545559776,
  2.119905299221255,
  2.109815577833316,
  2.100922040241038,
  2.093024054408309,
  2.085963447265864,
  2.07961384472768,
  2.073873067904025,
  2.068657610419049,
  2.063898561628024,
  2.059538552753298,
  2.055529438642874,
  2.051830516480285,
  2.048407141795245,
  2.045229642132704,
  2.042272456301238,
  2.039513446396408,
  2.036933343460102,
  2.034515297449338,
  2.032244509317719,
  2.030107928250342,
  2.02809400098045,
  2.026192463029109,
  2.024394163911969,
  2.022690920036761,
  2.021075390306273,
  2.019540970441376,
  2.018081702818444,
  2.016692199227824,
  2.015367574443764,
  2.014103388880846,
  2.012895598919429,
  2.011740513729765,
  2.010634757624232,
  2.009575237129239,
  2.008559112100761,
] as const;

/**
 * Compute per-cell metrics from a list of observations.
 *
 * - N = count of scored observations (own_picked / opponent_picked / neutral).
 * - unscoredCount = count of refusals + unknowns (per FR-023).
 * - winRate = `prioritized / (prioritized + deprioritized + neutral)` where prioritized = own_picked
 *   (per FR-003b; matches `ModelValueDetailDrawer.tsx` denominator convention).
 * - conviction = `(2*strongly + somewhat) / (strongly + somewhat)` over own_picked observations only;
 *   undefined when there are no own_picked observations.
 * - netScore = `(2*ownStrong + ownLean − 2*opponentStrong − opponentLean) / N`
 *   (canonical formula from `canonicalConditionSummary.ts`).
 *
 * All metrics return null when undefined (e.g., N = 0).
 */
export function buildCellMetrics(observations: ReadonlyArray<Observation>): CellMetrics {
  let unscoredCount = 0;
  let ownPicked = 0;
  let opponentPicked = 0;
  let neutral = 0;
  let ownStrong = 0;
  let ownLean = 0;
  let opponentStrong = 0;
  let opponentLean = 0;

  for (const obs of observations) {
    if (obs.outcome === 'unscored') {
      unscoredCount += 1;
      continue;
    }
    if (obs.outcome === 'neutral') {
      neutral += 1;
      continue;
    }
    if (obs.outcome === 'own_picked') {
      ownPicked += 1;
      if (obs.strength === 'strong') ownStrong += 1;
      else if (obs.strength === 'lean') ownLean += 1;
    } else if (obs.outcome === 'opponent_picked') {
      opponentPicked += 1;
      if (obs.strength === 'strong') opponentStrong += 1;
      else if (obs.strength === 'lean') opponentLean += 1;
    }
  }

  const n = ownPicked + opponentPicked + neutral;

  if (n === 0) {
    return { n: 0, unscoredCount, successes: 0, winRate: null, conviction: null, netScore: null };
  }

  const winRate = ownPicked / n;
  const ownPicksWithStrength = ownStrong + ownLean;
  const conviction =
    ownPicksWithStrength === 0 ? null : (2 * ownStrong + ownLean) / ownPicksWithStrength;
  const netScore = (2 * ownStrong + ownLean - 2 * opponentStrong - opponentLean) / n;

  return { n, unscoredCount, successes: ownPicked, winRate, conviction, netScore };
}

function averageNonNull(values: Array<number | null>): number | null {
  let sum = 0;
  let count = 0;

  for (const value of values) {
    if (value == null) continue;
    sum += value;
    count += 1;
  }

  return count === 0 ? null : sum / count;
}

/**
 * Aggregate vignette-level observations into a single cell using equal weight per vignette.
 *
 * This is the unit-of-analysis rule used by the pressure-response report when the goal is to
 * compare values as vignette-level objects instead of transcript-level observations.
 */
export function buildVignetteWeightedCellMetrics(
  vignetteObservations: ReadonlyArray<ReadonlyArray<Observation>>,
  minN = 3,
): VignetteWeightedCellMetrics {
  const vignetteMetrics = vignetteObservations.map((observations) => buildCellMetrics(observations));
  const scoredVignetteMetrics = vignetteMetrics.filter((metrics) => metrics.n > 0);
  const winRates = scoredVignetteMetrics.map((metrics) => metrics.winRate);
  const convictions = scoredVignetteMetrics.map((metrics) => metrics.conviction);
  const netScores = scoredVignetteMetrics.map((metrics) => metrics.netScore);
  let successes = 0;
  for (const rate of winRates) {
    if (rate != null) successes += rate;
  }

  return {
    n: scoredVignetteMetrics.length,
    unscoredCount: vignetteMetrics.reduce((sum, metrics) => sum + metrics.unscoredCount, 0),
    successes,
    winRate: averageNonNull(winRates),
    conviction: averageNonNull(convictions),
    netScore: averageNonNull(netScores),
    lowData: scoredVignetteMetrics.length < minN,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sumNumbers(values: ReadonlyArray<number>): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum;
}

function sampleStandardDeviation(values: ReadonlyArray<number>, mean: number): number {
  if (values.length < 2) return 0;
  let sumSquared = 0;
  for (const value of values) {
    const delta = value - mean;
    sumSquared += delta * delta;
  }
  return Math.sqrt(sumSquared / (values.length - 1));
}

function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) return Number.NaN;

  const a = [
    -39.69683028665376,
    220.9460984245205,
    -275.9285104469687,
    138.357751867269,
    -30.66479806614716,
    2.506628277459239,
  ] as const;
  const b = [
    -54.47609879822406,
    161.5858368580409,
    -155.6989798598866,
    66.80131188771972,
    -13.28068155288572,
  ] as const;
  const c = [
    -0.007784894002430293,
    -0.3223964580411365,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ] as const;
  const d = [
    0.007784695709041462,
    0.3224671290700398,
    2.445134137142996,
    3.754408661907416,
  ] as const;
  const plow = 0.02425;
  const phigh = 1 - plow;

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  const q = p - 0.5;
  const r = q * q;
  return (
    (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
  ) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function studentTQuantile(p: number, df: number): number {
  if (!Number.isFinite(p) || !Number.isInteger(df) || df <= 0) return Number.NaN;
  if (Math.abs(p - 0.975) < 1e-12 && df >= 1 && df <= STUDENT_T_975.length) {
    return STUDENT_T_975[df - 1]!;
  }

  const z = normalQuantile(p);
  if (!Number.isFinite(z)) return Number.NaN;
  const v = df;
  const z2 = z * z;
  const z3 = z2 * z;
  const z5 = z3 * z2;
  const z7 = z5 * z2;
  return z
    + (z3 + z) / (4 * v)
    + (5 * z5 + 16 * z3 + 3 * z) / (96 * v * v)
    + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * v * v * v);
}

function wilsonIntervalFromProportion(
  proportion: number,
  trials: number,
  z: number,
): { p: number; low: number; high: number } | null {
  if (!Number.isFinite(proportion) || !Number.isFinite(trials) || !Number.isFinite(z)) return null;
  if (trials <= 0 || proportion < 0 || proportion > 1 || z <= 0) return null;

  const p = proportion;
  const zSquared = z * z;
  const denominator = 1 + zSquared / trials;
  const center = (p + zSquared / (2 * trials)) / denominator;
  const margin = (
    z
    * Math.sqrt((p * (1 - p) + zSquared / (4 * trials)) / trials)
  ) / denominator;

  return {
    p,
    low: clamp01(center - margin),
    high: clamp01(center + margin),
  };
}

export function wilsonInterval(
  matches: number,
  trials: number,
  z = Z_95,
): { p: number; low: number; high: number } | null {
  if (
    !Number.isFinite(matches)
    || !Number.isFinite(trials)
    || !Number.isFinite(z)
    || !Number.isInteger(matches)
    || !Number.isInteger(trials)
    || matches < 0
    || trials <= 0
    || matches > trials
  ) {
    return null;
  }

  const result = wilsonIntervalFromProportion(matches / trials, trials, z);
  if (result === null) return null;
  if (matches === 0) result.low = 0;
  if (matches === trials) result.high = 1;
  return result;
}

/**
 * Compute Newcombe Method-10 confidence interval on the difference of two proportions.
 *
 * pHigh - pLow is the point estimate convention used by the pressure-sensitivity report.
 */
export function diffProportionCI(
  pLow: number,
  nLow: number,
  pHigh: number,
  nHigh: number,
  z = Z_95,
): { ciLow: number; ciHigh: number } | null {
  if (
    !Number.isFinite(pLow)
    || !Number.isFinite(nLow)
    || !Number.isFinite(pHigh)
    || !Number.isFinite(nHigh)
    || !Number.isFinite(z)
    || pLow < 0
    || pLow > 1
    || pHigh < 0
    || pHigh > 1
    || nLow <= 0
    || nHigh <= 0
    || z <= 0
  ) {
    return null;
  }

  const lowWilson = wilsonIntervalFromProportion(pLow, nLow, z);
  const highWilson = wilsonIntervalFromProportion(pHigh, nHigh, z);
  if (lowWilson === null || highWilson === null) return null;

  const delta = pHigh - pLow;
  const lowerRadius = Math.sqrt(
    Math.max(0, (pHigh - highWilson.low) ** 2 + (lowWilson.high - pLow) ** 2),
  );
  const upperRadius = Math.sqrt(
    Math.max(0, (highWilson.high - pHigh) ** 2 + (pLow - lowWilson.low) ** 2),
  );

  return {
    ciLow: delta - lowerRadius,
    ciHigh: delta + upperRadius,
  };
}

/**
 * Compute a t-based CI over per-pair deltas.
 */
export function tBasedMeanCI(
  values: ReadonlyArray<number>,
  alpha = 0.05,
): { mean: number | null; ciLow: number | null; ciHigh: number | null; n: number } {
  const usable = values.filter(isFiniteNumber);
  const n = usable.length;
  if (n === 0) {
    return { mean: null, ciLow: null, ciHigh: null, n: 0 };
  }

  const mean = sumNumbers(usable) / n;
  if (n < 2) {
    return { mean, ciLow: null, ciHigh: null, n };
  }

  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) {
    return { mean, ciLow: null, ciHigh: null, n };
  }

  const sd = sampleStandardDeviation(usable, mean);
  const t = studentTQuantile(1 - alpha / 2, n - 1);
  if (!Number.isFinite(t)) {
    return { mean, ciLow: null, ciHigh: null, n };
  }

  const margin = t * sd / Math.sqrt(n);
  return {
    mean,
    ciLow: mean - margin,
    ciHigh: mean + margin,
    n,
  };
}

/**
 * Reduce a canonical first × second grid to a pooled Pressure response per pair.
 */
export function pooledDirectionalReduction(
  grid: ReadonlyArray<Cell>,
  minN: number,
): PressureResponseResult {
  const directionalCells = grid.filter(
    (cell) => cell.ownLevel >= 4 && cell.opponentLevel <= 3,
  );
  const mirrorCells = grid.filter(
    (cell) => cell.opponentLevel >= 4 && cell.ownLevel <= 3,
  );
  const baselineCells = grid.filter(
    (cell) => cell.ownLevel === cell.opponentLevel,
  );

  const directionalTrials = sumNumbers(directionalCells.map((cell) => cell.n));
  const mirrorTrials = sumNumbers(mirrorCells.map((cell) => cell.n));
  const baselineTrials = sumNumbers(baselineCells.map((cell) => cell.n));
  const qualifyingTrials = directionalTrials + mirrorTrials + baselineTrials;
  const baselineSuccesses = sumNumbers(baselineCells.map((cell) => cell.successes));
  const baselineRate = baselineTrials === 0 ? null : baselineSuccesses / baselineTrials;
  const directionalSuccesses = sumNumbers(directionalCells.map((cell) => cell.successes));
  const mirrorSuccesses = sumNumbers(mirrorCells.map((cell) => cell.successes));

  const thin = directionalTrials < minN || mirrorTrials < minN;
  if (thin) {
    const reason: PressureResponseReason =
      directionalTrials < minN && mirrorTrials < minN
        ? 'directional-and-inverted-thin'
        : directionalTrials < minN
          ? 'directional-thin'
          : 'inverted-thin';
    return {
      value: null,
      ciLow: null,
      ciHigh: null,
      baselineRate,
      pushTowardFirstRate: directionalTrials > 0 ? directionalSuccesses / directionalTrials : null,
      pushTowardSecondRate: mirrorTrials > 0 ? mirrorSuccesses / mirrorTrials : null,
      reason,
      qualifyingTrials,
    };
  }

  const pushTowardFirstRate = directionalSuccesses / directionalTrials;
  const pushTowardSecondRate = mirrorSuccesses / mirrorTrials;
  const ci = diffProportionCI(
    pushTowardSecondRate,
    mirrorTrials,
    pushTowardFirstRate,
    directionalTrials,
  );

  return {
    value: pushTowardFirstRate - pushTowardSecondRate,
    ciLow: ci?.ciLow ?? null,
    ciHigh: ci?.ciHigh ?? null,
    baselineRate,
    pushTowardFirstRate,
    pushTowardSecondRate,
    reason: baselineRate === null ? 'baseline-thin' : null,
    qualifyingTrials,
  };
}

export function summarizePressureResponse(
  perPairPressureResponses: ReadonlyArray<number>,
): PressureResponseSummary {
  const usable = perPairPressureResponses.filter(isFiniteNumber);
  if (usable.length === 0) {
    return { mean: null, rangeMin: null, rangeMax: null, pairsMeasured: 0 };
  }

  return {
    mean: sumNumbers(usable) / usable.length,
    rangeMin: Math.min(...usable),
    rangeMax: Math.max(...usable),
    pairsMeasured: usable.length,
  };
}
