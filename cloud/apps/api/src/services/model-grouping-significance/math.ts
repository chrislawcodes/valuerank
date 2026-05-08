function erfc(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const poly = (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t;
  const y = 1 - poly * Math.exp(-absX * absX);
  return 1 - sign * y;
}

function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

function meanOfSample(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function wilcoxonSignedRank(differences: number[]): { statistic: number; pValue: number; nEff: number } {
  const nonZero = differences.filter((difference) => difference !== 0);
  const nEff = nonZero.length;
  if (nEff === 0) {
    return { statistic: 0, pValue: 1, nEff: 0 };
  }

  const ranked = nonZero
    .map((difference, index) => ({ abs: Math.abs(difference), index, difference }))
    .sort((left, right) => left.abs - right.abs);

  const ranks = new Array<number>(nEff);
  let hasTies = false;
  let position = 0;
  while (position < ranked.length) {
    let end = position + 1;
    while (end < ranked.length && ranked[end]!.abs === ranked[position]!.abs) {
      end += 1;
    }
    const startRank = position + 1;
    const endRank = end;
    const averageRank = (startRank + endRank) / 2;
    if (end - position > 1) {
      hasTies = true;
    }
    for (let cursor = position; cursor < end; cursor += 1) {
      const entry = ranked[cursor]!;
      ranks[entry.index] = averageRank;
    }
    position = end;
  }

  let wPlus = 0;
  let wMinus = 0;
  for (let index = 0; index < nEff; index += 1) {
    const rank = ranks[index] ?? 0;
    if ((nonZero[index] ?? 0) > 0) {
      wPlus += rank;
    } else {
      wMinus += rank;
    }
  }

  const statistic = Math.min(wPlus, wMinus);
  let pValue = 1;

  if (!hasTies && nEff <= 25) {
    const dp = new Map<number, number>();
    dp.set(0, 1);
    for (let rank = 1; rank <= nEff; rank += 1) {
      const snapshot = Array.from(dp.entries());
      for (const [sum, count] of snapshot) {
        const nextSum = sum + rank;
        dp.set(nextSum, (dp.get(nextSum) ?? 0) + count);
      }
    }

    const totalAssignments = 2 ** nEff;
    let extreme = 0;
    for (const [sum, count] of dp.entries()) {
      if (sum <= statistic) {
        extreme += count;
      }
    }
    pValue = Math.min(1, (2 * extreme) / totalAssignments);
  } else {
    const mu = (nEff * (nEff + 1)) / 4;
    const sigma = Math.sqrt((nEff * (nEff + 1) * (2 * nEff + 1)) / 24);
    if (sigma === 0) {
      pValue = 1;
    } else {
      const z = (statistic + 0.5 - mu) / sigma;
      pValue = Math.min(1, 2 * normalCdf(-Math.abs(z)));
    }
  }

  return { statistic, pValue, nEff };
}

export function rankBiserialCorrelation(w: number, nEff: number): number {
  return 1 - (2 * w) / (nEff * (nEff + 1));
}

export function bootstrapMeanDiffCI(
  differences: number[],
  alpha = 0.05,
  nResamples = 1000,
): { low: number; high: number } {
  if (differences.length === 0) {
    return { low: 0, high: 0 };
  }

  const means: number[] = [];
  for (let iteration = 0; iteration < nResamples; iteration += 1) {
    const sample: number[] = [];
    for (let index = 0; index < differences.length; index += 1) {
      const selected = differences[Math.floor(Math.random() * differences.length)] ?? 0;
      sample.push(selected);
    }
    means.push(meanOfSample(sample));
  }

  means.sort((left, right) => left - right);
  const lowIndex = Math.max(0, Math.floor((alpha / 2) * nResamples));
  const highIndex = Math.max(0, Math.floor((1 - alpha / 2) * nResamples));
  const low = means[Math.min(lowIndex, means.length - 1)] ?? 0;
  const high = means[Math.min(highIndex, means.length - 1)] ?? 0;
  return { low, high };
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

export function classifyEffectSize(r: number | null): 'Weak' | 'Strong' {
  if (r == null || !Number.isFinite(r)) return 'Weak';
  return Math.abs(r) >= 0.3 ? 'Strong' : 'Weak';
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
  return classifyEffectSize(params.effectSize) === 'Weak' ? 'Weak' : 'Significant';
}
