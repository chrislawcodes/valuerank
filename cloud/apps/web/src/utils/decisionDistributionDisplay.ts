export const DECISION_DISTRIBUTION_BUCKET_CODES = ['1', '2', '3', '4', '5'] as const;

export type DecisionDistributionBucketCode = (typeof DECISION_DISTRIBUTION_BUCKET_CODES)[number];

export type DecisionDistributionBucket = {
  code: DecisionDistributionBucketCode;
  label: string;
  ariaLabel: string;
};

export type DecisionDistributionCounts = Record<DecisionDistributionBucketCode, number>;

function formatBucketLabel(
  code: DecisionDistributionBucketCode,
  dimensionLabels?: Record<string, string>,
): string {
  const label = dimensionLabels?.[code]?.trim();
  return label && label.length > 0 ? label : `Bucket ${code}`;
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
  return DECISION_DISTRIBUTION_BUCKET_CODES.reduce((counts, code) => {
    const value = decisionDistribution?.[code];
    counts[code] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return counts;
  }, {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
  });
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
