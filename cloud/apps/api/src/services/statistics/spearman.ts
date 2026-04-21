type SpearmanInternalResult = {
  rho: number;
  p: number;
};

const EPSILON = 1e-12;
const LOG_GAMMA_COEFFS = [
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  Number('1.5056327351493117e-7'),
] as const;

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

function logGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  let x = Number('0.99999999999980993');
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
  return Math.max(0, Math.min(1, 2 * (1 - cdf)));
}

export type SpearmanResult = SpearmanInternalResult;

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
