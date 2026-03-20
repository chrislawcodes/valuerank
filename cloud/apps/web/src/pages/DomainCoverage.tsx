import { type SVGProps, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/Popover';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Button } from '../components/ui/Button';
import { CopyVisualButton } from '../components/ui/CopyVisualButton';
import { useDomains } from '../hooks/useDomains';
import {
  DOMAIN_VALUE_COVERAGE_QUERY,
  DOMAIN_VALUE_COVERAGE_QUERY_LEGACY,
  type DomainValueCoverageQueryResult,
  type DomainValueCoverageQueryVariables,
} from '../api/operations/domainCoverage';
import {
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  type DomainAvailableSignature,
  type DomainAvailableSignaturesQueryResult,
  type DomainAvailableSignaturesQueryVariables,
} from '../api/operations/domainAnalysis';
import { VALUE_LABELS } from '../data/domainAnalysisData';
import { formatDisplayLabel } from '../utils/displayLabels';
import { ChevronRight, FileSearch } from 'lucide-react';
import { cn } from '../lib/utils';
import { getCanonicalDimension } from '@valuerank/shared';

// Render a matrix cell
function CoverageCell({
  valueA,
  valueB,
  batchCount,
  definitionId,
  aggregateRunId,
  domainId,
}: {
  valueA: string;
  valueB: string;
  batchCount: number;
  definitionId: string | null;
  aggregateRunId: string | null;
  domainId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isDiagonal = valueA === valueB;
  const hasVignette = definitionId !== null;
  const visibleLabel = isDiagonal || !hasVignette ? '—' : batchCount.toLocaleString();
  const xLabel = VALUE_LABELS[valueB as keyof typeof VALUE_LABELS] ?? valueB;
  const yLabel = VALUE_LABELS[valueA as keyof typeof VALUE_LABELS] ?? valueA;
  const batchLabel = batchCount === 1 ? 'batch' : 'batches';

  // Base styling depending on cell state
  let bgColorClass = 'bg-gray-50'; // Diagonal or empty fallback
  if (isDiagonal) {
    bgColorClass =
      'bg-[url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxwYXRoIGQ9Ik0wLDggTDgsMCBMMCw4IFoiIHN0cm9rZT0iI2U1ZTdlYiIHN0cm9rZS13aWR0aD0iMSIvPjwvc3ZnPg==")] bg-gray-100';
  } else if (!hasVignette) {
    bgColorClass = 'bg-gray-50';
  } else if (batchCount < 3) {
    bgColorClass = 'bg-rose-100 hover:bg-rose-200 transition-colors text-rose-900';
  } else if (batchCount < 10) {
    bgColorClass = 'bg-amber-100 hover:bg-amber-200 transition-colors text-amber-900';
  } else {
    bgColorClass = 'bg-emerald-500 hover:bg-emerald-600 transition-colors text-white';
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
              : !hasVignette
                ? `${xLabel} versus ${yLabel}: no vignette`
                : `${xLabel} versus ${yLabel}: ${batchCount} ${batchLabel}`
          }
          className={cn(
            'w-full h-full min-h-[48px] p-2 flex flex-col items-center justify-center text-sm font-medium border border-gray-100 rounded-none focus:ring-0 focus:ring-offset-0',
            bgColorClass,
            isDiagonal && 'cursor-not-allowed text-transparent font-normal',
            !isDiagonal && !hasVignette && 'text-gray-500 cursor-pointer hover:bg-gray-100',
            hasVignette && batchCount < 3 && 'text-rose-900',
            hasVignette && batchCount >= 3 && batchCount < 10 && 'text-amber-900'
          )}
        >
          {visibleLabel}
        </button>
      </PopoverTrigger>
      {!isDiagonal && (
        <PopoverContent
          className="w-64 p-0 shadow-lg border-gray-200"
          align="center"
          sideOffset={5}
        >
          <div className="p-3 border-b border-gray-100 bg-gray-50/50 rounded-t-md">
            {hasVignette ? (
              <div className="mt-2 text-xs text-gray-600 flex items-center">
                <span
                  className={cn(
                    'inline-block w-2 h-2 rounded-full mr-1.5',
                    batchCount < 3
                      ? 'bg-rose-500'
                      : batchCount < 10
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  )}
                />
                {batchCount} {batchLabel}
              </div>
            ) : (
              <div className="mt-2 text-xs text-gray-500">No batch for this value pair</div>
            )}
          </div>

          <div className="p-1 flex flex-col">
            {hasVignette && aggregateRunId !== null && (
              <Link
                to={`/analysis/${aggregateRunId}`}
                className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm w-full text-left"
                onClick={() => setIsOpen(false)}
              >
                <span className="flex items-center">
                  <FileSearch className="w-4 h-4 mr-2 text-gray-400" />
                  View Vignette Analysis
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
                  Add Batch for Vignette
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

// Just a tiny helper icon for Add Batch to keep imports lean
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

function parseSignatureVersion(signature: string): number | null {
  const match = signature.match(/^v(\d+)/i);
  if (!match) return null;
  const version = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(version) ? version : null;
}

function isTempZeroSignature(option: DomainAvailableSignature): boolean {
  if (option.temperature === 0) return true;
  const tokenMatch = option.signature.match(/t(.+)$/i);
  if (!tokenMatch) return false;
  const token = (tokenMatch[1] ?? '').trim().toLowerCase();
  if (token === 'd') return false;
  const parsed = Number.parseFloat(token);
  return Number.isFinite(parsed) && parsed === 0;
}

function selectPreferredSignature(options: DomainAvailableSignature[]): string {
  const t0Options = options.filter(isTempZeroSignature);
  if (t0Options.length === 0) return options[0]?.signature ?? '';
  const sorted = [...t0Options].sort((left, right) => {
    const leftVersion = parseSignatureVersion(left.signature) ?? -1;
    const rightVersion = parseSignatureVersion(right.signature) ?? -1;
    if (leftVersion !== rightVersion) return rightVersion - leftVersion;
    return right.signature.localeCompare(left.signature);
  });
  return sorted[0]?.signature ?? '';
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
  const tableRef = useRef<HTMLDivElement>(null);

  const [selectedDomainId, setSelectedDomainId] = useState<string>(
    searchParams.get('domainId') ?? ''
  );
  const [selectedSignature, setSelectedSignature] = useState<string>(
    searchParams.get('signature') ?? ''
  );
  const [allowAllSignatures, setAllowAllSignatures] = useState(false);
  const [useLegacyQuery, setUseLegacyQuery] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(() => {
    const raw = searchParams.get('modelIds');
    return raw ? raw.split(',') : [];
  });
  const [availableModelIds, setAvailableModelIds] = useState<string[]>([]);
  const allModelsSelected = useMemo(
    () =>
      availableModelIds.length > 0
      && selectedModelIds.length === availableModelIds.length
      && availableModelIds.every((modelId) => selectedModelIds.includes(modelId)),
    [availableModelIds, selectedModelIds],
  );
  const selectedModelIdsForQuery = useMemo(() => {
    if (selectedModelIds.length === 0) return undefined;
    if (allModelsSelected) return undefined;
    return selectedModelIds;
  }, [allModelsSelected, selectedModelIds]);

  const [{ data: signatureData, fetching: signaturesLoading, error: signaturesError }] = useQuery<
    DomainAvailableSignaturesQueryResult,
    DomainAvailableSignaturesQueryVariables
  >({
    query: DOMAIN_AVAILABLE_SIGNATURES_QUERY,
    variables: { domainId: selectedDomainId },
    pause: selectedDomainId === '',
    requestPolicy: 'cache-and-network',
  });

  const signatureOptions = useMemo<DomainAvailableSignature[]>(
    () => signatureData?.domainAvailableSignatures ?? [],
    [signatureData],
  );
  const preferredSignature = useMemo(
    () => selectPreferredSignature(signatureOptions),
    [signatureOptions],
  );
  const hasValidSelectedSignature = useMemo(
    () => selectedSignature === '' || signatureOptions.some((option) => option.signature === selectedSignature),
    [selectedSignature, signatureOptions],
  );
  const signatureSelectionReady = selectedDomainId !== ''
    && !signaturesLoading
    && hasValidSelectedSignature
    && (selectedSignature !== '' || allowAllSignatures || signatureOptions.length === 0);

  // Ensure a domain is selected by default
  useEffect(() => {
    if (domains.length === 0) return;
    const selectedExists =
      selectedDomainId !== '' && domains.some((domain) => domain.id === selectedDomainId);
    if (selectedExists) return;
    setSelectedDomainId(domains[0]?.id ?? '');
  }, [domains, selectedDomainId]);

  useEffect(() => {
    if (signaturesLoading) return;
    if (signatureOptions.length === 0) {
      if (selectedSignature !== '') setSelectedSignature('');
      return;
    }
    if (selectedSignature !== '' && signatureOptions.some((option) => option.signature === selectedSignature)) return;
    if (selectedSignature === '' && allowAllSignatures) return;
    setSelectedSignature(preferredSignature);
  }, [allowAllSignatures, preferredSignature, selectedSignature, signatureOptions, signaturesLoading]);

  // Sync URL state
  useEffect(() => {
    if (selectedDomainId === '') return;
    const next = new URLSearchParams(searchParams);
    next.set('domainId', selectedDomainId);
    if (selectedSignature === '') {
      next.delete('signature');
    } else {
      next.set('signature', selectedSignature);
    }

    const modelIdsForUrl =
      selectedModelIdsForQuery === undefined ? '' : selectedModelIdsForQuery.join(',');
    if (modelIdsForUrl !== '') {
      next.set('modelIds', modelIdsForUrl);
    } else {
      next.delete('modelIds');
    }

    // Only update if changes actually occurred
    const currentDomain = searchParams.get('domainId');
    const currentSignature = searchParams.get('signature') ?? '';
    const currentModels = searchParams.get('modelIds') ?? '';
    const newSignature = selectedSignature;
    const newModels = modelIdsForUrl;

    if (
      currentDomain !== selectedDomainId
      || currentSignature !== newSignature
      || currentModels !== newModels
    ) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedDomainId, selectedModelIdsForQuery, selectedSignature, setSearchParams]);

  const [{ data: scoredData, fetching: scoredFetching, error: scoredError }] = useQuery<
    DomainValueCoverageQueryResult,
    DomainValueCoverageQueryVariables
  >({
    query: DOMAIN_VALUE_COVERAGE_QUERY,
    variables: {
      domainId: selectedDomainId,
      modelIds: selectedModelIdsForQuery,
      signature: selectedSignature === '' ? undefined : selectedSignature,
    },
    pause: selectedDomainId === '' || !signatureSelectionReady || useLegacyQuery,
    requestPolicy: 'cache-and-network',
  });

  const [{ data: legacyData, fetching: legacyFetching, error: legacyError }] = useQuery<
    DomainValueCoverageQueryResult,
    Omit<DomainValueCoverageQueryVariables, 'signature'>
  >({
    query: DOMAIN_VALUE_COVERAGE_QUERY_LEGACY,
    variables: {
      domainId: selectedDomainId,
      modelIds: selectedModelIdsForQuery,
    },
    pause: selectedDomainId === '' || !signatureSelectionReady || !useLegacyQuery,
    requestPolicy: 'cache-and-network',
  });

  useEffect(() => {
    const message = scoredError?.message ?? '';
    const isUnknownArgumentError = message.includes('Unknown argument "signature"');
    const isUnknownFieldError = message.includes('Cannot query field') || message.includes('Unknown field');
    if ((isUnknownArgumentError || isUnknownFieldError) && !useLegacyQuery) {
      setUseLegacyQuery(true);
    }
  }, [scoredError, useLegacyQuery]);

  const data = useLegacyQuery ? legacyData : scoredData;
  const fetching = useLegacyQuery ? legacyFetching : scoredFetching;
  const error = useLegacyQuery ? legacyError : scoredError;

  const availableModels = data?.domainValueCoverage?.availableModels ?? [];
  const canonicalValues = data?.domainValueCoverage?.values ?? [];

  useEffect(() => {
    const coverage = data?.domainValueCoverage;
    if (!coverage || coverage.domainId !== selectedDomainId) return;

    const modelIds = coverage.availableModels.map((model) => model.modelId);
    setAvailableModelIds((prev) => {
      if (prev.length === modelIds.length && prev.every((modelId, index) => modelId === modelIds[index])) {
        return prev;
      }
      return modelIds;
    });

    const allowedModelIds = new Set(modelIds);
    setSelectedModelIds((prev) => {
      const next = prev.filter((modelId) => allowedModelIds.has(modelId));
      if (modelIds.length > 0 && next.length === 0) {
        return modelIds;
      }
      if (next.length === prev.length && next.every((modelId, index) => modelId === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [data?.domainValueCoverage, selectedDomainId]);

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
  const displayValues = useMemo(
    () => valueGroups.flatMap((group) => group.values),
    [valueGroups],
  );

  const toggleModel = (modelId: string) => {
    setSelectedModelIds((prev) => {
      if (prev.includes(modelId)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== modelId);
      }
      const next = new Set(prev);
      next.add(modelId);
      return availableModelIds.filter((id) => next.has(id));
    });
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Value Coverage</h1>
            <p className="mt-1 text-sm text-gray-600">
              Visualize batch density across the 10 canonical Schwartz value pairs for this domain.
            </p>
          </div>
          {canonicalValues.length > 0 && (
            <CopyVisualButton targetRef={tableRef} label="coverage table" />
          )}
        </div>
      </div>

      {(domainsError || signaturesError || error) && (
        <ErrorMessage
          message={`Failed to load coverage data: ${(domainsError ?? signaturesError ?? error)?.message ?? 'Unknown error'}`}
        />
      )}
      {useLegacyQuery && selectedSignature !== '' && (
        <ErrorMessage message="Coverage API does not yet support signature filtering in this environment. Showing all signatures." />
      )}

      {/* Controls Area */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-4">
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
                  setAllowAllSignatures(false);
                  setSelectedSignature('');
                  setSelectedModelIds([]);
                  setAvailableModelIds([]);
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

          <div className="flex flex-col gap-2 md:flex-row md:items-center pt-3 border-t border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 min-w-[140px]">Batch Signature</h2>
            <select
              aria-label="Batch Signature"
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 flex-1 max-w-sm"
              value={selectedSignature}
              onChange={(event) => {
                const nextSignature = event.target.value;
                setAllowAllSignatures(nextSignature === '');
                setSelectedSignature(nextSignature);
              }}
              disabled={signaturesLoading}
            >
              <option value="">All signatures</option>
              {signatureOptions.map((signatureOption) => (
                <option key={signatureOption.signature} value={signatureOption.signature}>
                  {signatureOption.label}
                </option>
              ))}
            </select>
          </div>

          {availableModels.length > 0 && (
            <div className="flex flex-col gap-2 md:flex-row md:items-start pt-3 border-t border-gray-100">
              <div className="min-w-[140px]">
                <h2 className="text-sm font-semibold text-gray-900">Model Filters</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Filter batch counts by model inclusion.
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
                {!allModelsSelected && availableModelIds.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedModelIds(availableModelIds)}
                    className="h-7 px-2.5 py-1 text-xs rounded-full text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline hover:bg-transparent"
                  >
                    Select all models
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Matrix Area */}
      {(signaturesLoading || (fetching && canonicalValues.length === 0)) ? (
        <Loading size="lg" text="Loading coverage matrix..." />
      ) : canonicalValues.length > 0 ? (
        <div
          ref={tableRef}
          className="overflow-x-auto border border-gray-200 rounded-lg bg-white shadow-sm mt-8"
        >
          <table className="w-full min-w-full table-fixed border-collapse">
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
                        'w-[7.25rem] p-1.5 text-[11px] font-medium text-gray-600 border-b border-gray-200 align-top text-center leading-tight whitespace-normal break-words',
                        valIndex === 0 && 'border-l',
                        groupIndex % 2 === 0 ? 'bg-gray-50/30' : 'bg-white'
                      )}
                    >
                      <div className="mx-auto max-w-[6.5rem]">
                        {VALUE_LABELS[val as keyof typeof VALUE_LABELS] ?? formatDisplayLabel(val)}
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
                          'w-[4.5rem] p-1.5 text-[10px] font-semibold text-center border-t border-r border-gray-200 tracking-wider uppercase align-middle',
                          rowGroup.color
                        )}
                      >
                        {rowGroup.name}
                      </th>
                    )}
                    {/* Value row header */}
                    <th
                      className={cn(
                        'w-[9rem] p-2 text-xs font-medium text-gray-600 text-right border-t border-r border-gray-200 whitespace-normal break-words',
                        rowGroupIdx % 2 === 0 ? 'bg-gray-50/30' : 'bg-white'
                      )}
                    >
                      {VALUE_LABELS[rowVal as keyof typeof VALUE_LABELS] ??
                        formatDisplayLabel(rowVal)}
                    </th>

                    {/* Data cells */}
                    {displayValues.map((colVal) => {
                      const keyA = `${colVal}::${rowVal}`;
                      const cell = cellLookup.get(keyA);

                      return (
                        <td
                          key={`cell-${rowVal}-${colVal}`}
                          className="h-12 w-[4.5rem] border border-gray-100 p-0"
                        >
                          <CoverageCell
                            valueA={rowVal}
                            valueB={colVal}
                            domainId={selectedDomainId}
                            batchCount={cell?.batchCount ?? 0}
                            definitionId={cell?.definitionId ?? null}
                            aggregateRunId={cell?.aggregateRunId ?? null}
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
        <div className="flex flex-col gap-2 px-1 pt-2 text-xs text-gray-500 lg:flex-row lg:items-center lg:justify-between">
          <p>
            Cells are <span className="font-medium text-rose-700">red (&lt;3)</span>,{' '}
            <span className="font-medium text-amber-700">yellow (3-9)</span>, or{' '}
            <span className="font-medium text-emerald-700">green (10+)</span>. Click any cell to add a batch.
          </p>
          <p>Use the copy button above to place this table in docs or slides.</p>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-rose-500" />
              <span>&lt;3</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-amber-500" />
              <span>3-9</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
              <span>10+</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
