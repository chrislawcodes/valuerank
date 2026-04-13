import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { CopyVisualButton } from '../components/ui/CopyVisualButton';
import { CoverageMatrix } from '../components/domains/CoverageMatrix';
import { useDomains } from '../hooks/useDomains';

type FolderKey = string;

const LAST_DOMAIN_KEY = 'valuerank:lastSelectedDomainId';

export function Domains() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSelectedFolder = searchParams.get('domainId') ?? localStorage.getItem(LAST_DOMAIN_KEY) ?? '';
  const [selectedFolder, setSelectedFolder] = useState<FolderKey>(initialSelectedFolder);
  const coverageRef = useRef<HTMLDivElement>(null);

  const {
    domains,
    error: domainError,
  } = useDomains();

  const selectedDomain = domains.find((d) => d.id === selectedFolder) ?? null;

  // Auto-select best domain when list loads: last picked > first in list
  useEffect(() => {
    if (domains.length === 0) return;
    if (selectedFolder !== '' && domains.some((d) => d.id === selectedFolder)) return;
    const lastId = localStorage.getItem(LAST_DOMAIN_KEY);
    const lastDomain = lastId != null ? domains.find((d) => d.id === lastId) : null;
    setSelectedFolder(lastDomain?.id ?? domains[0]?.id ?? '');
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:flex-1">
            <select
              value={selectedFolder}
              onChange={(e) => {
                setSelectedFolder(e.target.value);
                localStorage.setItem(LAST_DOMAIN_KEY, e.target.value);
              }}
              className="min-w-[220px] border border-gray-300 rounded px-3 py-2 text-sm bg-white"
            >
              {domains.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.definitionCount})</option>
              ))}
            </select>
            {selectedDomain != null && (
              <Link
                to={`/domains/start/${selectedDomain.id}`}
                className="inline-flex items-center justify-center rounded-lg border border-teal-600 bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 md:ml-auto"
              >
                Add Paired Batches for all Vignettes
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {selectedDomain != null ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-lg font-medium text-[#1A1A1A]">Value coverage</h3>
                <p className="text-sm text-gray-600">
                  Batch density across Schwartz value pairs.
                </p>
              </div>
              <CopyVisualButton targetRef={coverageRef} label="coverage table" />
            </div>
            <div className="mt-4">
              <CoverageMatrix ref={coverageRef} domainId={selectedDomain.id} />
            </div>
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
