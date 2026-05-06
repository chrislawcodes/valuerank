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
import { VALUE_LABELS } from './domainAnalysisData';
import { formatDisplayLabel } from '../../utils/displayLabels';
import { cn } from '../../lib/utils';
import { getCanonicalDimension } from '@valuerank/shared';
import { CoverageCell } from './CoverageCell';

type CategoryGroup = {
  name: string;
  color: string;
  values: string[];
};

type CoverageMatrixProps = {
  domainId: string;
  signature: string;
  modelIds: string[];
};

/**
 * CoverageMatrix — embeddable coverage matrix component.
 *
 * Accepts the selected domain, signature, and model IDs from the parent page.
 * The parent owns URL sync and picker state so the matrix only renders data.
 */
export const CoverageMatrix = forwardRef<HTMLDivElement, CoverageMatrixProps>(
  function CoverageMatrix({ domainId, signature, modelIds }, ref) {
    const [useLegacyQuery, setUseLegacyQuery] = useState(false);

    useEffect(() => {
      setUseLegacyQuery(false);
    }, [domainId]);

    const [{ data: scoredData, fetching: scoredFetching, error: scoredError }] = useQuery<
      DomainValueCoverageQueryResult,
      DomainValueCoverageQueryVariables
    >({
      query: DOMAIN_VALUE_COVERAGE_QUERY,
      variables: {
        domainId,
        signature: signature === '' ? undefined : signature,
        modelIds,
      },
      pause: domainId === '' || useLegacyQuery,
      requestPolicy: 'network-only',
    });

    const [{ data: legacyData, fetching: legacyFetching, error: legacyError }] = useQuery<
      DomainValueCoverageQueryResult,
      Omit<DomainValueCoverageQueryVariables, 'signature'>
    >({
      query: DOMAIN_VALUE_COVERAGE_QUERY_LEGACY,
      variables: {
        domainId,
        modelIds,
      },
      pause: domainId === '' || !useLegacyQuery,
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
        {error && (
          <ErrorMessage
            message={`Failed to load coverage data: ${error.message}`}
          />
        )}
        {useLegacyQuery && signature !== '' && (
          <ErrorMessage message="Coverage API does not yet support signature filtering in this environment. Showing all signatures." />
        )}

        {/* Matrix */}
        {fetching && canonicalValues.length === 0 ? (
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
                        group.color,
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
                          groupIndex % 2 === 0 ? 'bg-gray-50/30' : 'bg-white',
                        )}
                      >
                        <div className="mx-auto max-w-[6.5rem]">
                          {VALUE_LABELS[val as keyof typeof VALUE_LABELS] ?? formatDisplayLabel(val)}
                        </div>
                      </th>
                    )),
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
                            rowGroup.color,
                          )}
                        >
                          {rowGroup.name}
                        </th>
                      )}
                      <th
                        className={cn(
                          'w-[8rem] px-0.5 py-1 text-[11px] font-medium text-gray-600 text-right border-t border-r border-gray-200 whitespace-normal break-words leading-tight',
                          rowGroupIdx % 2 === 0 ? 'bg-gray-50/30' : 'bg-white',
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
                              batchEquivalent={cell?.batchEquivalent ?? 0}
                              aFirstBatchEquivalent={cell?.aFirstBatchEquivalent ?? 0}
                              bFirstBatchEquivalent={cell?.bFirstBatchEquivalent ?? 0}
                              aFirstDefinitionName={cell?.aFirstDefinitionName ?? null}
                              bFirstDefinitionName={cell?.bFirstDefinitionName ?? null}
                              weakestCondition={cell?.weakestCondition != null ? {
                                conditionLabel: cell.weakestCondition.conditionLabel,
                                modelCounts: cell.weakestCondition.modelCounts,
                                otherConditionsCount: cell.weakestCondition.otherConditionsCount ?? null,
                              } : null}
                              contributingDefinitionIds={cell?.contributingDefinitionIds ?? []}
                              definitionId={cell?.definitionId ?? null}
                              aggregateRunId={cell?.aggregateRunId ?? null}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  )),
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
  },
);

CoverageMatrix.displayName = 'CoverageMatrix';
