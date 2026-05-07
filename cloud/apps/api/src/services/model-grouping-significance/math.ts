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
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function mean(values: ReadonlyArray<number>): number | null {
  const usable = values.filter(isFiniteNumber);
  if (usable.length === 0) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

export function sampleStandardDeviation(values: ReadonlyArray<number>, center: number): number | null {
  const usable = values.filter(isFiniteNumber);
  if (usable.length < 2) return null;
  const sumSquares = usable.reduce((sum, value) => {
    const delta = value - center;
    return sum + (delta * delta);
  }, 0);
  return Math.sqrt(sumSquares / (usable.length - 1));
}

function studentTQuantile(p: number, df: number): number {
  if (!Number.isFinite(p) || !Number.isFinite(df) || p <= 0 || p >= 1 || df <= 0) return NaN;
  if (df >= 120) return 1.96;
  const roundedDf = Math.round(df);
  if (roundedDf <= 0) return NaN;
  if (roundedDf <= STUDENT_T_975.length && Math.abs(p - 0.975) < 1e-6) {
    return STUDENT_T_975[roundedDf - 1] ?? 1.96;
  }
  if (roundedDf <= STUDENT_T_975.length && Math.abs(p - 0.025) < 1e-6) {
    return -(STUDENT_T_975[roundedDf - 1] ?? 1.96);
  }
  return 1.96;
}

export function pairedMeanConfidenceInterval(
  differences: ReadonlyArray<number>,
  alpha = 0.05,
): { mean: number | null; ciLow: number | null; ciHigh: number | null; n: number } {
  const usable = differences.filter(isFiniteNumber);
  const n = usable.length;
  if (n === 0) {
    return { mean: null, ciLow: null, ciHigh: null, n: 0 };
  }

  const center = mean(usable);
  if (center == null || n < 2 || !Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) {
    return { mean: center, ciLow: null, ciHigh: null, n };
  }

  const sd = sampleStandardDeviation(usable, center);
  if (sd == null) {
    return { mean: center, ciLow: null, ciHigh: null, n };
  }

  const t = studentTQuantile(1 - alpha / 2, n - 1);
  if (!Number.isFinite(t)) {
    return { mean: center, ciLow: null, ciHigh: null, n };
  }

  const margin = (t * sd) / Math.sqrt(n);
  return {
    mean: center,
    ciLow: center - margin,
    ciHigh: center + margin,
    n,
  };
}

export function pairedCohensD(differences: ReadonlyArray<number>): number | null {
  const usable = differences.filter(isFiniteNumber);
  if (usable.length === 0) return null;
  const center = mean(usable);
  if (center == null) return null;
  const sd = sampleStandardDeviation(usable, center);
  if (sd == null || sd === 0) {
    return center === 0 ? 0 : null;
  }
  return center / sd;
}

export function pairedPermutationPValue(differences: ReadonlyArray<number>): number | null {
  const usable = differences.filter(isFiniteNumber);
  const n = usable.length;
  if (n === 0) return null;

  const observed = Math.abs(mean(usable) ?? 0);
  const total = 2 ** n;
  let extreme = 0;

  for (let mask = 0; mask < total; mask += 1) {
    let sum = 0;
    for (let index = 0; index < n; index += 1) {
      const value = usable[index] ?? 0;
      sum += (mask & (1 << index)) !== 0 ? value : -value;
    }
    const permutedMean = Math.abs(sum / n);
    if (permutedMean >= observed - 1e-12) {
      extreme += 1;
    }
  }

  return extreme / total;
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

export function classifyEffectSize(effectSize: number | null): 'Weak' | 'Strong' {
  if (effectSize == null || !Number.isFinite(effectSize)) return 'Weak';
  return Math.abs(effectSize) < 0.5 ? 'Weak' : 'Strong';
}

export function classifyVerdict(params: {
  correctedPValue: number | null;
  effectSize: number | null;
  alpha?: number;
}): 'Significant' | 'Weak' | 'Not significant' {
  const alpha = params.alpha ?? 0.05;
  if (params.correctedPValue == null || !Number.isFinite(params.correctedPValue) || params.correctedPValue >= alpha) {
    return 'Not significant';
  }
  return params.effectSize != null && Number.isFinite(params.effectSize) && Math.abs(params.effectSize) < 0.5
    ? 'Weak'
    : 'Significant';
}
