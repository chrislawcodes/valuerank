import { useEffect, useMemo, useRef } from 'react';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import type { ModelPairDivergenceBreakdownQuery } from '../../generated/graphql';
import { useModelPairDivergenceBreakdownQuery } from '../../generated/graphql';

type SelectedPair = {
  modelAId: string;
  modelBId: string;
};

type ValuePairDivergence = ModelPairDivergenceBreakdownQuery['modelPairDivergenceBreakdown']['perValuePair'][number];
const DRILLDOWN_POLL_INTERVAL_MS = 5000;

type Props = {
  selectedPair: SelectedPair | null;
  scope: 'DOMAIN' | 'ALL_DOMAINS';
  domainId: string | null;
  signature: string;
};

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatCells(value: number): string {
  return value.toLocaleString();
}

function sortRows(rows: ValuePairDivergence[]): ValuePairDivergence[] {
  return [...rows].sort((left, right) => {
    const leftValue = left.meanAbsoluteDivergence ?? -Infinity;
    const rightValue = right.meanAbsoluteDivergence ?? -Infinity;
    if (rightValue !== leftValue) {
      return rightValue - leftValue;
    }
    const pairLabel = `${left.valueA}::${left.valueB}`;
    const otherPairLabel = `${right.valueA}::${right.valueB}`;
    return pairLabel.localeCompare(otherPairLabel);
  });
}

function formatProgressLabel(progress: {
  completedRuns: number;
  totalRuns: number;
  currentRunId?: string | null;
  updatedAt: string;
}): string {
  const completedRuns = Math.min(progress.completedRuns, progress.totalRuns);
  const currentRunNote = progress.currentRunId != null ? ` Currently on ${progress.currentRunId.slice(-8)}.` : '';
  return `${completedRuns.toLocaleString()} of ${progress.totalRuns.toLocaleString()} source runs processed.${currentRunNote}`;
}

function getProgressPercent(progress: {
  completedRuns: number;
  totalRuns: number;
}): number {
  if (progress.totalRuns <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((Math.min(progress.completedRuns, progress.totalRuns) / progress.totalRuns) * 100));
}

export function PairwiseDivergenceDrilldownReport({ selectedPair, scope, domainId, signature }: Props) {
  const [{ data, fetching, error }, reexecuteQuery] = useModelPairDivergenceBreakdownQuery({
    variables: {
      modelAId: selectedPair?.modelAId ?? '',
      modelBId: selectedPair?.modelBId ?? '',
      domainId: domainId ?? undefined,
      scope,
      signature,
    },
    requestPolicy: 'cache-and-network',
    pause: selectedPair == null || (scope === 'DOMAIN' && domainId == null),
  });

  const drilldown = data?.modelPairDivergenceBreakdown ?? null;
  const rows = useMemo(() => sortRows(drilldown?.perValuePair ?? []), [drilldown?.perValuePair]);
  const isFetchingRef = useRef(fetching);

  useEffect(() => {
    isFetchingRef.current = fetching;
  }, [fetching]);

  useEffect(() => {
    if (drilldown == null || !drilldown.pending) {
      return;
    }

    const interval = window.setInterval(() => {
      if (!isFetchingRef.current) {
        reexecuteQuery({ requestPolicy: 'network-only' });
      }
    }, DRILLDOWN_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [drilldown, reexecuteQuery]);

  if (selectedPair == null) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        Select a model pair from the matrix above to see per-value-pair divergence.
      </div>
    );
  }

  if (error != null) {
    return <ErrorMessage message={error.message} />;
  }

  if (fetching && drilldown == null) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        Preparing the pairwise divergence breakdown.
      </div>
    );
  }

  if (drilldown == null || drilldown.pending) {
    const progress = drilldown?.buildProgress ?? null;
    const percent = progress != null ? getProgressPercent(progress) : null;

    return (
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-gray-900">Pairwise divergence breakdown</h3>
          <p className="text-sm text-gray-700">
            {progress != null ? formatProgressLabel(progress) : 'The pairwise divergence breakdown is building.'}
          </p>
        </div>
        {progress != null ? (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-teal-500 transition-[width] duration-300"
                style={{ width: `${percent ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              Last updated {new Date(progress.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
            </p>
          </>
        ) : null}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        No value-pair divergence data available for this model pair.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold text-gray-900">
        {drilldown.modelALabel} vs {drilldown.modelBLabel}
      </h3>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <Table variant="bordered" className="min-w-full">
          <TableHeader variant="bordered">
            <TableRow>
              <TableHead scope="col" className="bg-gray-50 px-2 py-2 text-xs uppercase tracking-wide text-gray-500">
                Value Pair
              </TableHead>
              <TableHead scope="col" className="bg-gray-50 px-2 py-2 text-xs uppercase tracking-wide text-gray-500" align="right">
                Cells Compared
              </TableHead>
              <TableHead scope="col" className="bg-gray-50 px-2 py-2 text-xs uppercase tracking-wide text-gray-500" align="right">
                Model A picks A
              </TableHead>
              <TableHead scope="col" className="bg-gray-50 px-2 py-2 text-xs uppercase tracking-wide text-gray-500" align="right">
                Model B picks A
              </TableHead>
              <TableHead scope="col" className="bg-gray-50 px-2 py-2 text-xs uppercase tracking-wide text-gray-500" align="right">
                Mean Abs Divergence
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.valueA}::${row.valueB}`}>
                <TableCell className="font-medium text-gray-900">{row.valueA} vs {row.valueB}</TableCell>
                <TableCell align="right" className="font-mono tabular-nums text-gray-800">
                  {formatCells(row.cellsCompared)}
                </TableCell>
                <TableCell align="right" className="font-mono tabular-nums text-gray-800">
                  {formatPercent(row.modelAProportionA ?? null)}
                </TableCell>
                <TableCell align="right" className="font-mono tabular-nums text-gray-800">
                  {formatPercent(row.modelBProportionA ?? null)}
                </TableCell>
                <TableCell align="right" className="font-mono tabular-nums text-gray-800">
                  {formatPercent(row.meanAbsoluteDivergence ?? null)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
