import { type SVGProps, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/Popover';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Button } from '../components/ui/Button';
import { useDomains } from '../hooks/useDomains';
import {
  DOMAIN_VALUE_COVERAGE_QUERY,
  type DomainValueCoverageQueryResult,
  type DomainValueCoverageQueryVariables,
} from '../api/operations/domainCoverage';
import { VALUE_LABELS } from '../data/domainAnalysisData';
import { ChevronRight, FileSearch } from 'lucide-react';
import { cn } from '../lib/utils';
import { getCanonicalDimension } from '@valuerank/shared';

// Render a matrix cell
function CoverageCell({
  valueA,
  valueB,
  batchCount,
  definitionId,
  definitionName,
  domainId,
  maxBatchCount,
}: {
  valueA: string;
  valueB: string;
  batchCount: number;
  definitionId: string | null;
  definitionName: string | null;
  domainId: string;
  maxBatchCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isDiagonal = valueA === valueB;
  const hasVignette = definitionId !== null;

  // Calculate intensity (0 to 1) relative to max batches in this matrix view
  const intensity = maxBatchCount > 0 ? batchCount / maxBatchCount : 0;

  // Base styling depending on cell state
  let bgColorClass = 'bg-gray-50'; // Diagonal or empty fallback
  if (isDiagonal) {
    bgColorClass =
      'bg-[url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxwYXRoIGQ9Ik0wLDggTDgsMCBMMCw4IFoiIHN0cm9rZT0iI2U1ZTdlYiIHN0cm9rZS13aWR0aD0iMSIvPjwvc3ZnPg==")] bg-gray-100';
  } else if (!hasVignette) {
    bgColorClass = 'bg-gray-50';
  } else if (batchCount === 0) {
    bgColorClass = 'bg-amber-50 hover:bg-amber-100/80 transition-colors';
  } else {
    // Determine background color based on intensity (from very light teal to dark/medium teal)
    if (intensity < 0.2) bgColorClass = 'bg-teal-50 hover:bg-teal-100 transition-colors';
    else if (intensity < 0.4) bgColorClass = 'bg-teal-100 hover:bg-teal-200 transition-colors';
    else if (intensity < 0.6) bgColorClass = 'bg-teal-200 hover:bg-teal-300 transition-colors';
    else if (intensity < 0.8)
      bgColorClass = 'bg-teal-300 hover:bg-teal-400 transition-colors text-teal-900';
    else bgColorClass = 'bg-teal-500 hover:bg-teal-600 transition-colors text-white';
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {/* eslint-disable-next-line react/forbid-elements */}
        <button
          type="button"
          disabled={isDiagonal}
          aria-label={
            isDiagonal
              ? 'Not applicable'
              : `${VALUE_LABELS[valueA as keyof typeof VALUE_LABELS] ?? valueA} versus ${VALUE_LABELS[valueB as keyof typeof VALUE_LABELS] ?? valueB}: ${batchCount} domain trials`
          }
          className={cn(
            'w-full h-full min-h-[48px] p-2 flex flex-col items-center justify-center text-sm font-medium border border-gray-100 rounded-none focus:ring-0 focus:ring-offset-0',
            bgColorClass,
            isDiagonal && 'cursor-not-allowed text-transparent font-normal',
            !isDiagonal && !hasVignette && 'text-gray-300 cursor-pointer hover:bg-gray-100',
            hasVignette && batchCount === 0 && 'text-amber-700',
            hasVignette && batchCount > 0 && intensity < 0.8 && 'text-teal-900'
          )}
          title={
            isDiagonal
              ? undefined
              : `${VALUE_LABELS[valueA as keyof typeof VALUE_LABELS] ?? valueA} vs ${VALUE_LABELS[valueB as keyof typeof VALUE_LABELS] ?? valueB}`
          }
        >
          {isDiagonal ? '—' : batchCount.toLocaleString()}
        </button>
      </PopoverTrigger>
      {!isDiagonal && (
        <PopoverContent
          className="w-64 p-0 shadow-lg border-gray-200"
          align="center"
          sideOffset={5}
        >
          <div className="p-3 border-b border-gray-100 bg-gray-50/50 rounded-t-md">
            <h4 className="text-xs font-medium text-gray-500 mb-1">
              {VALUE_LABELS[valueA as keyof typeof VALUE_LABELS] ?? valueA}
              <span className="mx-1.5 text-gray-300">vs</span>
              {VALUE_LABELS[valueB as keyof typeof VALUE_LABELS] ?? valueB}
            </h4>
            {hasVignette ? (
              <p className="text-sm font-medium text-gray-900 leading-tight">
                {definitionName ?? 'Unnamed Vignette'}
              </p>
            ) : (
              <p className="text-sm font-medium text-gray-500 italic">
                No vignette tests this pair
              </p>
            )}
            <div className="mt-2 text-xs text-gray-600 flex items-center">
              <span
                className={cn(
                  'inline-block w-2 h-2 rounded-full mr-1.5',
                  batchCount > 0 ? 'bg-teal-500' : 'bg-amber-500'
                )}
              />
              {batchCount} domain trials run
            </div>
          </div>

          <div className="p-1 flex flex-col">
            {hasVignette && batchCount > 0 && (
              <Link
                to={`/domains/analysis?domainId=${domainId}`}
                className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm w-full text-left"
                onClick={() => setIsOpen(false)}
              >
                <span className="flex items-center">
                  <FileSearch className="w-4 h-4 mr-2 text-gray-400" />
                  View Domain Analysis
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            )}

            {hasVignette && (
              <Link
                to={`/domains/${domainId}/run-trials?definitionIds=${definitionId}`}
                className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm w-full text-left"
                onClick={() => setIsOpen(false)}
              >
                <span className="flex items-center">
                  <PlayIcon className="w-4 h-4 mr-2 text-teal-600" />
                  Add Trials for Vignette
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

// Just a tiny helper icon for Add Trials to keep imports lean
function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

// Group values by higher-order category for display
type CategoryGroup = {
  name: string;
  color: string;
  values: string[];
};

export function DomainCoverage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { domains, queryLoading: domainsLoading, error: domainsError } = useDomains();

  const [selectedDomainId, setSelectedDomainId] = useState<string>(
    searchParams.get('domainId') ?? ''
  );
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(() => {
    const raw = searchParams.get('modelIds');
    return raw ? raw.split(',') : [];
  });

  // Ensure a domain is selected by default
  useEffect(() => {
    if (domains.length === 0) return;
    const selectedExists =
      selectedDomainId !== '' && domains.some((domain) => domain.id === selectedDomainId);
    if (selectedExists) return;
    setSelectedDomainId(domains[0]?.id ?? '');
  }, [domains, selectedDomainId]);

  // Sync URL state
  useEffect(() => {
    if (selectedDomainId === '') return;
    const next = new URLSearchParams(searchParams);
    next.set('domainId', selectedDomainId);

    if (selectedModelIds.length > 0) {
      next.set('modelIds', selectedModelIds.join(','));
    } else {
      next.delete('modelIds');
    }

    // Only update if changes actually occurred
    const currentDomain = searchParams.get('domainId');
    const currentModels = searchParams.get('modelIds') ?? '';
    const newModels = selectedModelIds.length > 0 ? selectedModelIds.join(',') : '';

    if (currentDomain !== selectedDomainId || currentModels !== newModels) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedDomainId, selectedModelIds, setSearchParams]);

  const [{ data, fetching, error }] = useQuery<
    DomainValueCoverageQueryResult,
    DomainValueCoverageQueryVariables
  >({
    query: DOMAIN_VALUE_COVERAGE_QUERY,
    variables: {
      domainId: selectedDomainId,
      modelIds: selectedModelIds.length > 0 ? selectedModelIds : undefined,
    },
    pause: selectedDomainId === '',
    requestPolicy: 'cache-and-network',
  });

  const availableModels = data?.domainValueCoverage?.availableModels ?? [];
  const canonicalValues = data?.domainValueCoverage?.values ?? [];

  useEffect(() => {
    const coverage = data?.domainValueCoverage;
    if (!coverage || coverage.domainId !== selectedDomainId) return;

    const allowedModelIds = new Set(coverage.availableModels.map((model) => model.modelId));
    setSelectedModelIds((prev) => {
      const next = prev.filter((modelId) => allowedModelIds.has(modelId));
      if (next.length === prev.length && next.every((modelId, index) => modelId === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [data?.domainValueCoverage, selectedDomainId]);

  // Find highest batch count to scale the color intensities
  const maxBatchCount = useMemo(() => {
    const defaultCells = data?.domainValueCoverage?.cells ?? [];
    if (defaultCells.length === 0) return 0;
    return Math.max(...defaultCells.map((c) => c.batchCount));
  }, [data?.domainValueCoverage?.cells]);

  // Fast cell lookup O(1)
  const cellLookup = useMemo(() => {
    const defaultCells = data?.domainValueCoverage?.cells ?? [];
    const map = new Map<string, (typeof defaultCells)[0]>();
    for (const cell of defaultCells) {
      map.set(`${cell.valueA}::${cell.valueB}`, cell);
    }
    return map;
  }, [data?.domainValueCoverage?.cells]);

  // Group values by higher-order category using @valuerank/shared
  const valueGroups = useMemo(() => {
    const defaultCanonicalValues = data?.domainValueCoverage?.values ?? [];
    if (defaultCanonicalValues.length === 0) return [];

    const categories: Record<string, CategoryGroup> = {
      Openness_to_Change: {
        name: 'Openness',
        color: 'bg-orange-100 border-orange-200 text-orange-800',
        values: [],
      },
      Self_Enhancement: {
        name: 'Enhancement',
        color: 'bg-purple-100 border-purple-200 text-purple-800',
        values: [],
      },
      Conservation: {
        name: 'Conservation',
        color: 'bg-blue-100 border-blue-200 text-blue-800',
        values: [],
      },
      Self_Transcendence: {
        name: 'Transcendence',
        color: 'bg-emerald-100 border-emerald-200 text-emerald-800',
        values: [],
      },
    };

    defaultCanonicalValues.forEach((val) => {
      const canonical = getCanonicalDimension(val);
      if (canonical) {
        categories[canonical.higherOrder]?.values.push(val);
      }
    });

    return Object.values(categories).filter((c) => c.values.length > 0);
  }, [data?.domainValueCoverage?.values]);

  const toggleModel = (modelId: string) => {
    setSelectedModelIds((prev) =>
      prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId]
    );
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Value Coverage</h1>
        <p className="mt-1 text-sm text-gray-600">
          Visualize trial density across the 10 canonical Schwartz value pairs for this domain.
        </p>
      </div>

      {(domainsError || error) && (
        <ErrorMessage
          message={`Failed to load coverage data: ${(domainsError ?? error)?.message ?? 'Unknown error'}`}
        />
      )}

      {/* Controls Area */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <h2 className="text-sm font-semibold text-gray-900 min-w-[140px]">Domain Selection</h2>
            <select
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 flex-1 max-w-sm"
              value={selectedDomainId}
              onChange={(event) => {
                const newDomainId = event.target.value;
                if (newDomainId !== selectedDomainId) {
                  setSelectedDomainId(newDomainId);
                  setSelectedModelIds([]);
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

          {availableModels.length > 0 && (
            <div className="flex flex-col gap-2 md:flex-row md:items-start pt-3 border-t border-gray-100">
              <div className="min-w-[140px]">
                <h2 className="text-sm font-semibold text-gray-900">Model Filters</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Filter trial counts by model inclusion.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 flex-1">
                {availableModels.map((model) => {
                  const isSelected = selectedModelIds.includes(model.modelId);
                  return (
                    <Button
                      key={model.modelId}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => toggleModel(model.modelId)}
                      className={cn(
                        'h-7 px-2.5 py-1 text-xs rounded-full transition-colors',
                        isSelected
                          ? 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100 hover:text-teal-900'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      {model.label}
                    </Button>
                  );
                })}
                {selectedModelIds.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedModelIds([])}
                    className="h-7 px-2.5 py-1 text-xs rounded-full text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline hover:bg-transparent"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Matrix Area */}
      {fetching && canonicalValues.length === 0 ? (
        <Loading size="lg" text="Loading coverage matrix..." />
      ) : canonicalValues.length > 0 ? (
        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white shadow-sm mt-8">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              {/* Higher-order categories row */}
              <tr>
                <th className="p-0 border-b border-gray-200 bg-gray-50/50" colSpan={2} rowSpan={2}>
                  {/* Empty top-left cell */}
                </th>
                {valueGroups.map((group) => (
                  <th
                    key={`col-group-${group.name}`}
                    colSpan={group.values.length}
                    className={cn(
                      'p-1.5 text-[11px] font-semibold text-center border-b border-l border-gray-200 tracking-wider uppercase',
                      group.color
                    )}
                  >
                    {group.name}
                  </th>
                ))}
              </tr>
              {/* Value columns row */}
              <tr>
                {valueGroups.flatMap((group, groupIndex) =>
                  group.values.map((val, valIndex) => (
                    <th
                      key={`col-${val}`}
                      className={cn(
                        'p-2 text-xs font-medium text-gray-600 border-b border-gray-200 writing-vertical transform -rotate-180 h-32 align-bottom whitespace-nowrap',
                        valIndex === 0 && 'border-l',
                        groupIndex % 2 === 0 ? 'bg-gray-50/30' : 'bg-white'
                      )}
                    >
                      <div className="py-2 inline-block">
                        {VALUE_LABELS[val as keyof typeof VALUE_LABELS] ?? val.replace(/_/g, ' ')}
                      </div>
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {valueGroups.flatMap((rowGroup, rowGroupIdx) =>
                rowGroup.values.map((rowVal, rowValIdx) => (
                  <tr key={`row-${rowVal}`}>
                    {/* Category column header (vertical spanning) */}
                    {rowValIdx === 0 && (
                      <th
                        rowSpan={rowGroup.values.length}
                        className={cn(
                          'p-1.5 text-[11px] font-semibold text-center border-t border-r border-gray-200 tracking-wider uppercase writing-vertical transform -rotate-180 max-w-[30px]',
                          rowGroup.color
                        )}
                      >
                        {rowGroup.name}
                      </th>
                    )}
                    {/* Value row header */}
                    <th
                      className={cn(
                        'p-2 text-xs font-medium text-gray-600 text-right border-t border-r border-gray-200 whitespace-nowrap min-w-[140px]',
                        rowGroupIdx % 2 === 0 ? 'bg-gray-50/30' : 'bg-white'
                      )}
                    >
                      {VALUE_LABELS[rowVal as keyof typeof VALUE_LABELS] ??
                        rowVal.replace(/_/g, ' ')}
                    </th>

                    {/* Data cells */}
                    {canonicalValues.map((colVal) => {
                      // Lookup cell prioritizing alphabetical sorting to match backend key format
                      const keyA = [rowVal, colVal].sort().join('::');
                      const cell = cellLookup.get(keyA);

                      return (
                        <td
                          key={`cell-${rowVal}-${colVal}`}
                          className="p-0 m-0 border border-gray-100 min-w-[48px] h-12"
                        >
                          <CoverageCell
                            valueA={rowVal}
                            valueB={colVal}
                            domainId={selectedDomainId}
                            batchCount={cell?.batchCount ?? 0}
                            definitionId={cell?.definitionId ?? null}
                            definitionName={cell?.definitionName ?? null}
                            maxBatchCount={maxBatchCount}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          No coverage data available for this domain.
        </div>
      )}

      {!fetching && canonicalValues.length > 0 && (
        <div className="flex justify-between items-center text-xs text-gray-500 pt-2 px-1">
          <p>
            Vignettes missing trial batches are highlighted in{' '}
            <span className="font-medium text-amber-700">amber</span>. Click any cell to add trials.
          </p>
          {maxBatchCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span>Fewer runs</span>
              <div className="flex h-3 w-32 rounded-sm overflow-hidden border border-gray-200 mx-1">
                <div className="flex-1 bg-teal-50" />
                <div className="flex-1 bg-teal-200" />
                <div className="flex-1 bg-teal-300" />
                <div className="flex-1 bg-teal-500" />
              </div>
              <span>More runs ({maxBatchCount.toLocaleString()})</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
