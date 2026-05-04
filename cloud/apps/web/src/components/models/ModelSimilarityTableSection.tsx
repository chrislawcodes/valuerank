import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Info, X } from 'lucide-react';
import { type ModelEntry, VALUES, VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';

type MetricView = 'distance' | 'similarity';

type PairStep = {
  valueKey: ValueKey;
  valueLabel: string;
  leftWinRate: number | null;
  rightWinRate: number | null;
  diff: number | null;
  diffSquared: number | null;
  weight: number;
  weightedDiffSquared: number | null;
};

type PairMetric = {
  left: ModelEntry;
  right: ModelEntry;
  steps: PairStep[];
  usedValueCount: number;
  sumWeightedDiffSquared: number;
  distance: number | null;
  similarity: number | null;
};

type PairDetailDrawerProps = {
  open: boolean;
  metric: PairMetric | null;
  onClose: () => void;
};

type ModelSimilarityTableSectionProps = {
  models: ModelEntry[];
};

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function formatMetricNumber(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toFixed(2);
}

function getHeatColor(intensity: number): string {
  const clamped = Math.max(0, Math.min(1, intensity));
  const stops = [
    { at: 0, rgb: [220, 38, 38] },
    { at: 0.5, rgb: [250, 204, 21] },
    { at: 1, rgb: [22, 163, 74] },
  ] as const;

  const rightIndex = clamped <= 0.5 ? 1 : 2;
  const left = stops[rightIndex - 1]!;
  const right = stops[rightIndex];
  const localT = (clamped - left.at) / (right.at - left.at);
  const r = Math.round(left.rgb[0] + (right.rgb[0] - left.rgb[0]) * localT);
  const g = Math.round(left.rgb[1] + (right.rgb[1] - left.rgb[1]) * localT);
  const b = Math.round(left.rgb[2] + (right.rgb[2] - left.rgb[2]) * localT);
  return `rgba(${r}, ${g}, ${b}, 0.24)`;
}

function formatViewValue(metric: PairMetric | null, view: MetricView): string {
  if (metric == null || metric.usedValueCount === 0) return '—';
  if (view === 'similarity') return formatMetricNumber(metric.similarity);
  return formatMetricNumber(metric.distance);
}

function getCellIntensity(metric: PairMetric | null, view: MetricView, maxDistance: number): number {
  if (metric == null || metric.usedValueCount === 0) return 0;
  if (view === 'similarity') {
    return metric.similarity ?? 0;
  }
  if (maxDistance <= 0) return 1;
  return 1 - Math.max(0, Math.min(1, (metric.distance ?? 0) / maxDistance));
}

function computePairMetric(left: ModelEntry, right: ModelEntry): PairMetric {
  const steps: PairStep[] = VALUES.map((valueKey) => {
    const valueLabel = VALUE_LABELS[valueKey];
    const leftWinRate = left.winRates?.[valueKey] ?? null;
    const rightWinRate = right.winRates?.[valueKey] ?? null;

    if (leftWinRate == null || rightWinRate == null) {
      return {
        valueKey,
        valueLabel,
        leftWinRate,
        rightWinRate,
        diff: null,
        diffSquared: null,
        weight: 1,
        weightedDiffSquared: null,
      };
    }

    const diff = leftWinRate - rightWinRate;
    const diffSquared = diff * diff;

    return {
      valueKey,
      valueLabel,
      leftWinRate,
      rightWinRate,
      diff,
      diffSquared,
      weight: 1,
      weightedDiffSquared: diffSquared,
    };
  });

  const usedSteps = steps.filter((step) => step.weightedDiffSquared != null);
  const usedValueCount = usedSteps.length;
  const sumWeightedDiffSquared = usedSteps.reduce((sum, step) => sum + (step.weightedDiffSquared ?? 0), 0);
  const distance = usedValueCount === 0 ? null : Math.sqrt(sumWeightedDiffSquared / usedValueCount);
  const similarity = distance == null ? null : Math.max(0, Math.min(1, 1 - distance / 100));

  return {
    left,
    right,
    steps,
    usedValueCount,
    sumWeightedDiffSquared,
    distance,
    similarity,
  };
}

function PairDetailDrawer({ open, metric, onClose }: PairDetailDrawerProps) {
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
              Weighted Euclidean on win rates · {metric.usedValueCount} value{metric.usedValueCount === 1 ? '' : 's'} compared
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close pair details">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Distance</p>
              <div className="mt-2 text-4xl font-semibold text-gray-900">
                {formatMetricNumber(metric.distance)}
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Smaller means the two models are closer.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Similarity</p>
              <div className="mt-2 text-4xl font-semibold text-gray-900">
                {formatMetricNumber(metric.similarity)}
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Bigger means the two models are closer.
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Step-by-step calculation</h3>
              <p className="text-xs text-gray-600">
                All values use weight 1 here, so every value counts equally.
              </p>
            </div>
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
                    <th className="px-4 py-3 text-right font-medium">diff</th>
                    <th className="px-4 py-3 text-right font-medium">diff²</th>
                    <th className="px-4 py-3 text-right font-medium">weight × diff²</th>
                  </tr>
                </thead>
                <tbody>
                  {metric.steps.map((step) => (
                    <tr key={step.valueKey} className="border-b border-gray-100 hover:bg-gray-50">
                      <th scope="row" className="px-4 py-3 text-left font-medium text-gray-900">
                        {step.valueLabel}
                      </th>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">{formatPercent(step.leftWinRate)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">{formatPercent(step.rightWinRate)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.diff)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">{formatMetricNumber(step.diffSquared)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">
                        {step.weightedDiffSquared == null ? '—' : formatMetricNumber(step.weightedDiffSquared)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300">
                    <th scope="row" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Sum of weighted diff²
                    </th>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900" colSpan={2}>
                      {formatMetricNumber(metric.sumWeightedDiffSquared)}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Divide by count
                    </th>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900" colSpan={3}>
                      {metric.usedValueCount === 0 ? '—' : `${formatMetricNumber(metric.sumWeightedDiffSquared / metric.usedValueCount)}`}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Square root = distance
                    </th>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900" colSpan={3}>
                      {formatMetricNumber(metric.distance)}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Similarity = 1 - distance / 100
                    </th>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900" colSpan={3}>
                      {formatMetricNumber(metric.similarity)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export function ModelSimilarityTableSection({ models }: ModelSimilarityTableSectionProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [view, setView] = useState<MetricView>('distance');
  const [activeMetric, setActiveMetric] = useState<PairMetric | null>(null);

  const matrix = useMemo(() => {
    const rows = new Map<string, Map<string, PairMetric>>();
    let maxDistance = 0;

    for (const left of models) {
      const row = new Map<string, PairMetric>();
      for (const right of models) {
        const metric = left.model === right.model ? null : computePairMetric(left, right);
        if (metric != null && metric.distance != null && metric.distance > maxDistance) {
          maxDistance = metric.distance;
        }
        row.set(right.model, metric ?? {
          left,
          right,
          steps: [],
          usedValueCount: 0,
          sumWeightedDiffSquared: 0,
          distance: 0,
          similarity: 1,
        });
      }
      rows.set(left.model, row);
    }

    return {
      rows,
      maxDistance: maxDistance > 0 ? maxDistance : 1,
    };
  }, [models]);

  const helpCopy = view === 'distance'
    ? 'Distance is the raw weighted Euclidean score. Smaller numbers mean the models are closer.'
    : 'Similarity is the same comparison flipped to a 0-1 scale. Bigger numbers mean the models are closer.';

  if (models.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-sm text-gray-500">No model win-rate data available for the similarity table.</div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-base font-medium text-gray-900">Model Similarity Table</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHelp((value) => !value)}
            className="h-8 w-8 text-gray-500 hover:text-gray-700"
            aria-label={showHelp ? 'Hide similarity explanation' : 'Show similarity explanation'}
          >
            {showHelp ? <X className="h-8 w-8" /> : <HelpCircle className="h-8 w-8" />}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            {(['distance', 'similarity'] as const).map((option) => {
              const active = view === option;
              return (
                <Button
                  key={option}
                  type="button"
                  variant={active ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setView(option)}
                  className={`rounded-md px-3 py-1 text-xs font-medium min-h-0 ${
                    active ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-600 hover:bg-white hover:text-gray-900'
                  }`}
                >
                  {option === 'distance' ? 'Distance' : 'Similarity'}
                </Button>
              );
            })}
          </div>

          <CopyVisualButton targetRef={tableRef} label="model similarity table" />
        </div>
      </div>

      {showHelp && (
        <div className="mb-4 space-y-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-gray-700">
          <p>
            We compare the win rate for each value, then use weighted Euclidean distance to see how close two models are.
            All weights are 1 here, so every value counts equally.
          </p>
          <p>
            <strong>Distance</strong> is the raw math. Smaller means closer.
            <strong> Similarity</strong> is the same result flipped so bigger means closer.
          </p>
          <p>
            Click a cell to open the pair detail drawer and see every value-by-value difference.
          </p>
        </div>
      )}

      <div ref={tableRef} className="rounded border border-gray-100 bg-white p-2">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-600">
          <span>{helpCopy}</span>
          <span>
            {view === 'distance' ? 'Green = closer' : 'Green = more similar'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <caption className="sr-only">Pairwise model similarity matrix</caption>
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th scope="col" className="px-2 py-2 text-left font-medium">Model</th>
                {models.map((model) => (
                  <th key={model.model} scope="col" className="px-2 py-2 text-right font-medium">
                    {model.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((rowModel) => (
                <tr key={rowModel.model} className="border-b border-gray-100">
                  <th scope="row" className="px-2 py-2 text-left font-medium text-gray-900">
                    {rowModel.label}
                  </th>
                  {models.map((colModel) => {
                    const metric = matrix.rows.get(rowModel.model)?.get(colModel.model) ?? null;
                    const isSelf = rowModel.model === colModel.model;
                    const isUnavailable = metric == null || metric.usedValueCount === 0;
                    const displayValue = formatViewValue(metric, view);
                    const intensity = getCellIntensity(metric, view, matrix.maxDistance);
                    return (
                      <td
                        key={colModel.model}
                        className="px-1 py-1 text-right text-gray-800"
                        style={{ background: isSelf ? undefined : getHeatColor(intensity) }}
                      >
                        {isSelf ? (
                          <span className="block rounded-md px-2 py-2 text-center font-mono text-gray-400">—</span>
                        ) : isUnavailable ? (
                          <span className="block rounded-md px-2 py-2 text-center font-mono text-gray-400">—</span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="flex w-full items-center justify-end gap-1 rounded-md px-2 py-2 font-mono text-gray-900 transition hover:bg-white/70 hover:ring-1 hover:ring-teal-300"
                            aria-label={`Open details for ${rowModel.label} and ${colModel.label}`}
                            onClick={() => setActiveMetric(metric)}
                          >
                            <span>{displayValue}</span>
                            <Info className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                          </Button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PairDetailDrawer
        open={activeMetric != null}
        metric={activeMetric}
        onClose={() => setActiveMetric(null)}
      />
    </section>
  );
}
