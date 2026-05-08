import { useMemo } from 'react';
import { Badge } from '../ui/Badge';
import { HeaderTooltip } from '../ui/HeaderTooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import type { ModelAgreementOnTradeoffsQuery } from '../../generated/graphql';

type TrialConsistencyRow = ModelAgreementOnTradeoffsQuery['modelAgreementOnTradeoffs']['trialConsistency'][number];

const TRIAL_CONSISTENCY_EXPLANATION =
  'Measures the dominance of a model\'s modal choice across trials of the same scenario. 1.0 means the model gave the same answer every trial; 0.5 means it split 50/50. This conflates run-to-run variation with scenario-orientation flips and excludes single-trial cells.';

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(1)}%`;
}

export type ModelTrialConsistencyReportProps = {
  rows: TrialConsistencyRow[];
};

export function ModelTrialConsistencyReport({ rows }: ModelTrialConsistencyReportProps) {
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => {
      const labelDelta = left.modelLabel.localeCompare(right.modelLabel);
      return labelDelta !== 0 ? labelDelta : left.modelId.localeCompare(right.modelId);
    }),
    [rows],
  );

  if (sortedRows.length === 0) {
    return <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">No trial consistency data available.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <Table variant="bordered" className="min-w-full">
          <TableHeader variant="bordered">
            <TableRow>
              <TableHead scope="col" className="bg-gray-50 px-2 py-2 text-xs uppercase tracking-wide text-gray-500">
                Model
              </TableHead>
              <TableHead scope="col" className="bg-gray-50 px-2 py-2 text-xs uppercase tracking-wide text-gray-500">
                Cells Observed
              </TableHead>
              <TableHead scope="col" className="bg-gray-50 px-2 py-2 text-xs uppercase tracking-wide text-gray-500">
                <HeaderTooltip label="Trial Consistency" content={TRIAL_CONSISTENCY_EXPLANATION} />
              </TableHead>
              <TableHead scope="col" className="bg-gray-50 px-2 py-2 text-xs uppercase tracking-wide text-gray-500">
                Noisy
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={row.modelId}>
                <TableCell className="font-medium text-gray-900">{row.modelLabel}</TableCell>
                <TableCell className="font-mono tabular-nums text-gray-800">{row.cellsObserved.toLocaleString()}</TableCell>
                <TableCell className="font-mono tabular-nums text-gray-800">{formatPercent(row.meanTrialConsistency ?? null)}</TableCell>
                <TableCell>
                  {row.noisy ? (
                    <Badge variant="warning" size="sm">Noisy</Badge>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs leading-5 text-gray-500">{TRIAL_CONSISTENCY_EXPLANATION}</p>
    </div>
  );
}
