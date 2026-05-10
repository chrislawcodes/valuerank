import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { DOMAINS_QUERY, type DomainsQueryResult, type DomainsQueryVariables } from '../../api/operations/domains';
import { type RunAnomalyType } from '../../api/operations/run-anomaly';

type AnomalyTypeOption = {
  value: RunAnomalyType;
  label: string;
};

const ANOMALY_TYPE_OPTIONS: AnomalyTypeOption[] = [
  { value: 'INVALID_RESPONSE_FAILURE', label: 'Invalid response failure' },
  { value: 'MODEL_TRANSCRIPT_SHORTFALL', label: 'Model transcript shortfall' },
  { value: 'ORPHAN_TRANSCRIPT', label: 'Orphan transcript' },
  { value: 'SCHEDULED_COUNT_MISMATCH', label: 'Scheduled count mismatch' },
  { value: 'STRANDED_TRANSCRIPT', label: 'Stranded transcript' },
  { value: 'SUMMARIZING_STALL', label: 'Summarizing stall' },
];

function isRunAnomalyType(value: string | null): value is RunAnomalyType {
  if (value == null) {
    return false;
  }
  return ANOMALY_TYPE_OPTIONS.some((option) => option.value === value);
}

export function StatusFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [domainsResult] = useQuery<DomainsQueryResult, DomainsQueryVariables>({
    query: DOMAINS_QUERY,
    variables: { limit: 500, offset: 0 },
    requestPolicy: 'cache-and-network',
  });

  const domains = useMemo(
    () => [...(domainsResult.data?.domains ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [domainsResult.data?.domains],
  );

  const domainIdParam = searchParams.get('domain');
  const typeParam = searchParams.get('type');
  const domainIdSet = useMemo(() => new Set(domains.map((domain) => domain.id)), [domains]);
  const selectedDomainId = domainIdParam != null && domainIdSet.has(domainIdParam) ? domainIdParam : '';
  const selectedType = isRunAnomalyType(typeParam) ? typeParam : '';

  const updateSearchParams = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.trim() === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Domain
          </span>
          <select
            value={selectedDomainId}
            onChange={(event) => updateSearchParams('domain', event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">All Domains</option>
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
          <span className="block text-xs text-gray-500">
            Applies to both status sections.
          </span>
        </label>

        <label className="space-y-2">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Anomaly type
          </span>
          <select
            value={selectedType}
            onChange={(event) => updateSearchParams('type', event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">All Types</option>
            {ANOMALY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="block text-xs text-gray-500">
            Open Anomalies only.
          </span>
        </label>
      </div>
    </section>
  );
}
