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

export type SpearmanResult = {
  rho: number;
  p: number;
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
const LOG_GAMMA_COEFFS = [
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
] as const;

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

function logGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  let x = 0.9999999999998099;
  const shifted = z - 1;
  for (let index = 0; index < LOG_GAMMA_COEFFS.length; index += 1) {
    x += LOG_GAMMA_COEFFS[index]! / (shifted + index + 1);
  }
  const t = shifted + LOG_GAMMA_COEFFS.length - 0.5;
  return 0.9189385332046727 + (shifted + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITERATIONS = 200;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITERATIONS; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < 3e-7) {
      break;
    }
  }

  return h;
}

function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const bt = Math.exp(
    logGamma(a + b)
    - logGamma(a)
    - logGamma(b)
    + a * Math.log(x)
    + b * Math.log(1 - x),
  );

  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(a, b, x)) / a;
  }

  return 1 - ((bt * betaContinuedFraction(b, a, 1 - x)) / b);
}

function studentTCdf(t: number, df: number): number {
  if (df <= 0) return Number.NaN;
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const ibeta = regularizedIncompleteBeta(df / 2, 0.5, x);
  if (t >= 0) {
    return 1 - (ibeta / 2);
  }
  return ibeta / 2;
}

function rankValues(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((left, right) => left.value - right.value);

  const ranks = new Array<number>(values.length);
  let position = 0;
  while (position < indexed.length) {
    let end = position + 1;
    while (end < indexed.length && indexed[end]!.value === indexed[position]!.value) {
      end += 1;
    }
    const averageRank = (position + 1 + end) / 2;
    for (let cursor = position; cursor < end; cursor += 1) {
      ranks[indexed[cursor]!.index] = averageRank;
    }
    position = end;
  }

  return ranks;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0 || y.length !== n) {
    return Number.NaN;
  }

  const meanX = x.reduce((sum, value) => sum + value, 0) / n;
  const meanY = y.reduce((sum, value) => sum + value, 0) / n;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (let index = 0; index < n; index += 1) {
    const deltaX = x[index]! - meanX;
    const deltaY = y[index]! - meanY;
    covariance += deltaX * deltaY;
    varianceX += deltaX * deltaX;
    varianceY += deltaY * deltaY;
  }

  if (varianceX <= EPSILON || varianceY <= EPSILON) {
    return Number.NaN;
  }

  return covariance / Math.sqrt(varianceX * varianceY);
}

function twoSidedTPValue(tStatistic: number, df: number): number {
  if (!Number.isFinite(tStatistic)) {
    return 0;
  }
  if (df <= 0) {
    return Number.NaN;
  }
  const cdf = studentTCdf(Math.abs(tStatistic), df);
  if (!Number.isFinite(cdf)) {
    return Number.NaN;
  }
  return clamp01(2 * (1 - cdf));
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

export function spearmanRankCorrelation(x: number[], y: number[]): SpearmanResult {
  if (x.length !== y.length) {
    throw new RangeError('Spearman inputs must have the same length');
  }
  if (x.length < 2) {
    return { rho: 0, p: 1 };
  }

  const ranksX = rankValues(x);
  const ranksY = rankValues(y);
  const rho = pearsonCorrelation(ranksX, ranksY);
  if (!Number.isFinite(rho)) {
    return { rho: 0, p: 1 };
  }

  if (Math.abs(rho) >= 1) {
    return { rho: Math.sign(rho), p: 0 };
  }

  const df = x.length - 2;
  if (df <= 0) {
    return { rho, p: 1 };
  }

  const tStatistic = rho * Math.sqrt(df / Math.max(EPSILON, 1 - rho * rho));
  return {
    rho,
    p: twoSidedTPValue(tStatistic, df),
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
