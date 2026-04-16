export const DECISION_DISTRIBUTION_BUCKET_CODES = [
  'opponentStrongly',
  'opponentSomewhat',
  'neutral',
  'somewhat',
  'strongly',
] as const;

export type DecisionDistributionBucketCode = (typeof DECISION_DISTRIBUTION_BUCKET_CODES)[number];

export type DecisionDistributionBucket = {
  code: DecisionDistributionBucketCode;
  label: string;
  ariaLabel: string;
};

export type DecisionDistributionCounts = Record<DecisionDistributionBucketCode, number>;

function normalizeBucketCode(rawCode: string): DecisionDistributionBucketCode | null {
  const normalized = rawCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  if (normalized === 'opponentstrongly' || normalized === 'stronglyopponent') {
    return 'opponentStrongly';
  }
  if (normalized === 'opponentsomewhat' || normalized === 'somewhatopponent') {
    return 'opponentSomewhat';
  }
  if (normalized === 'neutral' || normalized === 'middle') {
    return 'neutral';
  }
  if (normalized === 'somewhat' || normalized === 'somewhatthis') {
    return 'somewhat';
  }
  if (normalized === 'strongly' || normalized === 'stronglythis') {
    return 'strongly';
  }

  if (normalized === 'stronglysupporttheothervalue' || normalized === 'stronglysupportothervalue') return 'opponentStrongly';
  if (normalized === 'somewhatsupporttheothervalue' || normalized === 'somewhatsupportothervalue') return 'opponentSomewhat';
  if (normalized === 'somewhatsupportthisvalue' || normalized === 'somewhatsupportthevalue') return 'somewhat';
  if (normalized === 'stronglysupportthisvalue' || normalized === 'stronglysupportthevalue') return 'strongly';

  return null;
}

function formatBucketLabel(
  code: DecisionDistributionBucketCode,
  dimensionLabels?: Record<string, string>,
): string {
  const label = dimensionLabels?.[code]?.trim();
  if (label && label.length > 0) {
    return label;
  }

  if (code === 'opponentStrongly') return 'Strongly support the other value';
  if (code === 'opponentSomewhat') return 'Somewhat support the other value';
  if (code === 'neutral') return 'Neutral';
  if (code === 'somewhat') return 'Somewhat support this value';
  return 'Strongly support this value';
}

export function buildDecisionDistributionBuckets(
  dimensionLabels?: Record<string, string>,
): DecisionDistributionBucket[] {
  return DECISION_DISTRIBUTION_BUCKET_CODES.map((code) => {
    const label = formatBucketLabel(code, dimensionLabels);
    return {
      code,
      label,
      ariaLabel: `${label} decision bucket`,
    };
  });
}

export function normalizeDecisionDistributionCounts(
  decisionDistribution?: Record<string, number> | null,
): DecisionDistributionCounts {
  const counts: DecisionDistributionCounts = {
    opponentStrongly: 0,
    opponentSomewhat: 0,
    neutral: 0,
    somewhat: 0,
    strongly: 0,
  };

  for (const [rawCode, value] of Object.entries(decisionDistribution ?? {})) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }

    const code = normalizeBucketCode(rawCode);
    if (code === null) {
      continue;
    }

    counts[code] += value;
  }

  return counts;
}

export function getDecisionDistributionEmptyState(): string {
  return 'No decision distribution data available';
}

export function getDecisionDistributionHelperText(): string {
  return 'Buckets are ordered from strongest support for the other value to strongest support for this value.';
}

export function getDecisionDistributionChartAriaLabel(
  buckets: DecisionDistributionBucket[],
): string {
  if (buckets.length === 0) {
    return 'Decision distribution chart.';
  }

  return `Decision distribution chart showing buckets ordered from ${buckets
    .map((bucket) => bucket.label)
    .join(', ')}.`;
}
