function logCoeff(n: number, k: number): number {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  const limitedK = Math.min(k, n - k);
  let total = 0;
  for (let index = 1; index <= limitedK; index += 1) {
    total += Math.log(n - limitedK + index) - Math.log(index);
  }
  return total;
}

function logSumExp(values: ReadonlyArray<number>): number {
  if (values.length === 0) return Number.NEGATIVE_INFINITY;
  const maxValue = Math.max(...values);
  if (!Number.isFinite(maxValue)) return maxValue;

  let sum = 0;
  for (const value of values) {
    sum += Math.exp(value - maxValue);
  }
  return maxValue + Math.log(sum);
}

export function exactMcNemar(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;

  const minVal = Math.min(b, c);
  const logTerms: number[] = [];
  for (let k = 0; k <= minVal; k += 1) {
    logTerms.push(logCoeff(n, k) + n * Math.log(0.5));
  }

  const tailProbability = Math.exp(logSumExp(logTerms));
  return Math.min(1, 2 * tailProbability);
}

export function matchedPairsOddsRatio(b: number, c: number): number | null {
  if (b === 0 && c === 0) return 1;
  if (b === 0 || c === 0) return null;
  return c / b;
}

export function oddsRatioCI(b: number, c: number, _alpha: number): { low: number | null; high: number | null } {
  if (b === 0 || c === 0) {
    return { low: null, high: null };
  }

  const standardError = Math.sqrt((1 / b) + (1 / c));
  const z = 1.96;
  const logOddsRatio = Math.log(c / b);
  return {
    low: Math.exp(logOddsRatio - z * standardError),
    high: Math.exp(logOddsRatio + z * standardError),
  };
}

export function holmBonferroni(values: ReadonlyArray<number | null>): Array<number | null> {
  const indexed = values
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => entry.value != null && Number.isFinite(entry.value))
    .sort((left, right) => left.value - right.value);

  const adjusted = new Array<number | null>(values.length).fill(null);
  let runningMax = 0;

  for (let rank = 0; rank < indexed.length; rank += 1) {
    const entry = indexed[rank]!;
    const multiplier = indexed.length - rank;
    const rawAdjusted = Math.min(1, entry.value * multiplier);
    runningMax = Math.max(runningMax, rawAdjusted);
    adjusted[entry.index] = runningMax;
  }

  return adjusted;
}

export function classifyEffectSize(oddsRatio: number | null): 'Weak' | 'Strong' {
  if (oddsRatio == null || !Number.isFinite(oddsRatio)) return 'Weak';
  return oddsRatio >= 0.5 && oddsRatio <= 2 ? 'Weak' : 'Strong';
}

export function classifyVerdict(params: {
  correctedPValue: number | null;
  oddsRatio: number | null;
  alpha?: number;
}): 'Significant' | 'Weak' | 'Not significant' {
  const alpha = params.alpha ?? 0.05;
  if (params.correctedPValue == null || !Number.isFinite(params.correctedPValue) || params.correctedPValue >= alpha) {
    return 'Not significant';
  }

  return classifyEffectSize(params.oddsRatio) === 'Weak' ? 'Weak' : 'Significant';
}
