import { spearmanRankCorrelation } from '../statistics/spearman.js';
export { spearmanRankCorrelation } from '../statistics/spearman.js';

export type CanonicalAppealLevel =
  | 'strongly'
  | 'somewhat'
  | 'neutral'
  | 'opponentSomewhat'
  | 'opponentStrongly';

export type WilsonIntervalResult = {
  low: number;
  high: number;
  p: number;
};

export type DlsScenarioStat = {
  p: number;
  n: number;
};

export type DlsPoolResult = {
  estimate: number;
  ciLow: number;
  ciHigh: number;
  withinSd: number;
  betweenSd: number;
  tauSquared: number;
};

export type CoherenceConditionStat = {
  pressureRank: number;
  winRate: number;
};

export type CoherenceResult = {
  rho: number | null;
  p: number | null;
  coherent: boolean;
  determinate: boolean;
};

const Z_95 = 1.96;
const EPSILON = 1e-12;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateProportion(matches: number, trials: number): void {
  if (!Number.isInteger(matches) || !Number.isInteger(trials)) {
    throw new RangeError('matches and trials must be integers');
  }
  if (matches < 0 || trials < 0 || matches > trials) {
    throw new RangeError('matches must be between 0 and trials');
  }
}

function scenarioMatchesFromProportion(p: number, n: number): number {
  return Math.max(0, Math.min(n, Math.round(p * n)));
}

export function wilsonInterval(matches: number, trials: number, z = Z_95): WilsonIntervalResult {
  validateProportion(matches, trials);
  if (trials === 0) {
    return { low: 0, high: 0, p: 0 };
  }

  const p = matches / trials;
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

export function dersimonianLairdPool(scenarioStats: DlsScenarioStat[]): DlsPoolResult {
  const usable = scenarioStats.filter((entry) => isFiniteNumber(entry.p) && isFiniteNumber(entry.n) && entry.n > 0);
  if (usable.length === 0) {
    return {
      estimate: 0,
      ciLow: 0,
      ciHigh: 0,
      withinSd: 0,
      betweenSd: 0,
      tauSquared: 0,
    };
  }

  if (usable.length === 1) {
    const scenario = usable[0]!;
    const matches = scenarioMatchesFromProportion(scenario.p, scenario.n);
    const wilson = wilsonInterval(matches, scenario.n);
    const variance = Math.pow((wilson.high - wilson.low) / (2 * Z_95), 2);
    return {
      estimate: wilson.p,
      ciLow: wilson.low,
      ciHigh: wilson.high,
      withinSd: Math.sqrt(variance),
      betweenSd: 0,
      tauSquared: 0,
    };
  }

  const studies = usable.map((scenario) => {
    const matches = scenarioMatchesFromProportion(scenario.p, scenario.n);
    const wilson = wilsonInterval(matches, scenario.n);
    const variance = Math.max(EPSILON, Math.pow((wilson.high - wilson.low) / (2 * Z_95), 2));
    return {
      p: wilson.p,
      variance,
      weight: 1 / variance,
    };
  });

  const fixedWeightTotal = studies.reduce((sum, study) => sum + study.weight, 0);
  const fixedEstimate = studies.reduce((sum, study) => sum + study.weight * study.p, 0) / fixedWeightTotal;
  const q = studies.reduce((sum, study) => sum + study.weight * Math.pow(study.p - fixedEstimate, 2), 0);
  const c = fixedWeightTotal - (
    studies.reduce((sum, study) => sum + (study.weight * study.weight), 0) / fixedWeightTotal
  );
  const tauSquared = Math.max(0, (q - (studies.length - 1)) / (c <= EPSILON ? Number.POSITIVE_INFINITY : c));
  const betweenSd = Math.sqrt(tauSquared);

  const randomStudies = studies.map((study) => {
    const variance = study.variance + tauSquared;
    return {
      p: study.p,
      weight: 1 / Math.max(EPSILON, variance),
    };
  });

  const randomWeightTotal = randomStudies.reduce((sum, study) => sum + study.weight, 0);
  const estimate = randomStudies.reduce((sum, study, index) => sum + study.weight * studies[index]!.p, 0) / randomWeightTotal;
  const se = Math.sqrt(1 / randomWeightTotal);
  const ciLow = clamp01(estimate - Z_95 * se);
  const ciHigh = clamp01(estimate + Z_95 * se);
  const withinSd = Math.sqrt(studies.reduce((sum, study) => sum + study.variance, 0) / studies.length);

  return {
    estimate,
    ciLow,
    ciHigh,
    withinSd,
    betweenSd,
    tauSquared,
  };
}

export function coherenceForPair(conditionStats: CoherenceConditionStat[]): CoherenceResult {
  const usable = conditionStats.filter((entry) => isFiniteNumber(entry.pressureRank) && isFiniteNumber(entry.winRate));
  if (usable.length < 3) {
    return { rho: null, p: null, coherent: false, determinate: false };
  }

  const pressureRanks = usable.map((entry) => entry.pressureRank);
  const winRates = usable.map((entry) => entry.winRate);
  const pressureVariance = new Set(pressureRanks.map((value) => value.toFixed(12))).size;
  const winRateVariance = new Set(winRates.map((value) => value.toFixed(12))).size;

  if (pressureVariance < 2 || winRateVariance < 2) {
    return { rho: null, p: null, coherent: false, determinate: false };
  }

  const { rho, p } = spearmanRankCorrelation(pressureRanks, winRates);
  if (!Number.isFinite(rho) || !Number.isFinite(p)) {
    return { rho: null, p: null, coherent: false, determinate: false };
  }

  return {
    rho,
    p,
    coherent: rho >= 0.8 && p < 0.05,
    determinate: true,
  };
}

export function netPressureRank(level: CanonicalAppealLevel | string | null | undefined): number | null {
  switch (level) {
    case 'strongly':
      return 2;
    case 'somewhat':
      return 1;
    case 'neutral':
      return 0;
    case 'opponentSomewhat':
      return -1;
    case 'opponentStrongly':
      return -2;
    default:
      return null;
  }
}
