import { createHash } from 'node:crypto';

export const DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE = 'all-domains' as const;
export const DOMAIN_ANALYSIS_DOMAIN_SET_SCOPE_PREFIX = 'domain-set' as const;

export type DomainAnalysisScope = 'DOMAIN' | 'ALL_DOMAINS' | 'DOMAIN_SET';

export type DomainAnalysisSelection = {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds: string[];
};

export function normalizeDomainIds(domainIds: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawDomainId of domainIds ?? []) {
    const domainId = String(rawDomainId).trim();
    if (domainId.length === 0 || seen.has(domainId)) {
      continue;
    }
    seen.add(domainId);
    normalized.push(domainId);
  }

  normalized.sort((left, right) => left.localeCompare(right));
  return normalized;
}

export function buildDomainAnalysisDomainSetId(domainIds: readonly string[]): string {
  const normalized = normalizeDomainIds(domainIds);
  const hash = createHash('sha256').update(normalized.join('\u0000')).digest('hex').slice(0, 16);
  return `${DOMAIN_ANALYSIS_DOMAIN_SET_SCOPE_PREFIX}:${hash}`;
}

export function resolveDomainAnalysisSelection(params: {
  scope?: string | null;
  domainId?: string | null;
  domainIds?: readonly string[] | null;
}): DomainAnalysisSelection {
  const normalizedDomainIds = normalizeDomainIds(params.domainIds);
  if (normalizedDomainIds.length >= 2) {
    return {
      scope: 'DOMAIN_SET',
      domainId: buildDomainAnalysisDomainSetId(normalizedDomainIds),
      domainIds: normalizedDomainIds,
    };
  }

  if (normalizedDomainIds.length === 1) {
    return {
      scope: 'DOMAIN',
      domainId: normalizedDomainIds[0]!,
      domainIds: normalizedDomainIds,
    };
  }

  const scopeValue = parseDomainAnalysisScope(params.scope);
  if (scopeValue === 'ALL_DOMAINS') {
    return {
      scope: 'ALL_DOMAINS',
      domainId: DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE,
      domainIds: [],
    };
  }

  const domainId = params.domainId != null ? String(params.domainId).trim() : '';
  if (domainId.length === 0) {
    return {
      scope: 'ALL_DOMAINS',
      domainId: DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE,
      domainIds: [],
    };
  }

  return {
    scope: 'DOMAIN',
    domainId,
    domainIds: [domainId],
  };
}

export function parseDomainAnalysisScope(value: string | null | undefined): DomainAnalysisScope {
  return value === DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE ? 'ALL_DOMAINS' : 'DOMAIN';
}

export function formatDomainAnalysisScope(scope: DomainAnalysisScope): string | null {
  return scope === 'ALL_DOMAINS' ? DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE : null;
}
