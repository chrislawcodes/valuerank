import { type ModelEntry, VALUES, VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';

export type CalculationMethod = 'weighted-euclidean' | 'cosine' | 'spearman' | 'kendall' | 'absolute-value';
export type MetricView = 'distance' | 'similarity';

export type PairStep = {
  valueKey: ValueKey;
  valueLabel: string;
  leftWinRate: number | null;
  rightWinRate: number | null;
  leftDerived: number | null;
  rightDerived: number | null;
  diff: number | null;
  diffSquared: number | null;
  weight: number | null;
  weightedDiffSquared: number | null;
};

export type KendallStep = {
  leftValueKey: ValueKey;
  rightValueKey: ValueKey;
  pairLabel: string;
  leftDiff: number | null;
  rightDiff: number | null;
  outcome: 'concordant' | 'discordant' | 'tie-left' | 'tie-right' | 'tie-both';
};

export type PairMetric = {
  left: ModelEntry;
  right: ModelEntry;
  method: CalculationMethod;
  steps: PairStep[];
  kendallSteps: KendallStep[];
  usedValueCount: number;
  rawScore: number | null;
  distance: number | null;
  similarity: number | null;
  summaryLabel: string;
  summaryNote: string;
  summaryRows: Array<{ label: string; value: number | null }>;
};

export const CALCULATION_METHODS: Array<{ value: CalculationMethod; label: string }> = [
  { value: 'weighted-euclidean', label: 'Weighted Euclidean' },
  { value: 'cosine', label: 'Cosine' },
  { value: 'spearman', label: 'Spearman' },
  { value: 'kendall', label: 'Kendall' },
  { value: 'absolute-value', label: 'Absolute Value' },
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

export function formatMetricNumber(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toFixed(2);
}

export function getHeatColor(intensity: number): string {
  const clamped = Math.max(0, Math.min(1, intensity));
  const stops = [
    { at: 0, rgb: [220, 38, 38] },
    { at: 0.5, rgb: [250, 204, 21] },
    { at: 1, rgb: [22, 163, 74] },
  ] as const;

  const rightIndex = clamped <= 0.5 ? 1 : 2;
  const left = stops[rightIndex - 1] ?? stops[0];
  const right = stops[rightIndex] ?? stops[stops.length - 1];
  const localT = (clamped - left.at) / (right.at - left.at);
  const r = Math.round(left.rgb[0] + (right.rgb[0] - left.rgb[0]) * localT);
  const g = Math.round(left.rgb[1] + (right.rgb[1] - left.rgb[1]) * localT);
  const b = Math.round(left.rgb[2] + (right.rgb[2] - left.rgb[2]) * localT);
  return `rgba(${r}, ${g}, ${b}, 0.24)`;
}

export function formatViewValue(metric: PairMetric | null, view: MetricView): string {
  if (metric == null || metric.usedValueCount === 0) return '—';
  return view === 'similarity'
    ? formatMetricNumber(metric.similarity)
    : formatMetricNumber(metric.distance);
}

export function getCellIntensity(metric: PairMetric | null): number {
  if (metric == null || metric.usedValueCount === 0) return 0;
  return metric.similarity ?? 0;
}

export function getMethodCopy(method: CalculationMethod) {
  switch (method) {
    case 'weighted-euclidean':
      return {
        summaryLabel: 'Weighted Euclidean distance',
        summaryNote: 'Smaller means the two models are closer.',
        helpCopy: 'We compare the win rate for each value, then use weighted Euclidean distance to see how close two models are.',
      };
    case 'cosine':
      return {
        summaryLabel: 'Cosine similarity',
        summaryNote: 'Bigger means the two models are closer.',
        helpCopy: 'We center each model around its own average win rate, then compare the direction of the two value patterns.',
      };
    case 'spearman':
      return {
        summaryLabel: 'Spearman rho',
        summaryNote: 'Bigger means the two models are closer.',
        helpCopy: 'We rank the values for each model, then compare how well the two rank orders line up.',
      };
    case 'kendall':
      return {
        summaryLabel: 'Kendall tau-b',
        summaryNote: 'Bigger means the two models are closer.',
        helpCopy: 'We compare every pair of values and count how often the two models keep the same order.',
      };
    case 'absolute-value':
      return {
        summaryLabel: 'Mean absolute difference',
        summaryNote: 'Smaller means the two models are closer.',
        helpCopy: 'We take the absolute value of the win-rate difference for each value, then average them.',
      };
  }
}

function rankValues(values: Array<{ valueKey: ValueKey; value: number }>): Map<ValueKey, number> {
  const sorted = [...values].sort((left, right) => {
    if (right.value !== left.value) return right.value - left.value;
    return left.valueKey.localeCompare(right.valueKey);
  });

  const ranks = new Map<ValueKey, number>();
  let index = 0;

  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && Math.abs(sorted[end]!.value - sorted[index]!.value) < 1e-9) {
      end += 1;
    }

    const averageRank = ((index + 1) + end) / 2;
    for (let i = index; i < end; i += 1) {
      ranks.set(sorted[i]!.valueKey, averageRank);
    }
    index = end;
  }

  return ranks;
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length === 0 || xs.length !== ys.length) return null;

  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;

  let numerator = 0;
  let sumSquaredX = 0;
  let sumSquaredY = 0;

  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index]! - meanX;
    const dy = ys[index]! - meanY;
    numerator += dx * dy;
    sumSquaredX += dx * dx;
    sumSquaredY += dy * dy;
  }

  const denominator = Math.sqrt(sumSquaredX * sumSquaredY);
  if (denominator === 0) return null;
  return numerator / denominator;
}

function cosineSimilarity(xs: number[], ys: number[]): number | null {
  if (xs.length === 0 || xs.length !== ys.length) return null;

  let dot = 0;
  let sumSquaredX = 0;
  let sumSquaredY = 0;

  for (let index = 0; index < xs.length; index += 1) {
    dot += xs[index]! * ys[index]!;
    sumSquaredX += xs[index]! * xs[index]!;
    sumSquaredY += ys[index]! * ys[index]!;
  }

  const denominator = Math.sqrt(sumSquaredX * sumSquaredY);
  if (denominator === 0) return null;
  return dot / denominator;
}

function buildDisplayScores(rawScore: number | null, method: CalculationMethod): { distance: number | null; similarity: number | null } {
  if (rawScore == null) return { distance: null, similarity: null };

  if (method === 'weighted-euclidean' || method === 'absolute-value') {
    return {
      distance: rawScore,
      similarity: clamp01(1 - rawScore / 100),
    };
  }

  const similarity = clamp01((rawScore + 1) / 2);
  return {
    distance: clamp01(1 - similarity),
    similarity,
  };
}

export function computePairMetric(left: ModelEntry, right: ModelEntry, method: CalculationMethod): PairMetric {
  const comparableValues = VALUES.map((valueKey) => {
    const valueLabel = VALUE_LABELS[valueKey];
    const leftWinRate = left.winRates?.[valueKey] ?? null;
    const rightWinRate = right.winRates?.[valueKey] ?? null;
    return { valueKey, valueLabel, leftWinRate, rightWinRate };
  }).filter((entry) => entry.leftWinRate != null && entry.rightWinRate != null);

  const copy = getMethodCopy(method);

  if (method === 'weighted-euclidean') {
    const steps: PairStep[] = comparableValues.map((entry) => {
      const diff = (entry.leftWinRate ?? 0) - (entry.rightWinRate ?? 0);
      const diffSquared = diff * diff;
      return {
        ...entry,
        leftDerived: null,
        rightDerived: null,
        diff,
        diffSquared,
        weight: 1,
        weightedDiffSquared: diffSquared,
      };
    });

    const usedValueCount = steps.length;
    const sumWeightedDiffSquared = steps.reduce((sum, step) => sum + (step.weightedDiffSquared ?? 0), 0);
    const rawScore = usedValueCount === 0 ? null : Math.sqrt(sumWeightedDiffSquared / usedValueCount);
    const displayScores = buildDisplayScores(rawScore, method);

    return {
      left,
      right,
      method,
      steps,
      kendallSteps: [],
      usedValueCount,
      rawScore,
      distance: displayScores.distance,
      similarity: displayScores.similarity,
      summaryLabel: copy.summaryLabel,
      summaryNote: copy.summaryNote,
      summaryRows: [
        { label: 'Sum of weighted diff²', value: sumWeightedDiffSquared },
        { label: 'Divide by count', value: usedValueCount === 0 ? null : sumWeightedDiffSquared / usedValueCount },
        { label: 'Square root = distance', value: rawScore },
      ],
    };
  }

  if (method === 'absolute-value') {
    const steps: PairStep[] = comparableValues.map((entry) => {
      const diff = (entry.leftWinRate ?? 0) - (entry.rightWinRate ?? 0);
      return {
        ...entry,
        leftDerived: null,
        rightDerived: null,
        diff,
        diffSquared: null,
        weight: null,
        weightedDiffSquared: null,
      };
    });

    const usedValueCount = steps.length;
    const sumAbsDiff = steps.reduce((sum, step) => sum + Math.abs(step.diff ?? 0), 0);
    const rawScore = usedValueCount === 0 ? null : sumAbsDiff / usedValueCount;
    const displayScores = buildDisplayScores(rawScore, method);

    return {
      left,
      right,
      method,
      steps,
      kendallSteps: [],
      usedValueCount,
      rawScore,
      distance: displayScores.distance,
      similarity: displayScores.similarity,
      summaryLabel: copy.summaryLabel,
      summaryNote: copy.summaryNote,
      summaryRows: [
        { label: 'Sum of |diff|', value: sumAbsDiff },
        { label: 'Divide by count', value: usedValueCount === 0 ? null : sumAbsDiff / usedValueCount },
        { label: 'Mean absolute difference', value: rawScore },
      ],
    };
  }

  if (method === 'cosine') {
    const leftValues = comparableValues.map((entry) => entry.leftWinRate ?? 0);
    const rightValues = comparableValues.map((entry) => entry.rightWinRate ?? 0);
    const leftMean = leftValues.reduce((sum, value) => sum + value, 0) / leftValues.length;
    const rightMean = rightValues.reduce((sum, value) => sum + value, 0) / rightValues.length;

    const steps: PairStep[] = comparableValues.map((entry) => {
      const leftDerived = (entry.leftWinRate ?? 0) - leftMean;
      const rightDerived = (entry.rightWinRate ?? 0) - rightMean;
      return {
        ...entry,
        leftDerived,
        rightDerived,
        diff: null,
        diffSquared: null,
        weight: null,
        weightedDiffSquared: null,
      };
    });

    const leftCentered = steps.map((step) => step.leftDerived ?? 0);
    const rightCentered = steps.map((step) => step.rightDerived ?? 0);
    const rawScore = cosineSimilarity(leftCentered, rightCentered);
    const displayScores = buildDisplayScores(rawScore, method);
    const dot = steps.reduce((sum, step) => sum + ((step.leftDerived ?? 0) * (step.rightDerived ?? 0)), 0);
    const leftNorm = Math.sqrt(leftCentered.reduce((sum, value) => sum + value * value, 0));
    const rightNorm = Math.sqrt(rightCentered.reduce((sum, value) => sum + value * value, 0));

    return {
      left,
      right,
      method,
      steps,
      kendallSteps: [],
      usedValueCount: steps.length,
      rawScore,
      distance: displayScores.distance,
      similarity: displayScores.similarity,
      summaryLabel: copy.summaryLabel,
      summaryNote: copy.summaryNote,
      summaryRows: [
        { label: 'Mean left win rate', value: leftMean },
        { label: 'Mean right win rate', value: rightMean },
        { label: 'Dot product', value: dot },
        { label: 'Left vector length', value: leftNorm },
        { label: 'Right vector length', value: rightNorm },
        { label: 'Cosine similarity', value: rawScore },
      ],
    };
  }

  if (method === 'spearman') {
    const leftRanks = rankValues(comparableValues.map((entry) => ({ valueKey: entry.valueKey, value: entry.leftWinRate ?? 0 })));
    const rightRanks = rankValues(comparableValues.map((entry) => ({ valueKey: entry.valueKey, value: entry.rightWinRate ?? 0 })));

    const steps: PairStep[] = comparableValues.map((entry) => {
      const leftDerived = leftRanks.get(entry.valueKey) ?? null;
      const rightDerived = rightRanks.get(entry.valueKey) ?? null;
      const diff = leftDerived == null || rightDerived == null ? null : leftDerived - rightDerived;
      const diffSquared = diff == null ? null : diff * diff;
      return {
        ...entry,
        leftDerived,
        rightDerived,
        diff,
        diffSquared,
        weight: null,
        weightedDiffSquared: null,
      };
    });

    const rankLeft = steps.map((step) => step.leftDerived ?? 0);
    const rankRight = steps.map((step) => step.rightDerived ?? 0);
    const rawScore = pearsonCorrelation(rankLeft, rankRight);
    const displayScores = buildDisplayScores(rawScore, method);
    const sumRankDiffSquared = steps.reduce((sum, step) => sum + (step.diffSquared ?? 0), 0);

    return {
      left,
      right,
      method,
      steps,
      kendallSteps: [],
      usedValueCount: steps.length,
      rawScore,
      distance: displayScores.distance,
      similarity: displayScores.similarity,
      summaryLabel: copy.summaryLabel,
      summaryNote: copy.summaryNote,
      summaryRows: [
        { label: 'Sum of rank diff²', value: sumRankDiffSquared },
        { label: 'Pearson correlation of ranks', value: rawScore },
        { label: 'Spearman rho', value: rawScore },
      ],
    };
  }

  const kendallSteps: KendallStep[] = [];
  let concordant = 0;
  let discordant = 0;
  let tieLeft = 0;
  let tieRight = 0;

  for (let leftIndex = 0; leftIndex < comparableValues.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < comparableValues.length; rightIndex += 1) {
      const leftEntry = comparableValues[leftIndex]!;
      const rightEntry = comparableValues[rightIndex]!;
      const leftDiff = (leftEntry.leftWinRate ?? 0) - (rightEntry.leftWinRate ?? 0);
      const rightDiff = (leftEntry.rightWinRate ?? 0) - (rightEntry.rightWinRate ?? 0);

      let outcome: KendallStep['outcome'];
      if (Math.abs(leftDiff) < 1e-9 && Math.abs(rightDiff) < 1e-9) {
        outcome = 'tie-both';
      } else if (Math.abs(leftDiff) < 1e-9) {
        outcome = 'tie-left';
        tieLeft += 1;
      } else if (Math.abs(rightDiff) < 1e-9) {
        outcome = 'tie-right';
        tieRight += 1;
      } else if (leftDiff * rightDiff > 0) {
        outcome = 'concordant';
        concordant += 1;
      } else {
        outcome = 'discordant';
        discordant += 1;
      }

      kendallSteps.push({
        leftValueKey: leftEntry.valueKey,
        rightValueKey: rightEntry.valueKey,
        pairLabel: `${leftEntry.valueLabel} vs ${rightEntry.valueLabel}`,
        leftDiff,
        rightDiff,
        outcome,
      });
    }
  }

  const denominator = Math.sqrt((concordant + discordant + tieLeft) * (concordant + discordant + tieRight));
  const rawScore = denominator === 0 ? null : (concordant - discordant) / denominator;
  const displayScores = buildDisplayScores(rawScore, method);

  return {
    left,
    right,
    method,
    steps: [],
    kendallSteps,
    usedValueCount: comparableValues.length,
    rawScore,
    distance: displayScores.distance,
    similarity: displayScores.similarity,
    summaryLabel: copy.summaryLabel,
    summaryNote: copy.summaryNote,
    summaryRows: [
      { label: 'Concordant pairs', value: concordant },
      { label: 'Discordant pairs', value: discordant },
      { label: 'Tie in left only', value: tieLeft },
      { label: 'Tie in right only', value: tieRight },
      { label: 'Kendall tau-b', value: rawScore },
    ],
  };
}
