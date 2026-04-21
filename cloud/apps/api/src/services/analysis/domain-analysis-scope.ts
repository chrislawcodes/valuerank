export const DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE = 'all-domains' as const;

export type DomainAnalysisScope = 'DOMAIN' | 'ALL_DOMAINS';

export function parseDomainAnalysisScope(value: string | null | undefined): DomainAnalysisScope {
  return value === DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE ? 'ALL_DOMAINS' : 'DOMAIN';
}

export function formatDomainAnalysisScope(scope: DomainAnalysisScope): string | null {
  return scope === 'ALL_DOMAINS' ? DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE : null;
}
