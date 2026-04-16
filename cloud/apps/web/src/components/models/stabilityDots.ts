export type DotState = 'full' | 'half' | 'empty' | 'muted';

export type StabilityDomainContribution = {
  evidenceWeight: number;
  winRate: number;
};

function formatDomainCount(count: number): string {
  return `${count} eligible domain${count === 1 ? '' : 's'}`;
}

function describeStability(score: number): string {
  if (score >= 100) return 'identical';
  if (score >= 75) return 'fairly consistent';
  if (score >= 50) return 'moderately consistent';
  return 'varies significantly';
}

export function computeDots(score: number | null | undefined): DotState[] {
  if (score == null || Number.isNaN(score)) {
    return ['muted', 'muted', 'muted', 'muted', 'muted'];
  }

  const safeScore = Math.max(0, Math.min(100, score));
  const halfDots = Math.floor(safeScore / 10);
  const fullDots = Math.floor(halfDots / 2);
  const hasHalf = halfDots % 2 === 1;

  return Array.from({ length: 5 }, (_, index) => {
    if (index < fullDots) return 'full';
    if (index === fullDots && hasHalf) return 'half';
    return 'empty';
  });
}

export function computeSimpleMean(domains: StabilityDomainContribution[]): number | null {
  if (domains.length === 0) return null;
  const sum = domains.reduce((acc, d) => acc + d.winRate, 0);
  return sum / domains.length;
}

export function computeSimpleMad(domains: StabilityDomainContribution[]): number | null {
  if (domains.length === 0) return null;
  const mean = computeSimpleMean(domains);
  if (mean == null) return null;
  const sum = domains.reduce((acc, d) => acc + Math.abs(d.winRate - mean), 0);
  return sum / domains.length;
}

export function formatStabilityTooltip(
  score: number | null | undefined,
  eligibleDomainCount: number,
  mad: number | null | undefined,
  mutedBySingleDomain = false,
): string {
  if (mutedBySingleDomain) {
    return `Cross-domain stability is not available when viewing a single domain. Based on ${formatDomainCount(eligibleDomainCount)}.`;
  }

  if (eligibleDomainCount < 2 || score == null || Number.isNaN(score)) {
    return `Cross-domain stability needs at least two eligible domains. Based on ${formatDomainCount(eligibleDomainCount)}.`;
  }

  const roundedScore = Math.round(Math.max(0, Math.min(100, score)));
  const spreadText = mad != null ? ` (average spread \u2248 ${mad.toFixed(1)} points from the mean)` : '';
  return `Cross-domain stability shows how consistent this value's win rate is across domains. Score: ${roundedScore}/100 - ${describeStability(roundedScore)}${spreadText}. Based on ${formatDomainCount(eligibleDomainCount)}.`;
}
