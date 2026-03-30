import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { useDomains } from '../hooks/useDomains';
import { CoverageMatrix } from '../components/domains/CoverageMatrix';

export function DomainCoverage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();

  const [selectedDomainId, setSelectedDomainId] = useState<string>(
    searchParams.get('domainId') ?? ''
  );

  // Ensure a domain is selected by default
  useEffect(() => {
    if (domains.length === 0) return;
    const selectedExists =
      selectedDomainId !== '' && domains.some((domain) => domain.id === selectedDomainId);
    if (selectedExists) return;
    setSelectedDomainId(domains[0]?.id ?? '');
  }, [domains, selectedDomainId]);

  // Sync URL state for domainId
  useEffect(() => {
    if (selectedDomainId === '') return;
    const next = new URLSearchParams(searchParams);
    const currentDomain = searchParams.get('domainId');
    if (currentDomain !== selectedDomainId) {
      next.set('domainId', selectedDomainId);
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedDomainId, setSearchParams]);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Value Coverage</h1>
        <p className="mt-1 text-sm text-gray-600">
          Visualize batch density across the 10 canonical Schwartz value pairs for this domain.
        </p>
      </div>

      {domainsError && (
        <ErrorMessage message={`Failed to load domains: ${domainsError.message}`} />
      )}

      {/* Domain picker */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <h2 className="text-sm font-semibold text-gray-900 min-w-[140px]">Domain Selection</h2>
          <select
            aria-label="Domain Selection"
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 flex-1 max-w-sm"
            value={selectedDomainId}
            onChange={(event) => {
              const newDomainId = event.target.value;
              if (newDomainId !== selectedDomainId) {
                setSelectedDomainId(newDomainId);
              }
            }}
            disabled={domainsLoading || domains.length === 0}
          >
            {domains.length === 0 && <option value="">No domains available</option>}
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {selectedDomainId !== '' && <CoverageMatrix domainId={selectedDomainId} />}
    </div>
  );
}
