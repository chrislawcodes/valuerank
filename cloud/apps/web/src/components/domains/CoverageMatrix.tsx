import { forwardRef, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
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
import { cn } from '../../lib/utils';
import { getCanonicalDimension } from '@valuerank/shared';
import { CoverageCell } from './CoverageCell';
import { selectPreferredSignature } from './coverageMatrixHelpers';

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
    requestPolicy: 'network-only',
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
    requestPolicy: 'network-only',
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
    requestPolicy: 'network-only',
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
                            pairedBatchCount={cell?.pairedBatchCount ?? 0}
                            orphanedBatchCount={cell?.orphanedBatchCount ?? 0}
                            aFirstBatchCount={cell?.aFirstBatchCount ?? 0}
                            bFirstBatchCount={cell?.bFirstBatchCount ?? 0}
                            pairedConditionCount={cell?.pairedConditionCount ?? 0}
                            orphanedConditionCount={cell?.orphanedConditionCount ?? 0}
                            directionalCoverage={cell?.directionalCoverage ?? []}
                            contributingDefinitionIds={cell?.contributingDefinitionIds ?? []}
                            incompleteBatchCount={cell?.incompleteBatchCount ?? 0}
                            definitionId={cell?.definitionId ?? null}
                            aggregateRunId={cell?.aggregateRunId ?? null}
                            modelBreakdown={cell?.modelBreakdown ?? null}
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
