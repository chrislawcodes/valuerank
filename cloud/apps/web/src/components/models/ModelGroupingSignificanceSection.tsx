import { useRef } from 'react';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Loading } from '../ui/Loading';
import type { ModelGroupingSignificanceResult } from '../../api/operations/modelGroupingSignificance';
import { ModelGroupingSignificanceHeatmap } from './ModelGroupingSignificanceHeatmap';
import { ModelGroupingSignificanceTable } from './ModelGroupingSignificanceTable';

type Props = {
  report: ModelGroupingSignificanceResult | null;
  selectedModelCount: number;
  scopeLabel: string;
  loading?: boolean;
  errorMessage?: string | null;
};

export function ModelGroupingSignificanceSection({
  report,
  selectedModelCount,
  scopeLabel,
  loading = false,
  errorMessage = null,
}: Props) {
  const reportRef = useRef<HTMLDivElement>(null);

  if (errorMessage != null) {
    return <ErrorMessage message={`Failed to load statistical differences report: ${errorMessage}`} />;
  }

  if (selectedModelCount < 2) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4 md:p-5">
        <h2 className="text-lg font-semibold text-gray-900">Statistical Differences in Value Preferences</h2>
        <p className="mt-2 text-sm text-gray-600">
          Select at least two models in the header picker to compare value preferences.
        </p>
      </section>
    );
  }

  if (loading && report == null) {
    return <Loading size="lg" text="Loading statistical differences report..." />;
  }

  if (report == null) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4 md:p-5">
        <h2 className="text-lg font-semibold text-gray-900">Statistical Differences in Value Preferences</h2>
        <p className="mt-2 text-sm text-gray-600">No pairwise significance data is available for the current selection.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Statistical Differences in Value Preferences</h2>
            <p className="mt-1 text-sm text-gray-600">
              For each vignette, each model&apos;s binary side choice is derived from its transcripts (majority wins).
              McNemar&apos;s test compares each pair of models on these binary choices, corrected for multiple comparisons using Holm-Bonferroni.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium">
              Scope: {scopeLabel}
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium">
              Models: {selectedModelCount}
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium">
              Pairs: {report.rows.length}
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium">
              Table is source of truth
            </span>
          </div>
        </div>

        <CopyVisualButton targetRef={reportRef} label="statistical differences in value preferences" />
      </div>

      <div ref={reportRef} className="space-y-4">
        <ModelGroupingSignificanceHeatmap models={report.models} rows={report.rows} />
        <ModelGroupingSignificanceTable rows={report.rows} />
      </div>
    </section>
  );
}
