import { useMemo, useRef, useState } from 'react';
import { HelpCircle, Info, X } from 'lucide-react';
import { type ModelEntry } from '../../data/domainAnalysisData';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import {
  type CalculationMethod,
  type MetricView,
  type PairMetric,
  type PairwiseKappaEntry,
  computePairMetric,
  formatViewValue,
  getCellIntensity,
  getHeatColor,
  getKappaCellValue,
  getKappaDivergingColor,
  getMethodCopy,
} from './ModelSimilarityMetrics';
import { PairDetailDrawer } from './ModelSimilarityPairDetailDrawer';

/** Wide-CI threshold matches the backend constant. */
const KAPPA_CI_WIDE_THRESHOLD = 0.30;

function isCIWide(low: number | null | undefined, high: number | null | undefined): boolean {
  if (low == null || high == null) return false;
  return (high - low) > KAPPA_CI_WIDE_THRESHOLD || low < 0;
}

type ModelSimilarityTableSectionProps = {
  models: ModelEntry[];
  method?: CalculationMethod;
  pairwiseKappa?: Map<string, Map<string, number | PairwiseKappaEntry>>;
};

export function ModelSimilarityTableSection({ models, method: methodProp, pairwiseKappa }: ModelSimilarityTableSectionProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const method = methodProp ?? 'weighted-euclidean';
  const [view, setView] = useState<MetricView>('distance');
  const [activePair, setActivePair] = useState<{ left: string; right: string } | null>(null);

  const matrix = useMemo(() => {
    const rows = new Map<string, Map<string, PairMetric | null>>();

    for (const left of models) {
      const row = new Map<string, PairMetric | null>();
      for (const right of models) {
        row.set(right.model, left.model === right.model ? null : computePairMetric(left, right, method, pairwiseKappa));
      }
      rows.set(left.model, row);
    }

    const similarities: number[] = [];
    for (const row of rows.values()) {
      for (const metric of row.values()) {
        if (metric != null && metric.usedValueCount > 0 && metric.similarity != null) {
          similarities.push(metric.similarity);
        }
      }
    }

    const minSimilarity = similarities.length > 0 ? Math.min(...similarities) : 0;
    const maxSimilarity = similarities.length > 0 ? Math.max(...similarities) : 1;

    return { rows, minSimilarity, maxSimilarity };
  }, [models, method]);
  const activeMetric = useMemo(() => {
    if (activePair == null) return null;
    const left = models.find((model) => model.model === activePair.left) ?? null;
    const right = models.find((model) => model.model === activePair.right) ?? null;
    if (left == null || right == null) return null;
    return computePairMetric(left, right, method, pairwiseKappa);
  }, [activePair, method, models, pairwiseKappa]);

  const methodCopy = getMethodCopy(method);
  const isKappaMethod = method === 'kappa';
  const helpCopy = isKappaMethod
    ? view === 'distance'
      ? 'Distance is 1 − kappa. Range: 0 (perfect agreement) to 2 (perfect anti-correlation).'
      : "Similarity shows Cohen's kappa directly. Range: -1 (perfect anti-correlation) to +1 (perfect agreement)."
    : view === 'distance'
      ? 'Distance is the selected method flipped into a closer/farther view. For correlation-style methods, that distance is normalized to a 0-1 scale.'
      : 'Similarity is the selected method shown on a closer-is-better scale.';

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
          <h2 className="text-base font-medium text-gray-900">Similarity by Model</h2>
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
          <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
            <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">View</span>
            <div className="inline-flex rounded-md border border-gray-200 bg-white p-1">
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
                      active ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {option === 'distance' ? 'Distance' : 'Similarity'}
                  </Button>
                );
              })}
            </div>
          </div>

          <CopyVisualButton targetRef={tableRef} label="model similarity table" />
        </div>
      </div>

      {showHelp && (
        <div className="mb-4 space-y-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-gray-700">
          <p>{methodCopy.helpCopy}</p>
          <p>
            <strong>Distance</strong> is the selected method flipped into a closer/farther view.{' '}
            <strong>Similarity</strong> is the same result on a closer-is-better scale.
          </p>
          <p>
            Click a cell to open the pair detail drawer and see every value-by-value difference.
          </p>
        </div>
      )}

      <div ref={tableRef} className="rounded border border-gray-100 bg-white p-2">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-600">
          <span>{helpCopy}</span>
          <span>{isKappaMethod ? 'Red = disagree · White = chance · Green = agree' : view === 'distance' ? 'Green = closer' : 'Green = more similar'}</span>
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

                    let cellBackground: string | undefined;
                    if (!isSelf) {
                      if (isKappaMethod) {
                        const kappaVal = getKappaCellValue(metric);
                        cellBackground = kappaVal != null ? getKappaDivergingColor(kappaVal) : undefined;
                      } else {
                        const rawIntensity = getCellIntensity(metric);
                        const { minSimilarity, maxSimilarity } = matrix;
                        const intensity = maxSimilarity === minSimilarity
                          ? rawIntensity
                          : (rawIntensity - minSimilarity) / (maxSimilarity - minSimilarity);
                        cellBackground = getHeatColor(intensity);
                      }
                    }

                    // Kappa cells don't open a detail drawer (no step-by-step data).
                    const canOpenDetail = !isKappaMethod && !isUnavailable && !isSelf;

                    // CI rendering for kappa method.
                    const ciLow = isKappaMethod ? metric?.confidenceLow : undefined;
                    const ciHigh = isKappaMethod ? metric?.confidenceHigh : undefined;
                    const ciIsSymmetric = isKappaMethod ? (metric?.confidenceIsSymmetric ?? true) : true;
                    const ciIsWide = isKappaMethod && isCIWide(ciLow, ciHigh);
                    const hasCi = ciLow != null && ciHigh != null;

                    // Build the CI second line.
                    let ciLine: string | null = null;
                    if (isKappaMethod && hasCi && ciLow != null && ciHigh != null) {
                      if (ciIsSymmetric) {
                        const halfWidth = (ciHigh - ciLow) / 2;
                        ciLine = `± ${halfWidth.toFixed(2)}`;
                      } else {
                        const lowStr = ciLow >= 0 ? `+${ciLow.toFixed(2)}` : ciLow.toFixed(2);
                        const highStr = ciHigh >= 0 ? `+${ciHigh.toFixed(2)}` : ciHigh.toFixed(2);
                        ciLine = `[${lowStr}, ${highStr}]`;
                      }
                    }

                    return (
                      <td
                        key={colModel.model}
                        className="px-1 py-1 text-right text-gray-800"
                        style={{
                          background: cellBackground,
                          ...(ciIsWide ? { outline: '1.5px dashed #f9a8d4', outlineOffset: '-1px' } : {}),
                        }}
                      >
                        {isSelf ? (
                          <span className="block rounded-md px-2 py-2 text-center font-mono text-gray-400">—</span>
                        ) : isUnavailable ? (
                          <span className="block rounded-md px-2 py-2 text-center font-mono text-gray-400">—</span>
                        ) : canOpenDetail ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="flex w-full items-center justify-end gap-1 rounded-md px-2 py-2 font-mono text-gray-900 transition hover:bg-white/70 hover:ring-1 hover:ring-teal-300"
                            aria-label={`Open details for ${rowModel.label} and ${colModel.label}`}
                            onClick={() => setActivePair({ left: rowModel.model, right: colModel.model })}
                          >
                            <span>{displayValue}</span>
                            <Info className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                          </Button>
                        ) : (
                          <span className="relative block rounded-md px-2 py-1 text-right font-mono text-gray-900">
                            <span className="block">{displayValue}</span>
                            {ciLine != null && (
                              <span className="block text-[10px] leading-tight text-gray-500">{ciLine}</span>
                            )}
                            {ciIsWide && (
                              <span
                                className="absolute right-1 top-1 text-[9px] leading-none text-pink-500"
                                aria-label="Wide confidence interval"
                                title="Wide CI — insufficient data to constrain estimate"
                              >
                                ⚠
                              </span>
                            )}
                          </span>
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
        onClose={() => setActivePair(null)}
      />
    </section>
  );
}
