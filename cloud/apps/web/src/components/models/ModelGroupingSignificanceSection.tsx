import { useEffect, useRef, useState } from 'react';
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

  // Track elapsed seconds while pending. Hooks must be before any early returns.
  const isPending = report?.pending === true;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!isPending) {
      setElapsedSeconds(0);
      return;
    }
    setElapsedSeconds(0);
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isPending]);

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

  if (isPending) {
    // Cap display at 90% — we don't know exact completion, only that it takes ~90s.
    const progressPct = Math.min(90, Math.round((elapsedSeconds / 90) * 100));
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4 md:p-5">
        <h2 className="text-lg font-semibold text-gray-900">Statistical Differences in Value Preferences</h2>
        <p className="mt-2 text-sm text-gray-600">Computing for the first time — checking for results every 5 seconds.</p>
        <div className="mt-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Building report…</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
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
              For each value pair, each model&apos;s win rate is averaged across both presentation orders. The Wilcoxon signed-rank test compares these win rates for each model pair, corrected for multiple comparisons using Holm-Bonferroni.
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
