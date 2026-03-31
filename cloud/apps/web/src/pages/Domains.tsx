import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { CoverageMatrix } from '../components/domains/CoverageMatrix';
import { useDomains } from '../hooks/useDomains';

type FolderKey = string;

export function Domains() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialSelectedFolder = searchParams.get('domainId');
  const [selectedFolder, setSelectedFolder] = useState<FolderKey>(initialSelectedFolder ?? '');

  const {
    domains,
    error: domainError,
  } = useDomains();

  const selectedDomain = domains.find((d) => d.id === selectedFolder) ?? null;

  // Auto-select first domain when list loads
  useEffect(() => {
    if (selectedFolder === '' && domains.length > 0 && domains[0] != null) {
      setSelectedFolder(domains[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domains]);

  // Sync domainId to URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedDomain != null) {
      next.set('domainId', selectedFolder);
    } else {
      next.delete('domainId');
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedDomain, selectedFolder, setSearchParams]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domains</h1>

      {domainError != null && (
        <ErrorMessage message={`Failed to load domains: ${domainError.message}`} />
      )}

      {domains.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
          >
            {domains.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.definitionCount})</option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={() => navigate('/domains/manage')}>
            Manage Domains
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {selectedDomain != null && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Domain workspace</p>
            <div className="mt-2">
              <h2 className="text-2xl font-serif font-medium text-[#1A1A1A]">{selectedDomain.name}</h2>
            </div>
          </div>
        )}

        {selectedDomain != null ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-lg font-medium text-[#1A1A1A]">Value coverage</h3>
            <p className="mt-1 mb-4 text-sm text-gray-600">
              Batch density across Schwartz value pairs. Green cells (10+ batches) indicate well-covered pairs; red cells (&lt;3) or empty cells show gaps.
            </p>
            <CoverageMatrix domainId={selectedDomain.id} />
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Select a domain to see its overview.
          </div>
        )}
      </div>
    </div>
  );
}
