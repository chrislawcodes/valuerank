type WeightedDomainContribution = {
  evidenceWeight: number;
  winRate: number;
};

type DomainContribution = {
  winRate: number;
};

export function computePooledWinRate(domains: WeightedDomainContribution[]): number | null {
  if (domains.length === 0) return null;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const domain of domains) {
    if (!Number.isFinite(domain.evidenceWeight) || domain.evidenceWeight <= 0) continue;
    weightedSum += domain.winRate * domain.evidenceWeight;
    totalWeight += domain.evidenceWeight;
  }

  if (totalWeight <= 0) return null;
  return weightedSum / totalWeight;
}

export function computeStabilityScore(domains: DomainContribution[]): number | null {
  if (domains.length < 2) return null;

  const mean = domains.reduce((acc, domain) => acc + domain.winRate, 0) / domains.length;
  const mad = domains.reduce((acc, domain) => acc + Math.abs(domain.winRate - mean), 0) / domains.length;
  return Math.max(0, 100 * (1 - mad / 50));
}
