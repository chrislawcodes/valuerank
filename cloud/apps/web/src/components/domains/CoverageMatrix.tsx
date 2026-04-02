import { forwardRef, type SVGProps, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'urql';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Loading } from '../ui/Loading';
import {
  DOMAIN_VALUE_COVERAGE_QUERY,
  DOMAIN_VALUE_COVERAGE_QUERY_LEGACY,
  type DomainValueCoverageQueryResult,
  type DomainValueCoverageQueryVariables,
} from '../../api/operations/domainCoverage';
import {
  DOMAIN_AVAILABLE_SIGNATURES_QUERY,
  type DomainAvailableSignature,
  type DomainAvailableSignaturesQueryResult,
} from '../../api/operations/domainAnalysis';
import { VALUE_LABELS } from './domainAnalysisData';
import { formatDisplayLabel } from '../../utils/displayLabels';
import { ChevronRight, FileSearch } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getCanonicalDimension } from '@valuerank/shared';

// Render a matrix cell
function CoverageCell({
  valueA,
  valueB,
  batchCount,
  definitionId,
  aggregateRunId,
}: {
  valueA: string;
  valueB: string;
  batchCount: number;
  definitionId: string | null;
  aggregateRunId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isDiagonal = valueA === valueB;
  const hasVignette = definitionId !== null;
  const displayCount = pairedBatchCount > 0 ? pairedBatchCount : batchCount;
  const visibleLabel = isDiagonal || !hasVignette ? '—' : displayCount.toLocaleString();
  const xLabel = VALUE_LABELS[valueB as keyof typeof VALUE_LABELS] ?? valueB;
  const yLabel = VALUE_LABELS[valueA as keyof typeof VALUE_LABELS] ?? valueA;
  const batchLabel = pairedBatchCount > 0
    ? (displayCount === 1 ? 'paired batch' : 'paired batches')
    : (displayCount === 1 ? 'batch' : 'batches');

  let bgColorClass = 'bg-gray-50';
  if (isDiagonal) {
    bgColorClass =
      'bg-[url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxwYXRoIGQ9Ik0wLDggTDgsMCBMMCw4IFoiIHN0cm9rZT0iI2U1ZTdlYiIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+")] bg-gray-100';
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
                : `${xLabel} versus ${yLabel}: ${displayCount} ${batchLabel}`
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
                {displayCount} {batchLabel}
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
                to={`/definitions/${definitionId}/start-paired-batch`}
                state={{
                  returnLabel: 'Back to Value coverage',
                  returnTo: `${window.location.pathname}${window.location.search}`,
                }}
                className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm w-full text-left"
                onClick={() => setIsOpen(false)}
              >
                <span className="flex items-center">
                  <PlayIcon className="w-4 h-4 mr-2 text-teal-600" />
                  Start Paired Batch
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

function selectPreferredSignature(options: DomainAvailableSignature[]): string {
  // Virtual signatures ("Latest @ X") always beat exact versioned ones.
  // Among virtuals, prefer default temperature (vnewtd) then temp-zero (vnewt0).
  const virtualDefault = options.find((o) => o.isVirtual && o.signature === 'vnewtd');
  if (virtualDefault) return virtualDefault.signature;
  const virtualT0 = options.find((o) => o.isVirtual && o.signature === 'vnewt0');
  if (virtualT0) return virtualT0.signature;
  const anyVirtual = options.find((o) => o.isVirtual);
  if (anyVirtual) return anyVirtual.signature;

  // Fall back to highest-version exact signature
  const sorted = [...options].sort((left, right) => {
    const leftVersion = parseSignatureVersion(left.signature) ?? -1;
    const rightVersion = parseSignatureVersion(right.signature) ?? -1;
    if (leftVersion !== rightVersion) return rightVersion - leftVersion;
    return right.signature.localeCompare(left.signature);
  });
  return sorted[0]?.signature ?? '';
}

type CategoryGroup = {
  name: string;
  color: string;
  values: string[];
};

/**
 * CoverageMatrix — embeddable coverage matrix component.
 *
 * Accepts a domainId prop; manages its own signature and model state internally.
 * No URL sync — the parent page owns URL state for domainId.
 */
export const CoverageMatrix = forwardRef<HTMLDivElement, { domainId: string }>(
  function CoverageMatrix({ domainId }, ref) {
  const [selectedSignature, setSelectedSignature] = useState<string>('');
  const [allowAllSignatures, setAllowAllSignatures] = useState(false);
  const [useLegacyQuery, setUseLegacyQuery] = useState(false);

  const [{ data: signatureData, fetching: signaturesLoading, error: signaturesError }] = useQuery<
    DomainAvailableSignaturesQueryResult,
    { domainId: string }
  >({
    query: DOMAIN_AVAILABLE_SIGNATURES_QUERY,
    variables: { domainId },
    pause: domainId === '',
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
  const signatureSelectionReady = domainId !== ''
    && !signaturesLoading
    && hasValidSelectedSignature
    && (selectedSignature !== '' || allowAllSignatures || signatureOptions.length === 0);

  // Reset state when domainId changes
  useEffect(() => {
    setSelectedSignature('');
    setAllowAllSignatures(false);
    setUseLegacyQuery(false);
  }, [domainId]);

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

  const [{ data: scoredData, fetching: scoredFetching, error: scoredError }] = useQuery<
    DomainValueCoverageQueryResult,
    DomainValueCoverageQueryVariables
  >({
    query: DOMAIN_VALUE_COVERAGE_QUERY,
    variables: {
      domainId,
      signature: selectedSignature === '' ? undefined : selectedSignature,
    },
    pause: domainId === '' || !signatureSelectionReady || useLegacyQuery,
    requestPolicy: 'cache-and-network',
  });

  const [{ data: legacyData, fetching: legacyFetching, error: legacyError }] = useQuery<
    DomainValueCoverageQueryResult,
    Omit<DomainValueCoverageQueryVariables, 'signature'>
  >({
    query: DOMAIN_VALUE_COVERAGE_QUERY_LEGACY,
    variables: {
      domainId,
    },
    pause: domainId === '' || !signatureSelectionReady || !useLegacyQuery,
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

  const canonicalValues = data?.domainValueCoverage?.values ?? [];

  const cellLookup = useMemo(() => {
    const defaultCells = data?.domainValueCoverage?.cells ?? [];
    const map = new Map<string, (typeof defaultCells)[0]>();
    for (const cell of defaultCells) {
      map.set([cell.valueA, cell.valueB].sort().join('::'), cell);
    }
    return map;
  }, [data?.domainValueCoverage?.cells]);

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

  return (
    <div className="space-y-4">
      {(signaturesError || error) && (
        <ErrorMessage
          message={`Failed to load coverage data: ${(signaturesError ?? error)?.message ?? 'Unknown error'}`}
        />
      )}
      {useLegacyQuery && selectedSignature !== '' && (
        <ErrorMessage message="Coverage API does not yet support signature filtering in this environment. Showing all signatures." />
      )}

      {/* Controls */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div className="flex items-center justify-between w-full md:w-auto">
          <h2 className="text-sm font-semibold text-gray-900 min-w-[140px]">Batch Signature</h2>
        </div>
        <div className="flex items-center gap-3 flex-1">
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
      </div>

      {/* Matrix */}
      {(signaturesLoading || (fetching && canonicalValues.length === 0)) ? (
        <Loading size="lg" text="Loading coverage matrix..." />
      ) : canonicalValues.length > 0 ? (
        <div ref={ref} className="overflow-x-auto border border-gray-200 rounded-lg bg-white shadow-sm">
          <table className="w-full min-w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th className="p-0 border-b border-gray-200 bg-gray-50/50" colSpan={2} rowSpan={2} />
                {valueGroups.map((group) => (
                  <th
                    key={`col-group-${group.name}`}
                    colSpan={group.values.length}
                    className={cn(
                      'p-1.5 text-[11px] font-semibold text-center border-b border-l border-gray-200 tracking-normal',
                      group.color
                    )}
                  >
                    {group.name}
                  </th>
                ))}
              </tr>
              <tr>
                {valueGroups.flatMap((group, groupIndex) =>
                  group.values.map((val, valIndex) => (
                    <th
                      key={`col-${val}`}
                      className={cn(
                        'w-[6.5rem] p-1.5 text-[11px] font-medium text-gray-600 border-b border-gray-200 align-top text-center leading-tight whitespace-normal break-words',
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
                    {rowValIdx === 0 && (
                      <th
                        rowSpan={rowGroup.values.length}
                        className={cn(
                          'w-[6.75rem] px-1 py-1.5 text-[11px] font-medium text-center border-t border-r border-gray-200 tracking-normal leading-tight whitespace-normal break-words overflow-hidden align-middle',
                          rowGroup.color
                        )}
                      >
                        {rowGroup.name}
                      </th>
                    )}
                    <th
                      className={cn(
                        'w-[8rem] px-0.5 py-1 text-[11px] font-medium text-gray-600 text-right border-t border-r border-gray-200 whitespace-normal break-words leading-tight',
                        rowGroupIdx % 2 === 0 ? 'bg-gray-50/30' : 'bg-white'
                      )}
                    >
                      {VALUE_LABELS[rowVal as keyof typeof VALUE_LABELS] ??
                        formatDisplayLabel(rowVal)}
                    </th>

                    {displayValues.map((colVal) => {
                      const keyA = [colVal, rowVal].sort().join('::');
                      const cell = cellLookup.get(keyA);

                      return (
                        <td
                          key={`cell-${rowVal}-${colVal}`}
                          className="h-12 w-[3.5rem] border border-gray-100 p-0"
                        >
                          <CoverageCell
                            valueA={rowVal}
                            valueB={colVal}
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
          <p>No coverage data available for this domain yet.</p>
          <p className="mt-1 text-sm">Create vignettes in the Vignettes tab, then run evaluations to see coverage here.</p>
        </div>
      )}

      {!fetching && canonicalValues.length > 0 && (
        <div className="px-1 pt-2 text-xs text-gray-500">
          <p>
            Batches per cell are{' '}
            <span className="font-medium text-rose-700">red (&lt;3)</span>,{' '}
            <span className="font-medium text-amber-700">yellow (3-9)</span>, or{' '}
            <span className="font-medium text-emerald-700">green (10+)</span>. Click any cell to add a batch.
          </p>
        </div>
      )}
    </div>
  );
});

CoverageMatrix.displayName = 'CoverageMatrix';
