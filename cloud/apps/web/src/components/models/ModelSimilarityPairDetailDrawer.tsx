import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { type PairMetric, formatMetricNumber, getMethodCopy } from './ModelSimilarityMetrics';

type PairDetailDrawerProps = {
  open: boolean;
  metric: PairMetric | null;
  onClose: () => void;
};

export function PairDetailDrawer({ open, metric, onClose }: PairDetailDrawerProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || metric == null) return null;

  const methodCopy = getMethodCopy(metric.method);

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-4xl flex-col border-l border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-900">
              {metric.left.label} vs {metric.right.label}
            </h2>
            <p className="text-sm text-gray-600">
              {methodCopy.summaryLabel} on win rates · {metric.usedValueCount} value{metric.usedValueCount === 1 ? '' : 's'} compared
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close pair details">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{methodCopy.summaryLabel}</p>
              <div className="mt-2 text-4xl font-semibold text-gray-900">
                {formatMetricNumber(metric.rawScore)}
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {methodCopy.summaryNote}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Similarity</p>
              <div className="mt-2 text-4xl font-semibold text-gray-900">
                {formatMetricNumber(metric.similarity)}
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Bigger means the models are closer.
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Step-by-step calculation</h3>
              <p className="text-xs text-gray-600">
                {methodCopy.helpCopy}
              </p>
            </div>
            {metric.method === 'kendall' ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3 text-left font-medium">Value pair</th>
                      <th className="px-4 py-3 text-right font-medium">{metric.left.label}</th>
                      <th className="px-4 py-3 text-right font-medium">{metric.right.label}</th>
                      <th className="px-4 py-3 text-right font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metric.kendallSteps.map((step) => (
                      <tr key={`${step.leftValueKey}-${step.rightValueKey}`} className="border-b border-gray-100 hover:bg-gray-50">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-gray-900">
                          {step.pairLabel}
                        </th>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.leftDiff)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.rightDiff)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">{step.outcome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th rowSpan={2} className="px-4 py-3 align-bottom">Value</th>
                      <th colSpan={2} className="px-4 py-3 text-center align-bottom">Win rate</th>
                      <th colSpan={3} className="px-4 py-3 text-center align-bottom">Calculation</th>
                    </tr>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3 text-right font-medium">{metric.left.label}</th>
                      <th className="px-4 py-3 text-right font-medium">{metric.right.label}</th>
                      {metric.method === 'weighted-euclidean' ? (
                        <>
                          <th className="px-4 py-3 text-right font-medium">diff</th>
                          <th className="px-4 py-3 text-right font-medium">diff²</th>
                          <th className="px-4 py-3 text-right font-medium">weight × diff²</th>
                        </>
                      ) : metric.method === 'cosine' ? (
                        <>
                          <th className="px-4 py-3 text-right font-medium">centered</th>
                          <th className="px-4 py-3 text-right font-medium">centered</th>
                          <th className="px-4 py-3 text-right font-medium">product</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3 text-right font-medium">rank</th>
                          <th className="px-4 py-3 text-right font-medium">rank</th>
                          <th className="px-4 py-3 text-right font-medium">rank diff²</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {metric.steps.map((step) => (
                      <tr key={step.valueKey} className="border-b border-gray-100 hover:bg-gray-50">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-gray-900">
                          {step.valueLabel}
                        </th>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.leftWinRate)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.rightWinRate)}</td>
                        {metric.method === 'weighted-euclidean' ? (
                          <>
                            <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.diff)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.diffSquared)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-900">
                              {step.weightedDiffSquared == null ? '—' : formatMetricNumber(step.weightedDiffSquared)}
                            </td>
                          </>
                        ) : metric.method === 'cosine' ? (
                          <>
                            <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.leftDerived)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.rightDerived)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-900">
                              {step.leftDerived == null || step.rightDerived == null
                                ? '—'
                                : formatMetricNumber((step.leftDerived ?? 0) * (step.rightDerived ?? 0))}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.leftDerived)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.rightDerived)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.diffSquared)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {metric.summaryRows.map((row) => (
                      <tr key={row.label} className="border-t border-gray-200">
                        <th scope="row" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {row.label}
                        </th>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900" colSpan={3}>
                          {formatMetricNumber(row.value)}
                        </td>
                      </tr>
                    ))}
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
