export const ORDER_INVARIANCE_ASSUMPTION_KEY = 'order_invariance';
export const REVERSAL_METRICS_ANALYSIS_TYPE = 'reversal_metrics_v1';
export const REVERSAL_METRICS_CODE_VERSION = 'reversal_metrics_v1';
export const MIDPOINT_SCORE = 3;
export const MIN_PULL_NON_ZERO_PAIRS = 3;
export const MIN_PULL_DIRECTION_SHARE = 2 / 3;

export type OrderEffectStableSide = 'lean_low' | 'lean_high' | 'unstable';
export type ValueOrderPullLabel = 'toward first-listed' | 'toward second-listed' | 'no clear pull';
export type ScaleOrderPullLabel = 'toward higher numbers' | 'toward lower numbers' | 'no clear pull';

export type PairLevelMarginSummary = {
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
};

export type OrderEffectComparisonRecord = {
  modelId: string;
  modelLabel: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  variantType: 'presentation_flipped' | 'scale_flipped' | 'fully_flipped';
  baselineRawDecisions: number[];
  variantRawDecisions: number[];
  baselineNormalizedDecisions: number[];
  variantNormalizedDecisions: number[];
  baselineConsideredTrials: number[];
  variantConsideredTrials: number[];
  rawBaselineConsideredTrials: number[];
  rawVariantConsideredTrials: number[];
  baselineCellScore: number | null;
  variantCellScore: number | null;
  rawBaselineCellScore: number | null;
  rawVariantCellScore: number | null;
  baselineStableSide: OrderEffectStableSide | 'neutral' | 'missing';
  variantStableSide: OrderEffectStableSide | 'neutral' | 'missing';
  matchesBaseline: boolean | null;
  reversed: boolean | null;
  withinCellDisagreement: {
    baseline: number | null;
    variant: number | null;
  };
  pairMargin: {
    baseline: number | null;
    variant: number | null;
    limiting: number | null;
  };
};

export function getConsideredTrials(values: number[], trimOutliers: boolean): number[] {
  const sorted = [...values].sort((left, right) => left - right);
  if (!trimOutliers || sorted.length < 3) {
    return sorted;
  }
  return sorted.slice(1, sorted.length - 1);
}

export function getPairedConsideredTrials(
  rawValues: number[],
  normalizedValues: number[],
  trimOutliers: boolean
): { raw: number[]; normalized: number[] } {
  const paired = normalizedValues
    .map((normalized, index) => ({
      normalized,
      raw: rawValues[index] ?? normalized,
      index,
    }))
    .sort((left, right) => (
      left.normalized - right.normalized
      || left.index - right.index
    ));

  const considered = !trimOutliers || paired.length < 3
    ? paired
    : paired.slice(1, paired.length - 1);

  return {
    raw: considered.map((entry) => entry.raw),
    normalized: considered.map((entry) => entry.normalized),
  };
}

export function computeCanonicalCellScore(consideredTrials: number[]): number | null {
  if (consideredTrials.length === 0) {
    return null;
  }

  const counts = new Map<number, number>();
  let maxCount = 0;
  for (const value of consideredTrials) {
    const nextCount = (counts.get(value) ?? 0) + 1;
    counts.set(value, nextCount);
    maxCount = Math.max(maxCount, nextCount);
  }

  const modes = Array.from(counts.entries())
    .filter(([, count]) => count === maxCount)
    .map(([value]) => value)
    .sort((left, right) => left - right);

  if (modes.length === 1) {
    return modes[0] ?? null;
  }

  return consideredTrials[Math.floor(consideredTrials.length / 2)] ?? null;
}

export function classifyStableSide(consideredTrials: number[]): OrderEffectStableSide {
  const below = consideredTrials.filter((value) => value < MIDPOINT_SCORE).length;
  const above = consideredTrials.filter((value) => value > MIDPOINT_SCORE).length;
  const threshold = consideredTrials.length / 2;

  if (below > threshold) {
    return 'lean_low';
  }
  if (above > threshold) {
    return 'lean_high';
  }
  return 'unstable';
}

export function computeWithinCellDisagreementRate(consideredTrials: number[]): number | null {
  if (consideredTrials.length === 0) {
    return null;
  }

  const below = consideredTrials.filter((value) => value < MIDPOINT_SCORE).length;
  const above = consideredTrials.filter((value) => value > MIDPOINT_SCORE).length;

  if (below === 0 && above === 0) {
    return 0;
  }

  if (below === above) {
    return 1;
  }

  const winningCount = Math.max(below, above);
  return (consideredTrials.length - winningCount) / consideredTrials.length;
}

export function aggregateWithinCellDisagreementRate(rates: Array<number | null>): number | null {
  const presentRates = rates.filter((value): value is number => value != null);
  if (presentRates.length === 0) {
    return null;
  }
  const total = presentRates.reduce((sum, value) => sum + value, 0);
  return total / presentRates.length;
}

export function computeMatch(left: number | null, right: number | null, directionOnly: boolean): boolean | null {
  if (left == null || right == null) {
    return null;
  }

  if (!directionOnly) {
    return left === right;
  }

  const leftLow = left < MIDPOINT_SCORE;
  const leftHigh = left > MIDPOINT_SCORE;
  const rightLow = right < MIDPOINT_SCORE;
  const rightHigh = right > MIDPOINT_SCORE;

  return (leftLow && rightLow) || (leftHigh && rightHigh);
}

export function computePairMarginSummary(limitingMargins: Array<number | null>): PairLevelMarginSummary | null {
  const present = limitingMargins
    .filter((value): value is number => value != null)
    .sort((left, right) => left - right);

  if (present.length === 0) {
    return null;
  }

  return {
    mean: present.reduce((sum, value) => sum + value, 0) / present.length,
    median: percentileFromSorted(present, 0.5),
    p25: percentileFromSorted(present, 0.25),
    p75: percentileFromSorted(present, 0.75),
  };
}

export function computeValueOrderPullLabel(pairDrifts: number[]): ValueOrderPullLabel {
  const direction = computeDirectionalPull(pairDrifts);
  if (direction === 'positive') {
    return 'toward second-listed';
  }
  if (direction === 'negative') {
    return 'toward first-listed';
  }
  return 'no clear pull';
}

export function computeScaleOrderPullLabel(pairDrifts: number[]): ScaleOrderPullLabel {
  const direction = computeDirectionalPull(pairDrifts);
  if (direction === 'positive') {
    return 'toward higher numbers';
  }
  if (direction === 'negative') {
    return 'toward lower numbers';
  }
  return 'no clear pull';
}

function computeDirectionalPull(pairDrifts: number[]): 'positive' | 'negative' | 'none' {
  const nonZero = pairDrifts.filter((value) => value !== 0);
  if (nonZero.length < MIN_PULL_NON_ZERO_PAIRS) {
    return 'none';
  }

  const positive = nonZero.filter((value) => value > 0).length;
  const negative = nonZero.filter((value) => value < 0).length;
  const positiveShare = positive / nonZero.length;
  const negativeShare = negative / nonZero.length;

  if (positiveShare >= MIN_PULL_DIRECTION_SHARE) {
    return 'positive';
  }
  if (negativeShare >= MIN_PULL_DIRECTION_SHARE) {
    return 'negative';
  }
  return 'none';
}

function percentileFromSorted(values: number[], percentile: number): number {
  if (values.length === 1) {
    return values[0] ?? 0;
  }

  const index = Math.ceil(values.length * percentile) - 1;
  const boundedIndex = Math.min(Math.max(index, 0), values.length - 1);
  return values[boundedIndex] ?? values[values.length - 1] ?? 0;
}
