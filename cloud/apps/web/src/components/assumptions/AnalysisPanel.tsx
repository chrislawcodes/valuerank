import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';
import {
  ORDER_INVARIANCE_ANALYSIS_QUERY,
  type OrderInvarianceAnalysisQueryResult,
  type OrderInvarianceModelMetrics,
  type OrderInvarianceQueryVariables,
} from '../../api/operations/order-invariance';
import { Button } from '../ui/Button';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Loading } from '../ui/Loading';

function formatPercent(value: number | null): string {
  if (value == null) {
    return '—';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatMarginSummary(metrics: OrderInvarianceModelMetrics): string {
  const summary = metrics.pairLevelMarginSummary;
  if (summary == null || summary.median == null) {
    return '—';
  }
  return `med ${summary.median.toFixed(2)} · p25 ${summary.p25?.toFixed(2) ?? '—'} · p75 ${summary.p75?.toFixed(2) ?? '—'}`;
}

export function AnalysisPanel() {
  const [directionOnly, setDirectionOnly] = useState(true);
  const [trimOutliers, setTrimOutliers] = useState(true);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());

  const [{ data, fetching, error }] = useQuery<OrderInvarianceAnalysisQueryResult, OrderInvarianceQueryVariables>({
    query: ORDER_INVARIANCE_ANALYSIS_QUERY,
    variables: {
      directionOnly,
      trimOutliers,
    },
    requestPolicy: 'cache-and-network',
  });

  const result = data?.assumptionsOrderInvariance;
  const allMetrics = useMemo(() => result?.modelMetrics ?? [], [result?.modelMetrics]);
  const rows = useMemo(() => result?.rows ?? [], [result?.rows]);

  useEffect(() => {
    setSelectedModelIds((current) => {
      const availableIds = new Set(allMetrics.map((metric) => metric.modelId));
      if (availableIds.size === 0) {
        return current.size === 0 ? current : new Set();
      }
      if (current.size === 0) {
        return new Set(availableIds);
      }

      const next = new Set(Array.from(current).filter((modelId) => availableIds.has(modelId)));
      return next.size === 0 ? new Set(availableIds) : next;
    });
  }, [allMetrics]);

  const filteredMetrics = useMemo(() => {
    if (selectedModelIds.size === 0) {
      return allMetrics;
    }
    return allMetrics.filter((metric) => selectedModelIds.has(metric.modelId));
  }, [allMetrics, selectedModelIds]);

  const filteredRows = useMemo(() => {
    if (selectedModelIds.size === 0) {
      return rows;
    }
    return rows.filter((row) => selectedModelIds.has(row.modelId));
  }, [rows, selectedModelIds]);

  const overallValueEligible = filteredMetrics.reduce((sum, metric) => sum + metric.valueOrderEligibleCount, 0);
  const overallScaleEligible = filteredMetrics.reduce((sum, metric) => sum + metric.scaleOrderEligibleCount, 0);
  const overallMatchEligible = filteredMetrics.reduce((sum, metric) => sum + metric.matchEligibleCount, 0);

  return (
    <section className="space-y-5 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Backend Analysis</h2>
          <p className="mt-1 text-sm text-gray-600">
            Reversal and pull metrics are computed from backend-selected trials. The table below renders `modelMetrics` directly.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={directionOnly ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setDirectionOnly(true)}
          >
            Direction Match
          </Button>
          <Button
            type="button"
            variant={!directionOnly ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setDirectionOnly(false)}
          >
            Exact Match
          </Button>
          <Button
            type="button"
            variant={trimOutliers ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setTrimOutliers((current) => !current)}
          >
            {trimOutliers ? 'Trim Outliers' : 'Use Full Selected Set'}
          </Button>
        </div>
      </div>

      {fetching && !result && <Loading size="sm" text="Loading backend analysis..." />}
      {error && <ErrorMessage message={error.message} />}

      {result && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">N (Match)</div>
              <div className="mt-1 text-base font-semibold text-gray-900">{overallMatchEligible.toLocaleString()}</div>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Value Pairs Eligible</div>
              <div className="mt-1 text-base font-semibold text-gray-900">{overallValueEligible.toLocaleString()}</div>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Scale Pairs Eligible</div>
              <div className="mt-1 text-base font-semibold text-gray-900">{overallScaleEligible.toLocaleString()}</div>
            </div>
          </div>

          {allMetrics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allMetrics.map((metric) => {
                const isSelected = selectedModelIds.has(metric.modelId);
                return (
                  <Button
                    key={metric.modelId}
                    type="button"
                    variant={isSelected ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setSelectedModelIds((current) => {
                      const next = new Set(current);
                      if (next.has(metric.modelId)) {
                        next.delete(metric.modelId);
                      } else {
                        next.add(metric.modelId);
                      }
                      return next.size === 0 ? new Set(allMetrics.map((item) => item.modelId)) : next;
                    })}
                  >
                    {metric.modelLabel}
                  </Button>
                );
              })}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Model</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">N (Match)</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Match Rate</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Value Reversals</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Typical Pull (Value)</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Scale Reversals</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Typical Pull (Scale)</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Disagreement</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Pair Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredMetrics.map((metric) => (
                  <tr key={metric.modelId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{metric.modelLabel}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{metric.matchEligibleCount}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{formatPercent(metric.matchRate)}</td>
                    <td className="px-4 py-2 text-right text-gray-700">
                      {formatPercent(metric.valueOrderReversalRate)} ({metric.valueOrderEligibleCount})
                    </td>
                    <td className="px-4 py-2 text-gray-700">{metric.valueOrderPull}</td>
                    <td className="px-4 py-2 text-right text-gray-700">
                      {formatPercent(metric.scaleOrderReversalRate)} ({metric.scaleOrderEligibleCount})
                    </td>
                    <td className="px-4 py-2 text-gray-700">{metric.scaleOrderPull}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{formatPercent(metric.withinCellDisagreementRate)}</td>
                    <td className="px-4 py-2 text-gray-700">{formatMarginSummary(metric)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Supporting Rows</h3>
              <p className="mt-1 text-xs text-gray-600">
                `rows` remain available for drilldown compatibility. `isMatch` here is the legacy row-level match flag, not a reversal signal.
              </p>
            </div>
            <div className="max-h-[28rem] overflow-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-white">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Model</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Vignette</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Condition</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Variant</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Baseline</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Flipped</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Distance</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Legacy Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredRows.map((row) => (
                    <tr key={`${row.modelId}:${row.vignetteId}:${row.conditionKey}:${row.variantType ?? 'baseline'}`}>
                      <td className="px-4 py-2 text-gray-700">{row.modelLabel}</td>
                      <td className="px-4 py-2 text-gray-700">{row.vignetteTitle}</td>
                      <td className="px-4 py-2 text-gray-700">{row.conditionKey}</td>
                      <td className="px-4 py-2 text-gray-700">{row.variantType ?? 'baseline'}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{row.majorityVoteBaseline ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{row.majorityVoteFlipped ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{row.ordinalDistance ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-700">
                        {row.isMatch == null ? 'n/a' : row.isMatch ? 'legacy match' : 'legacy non-match'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
