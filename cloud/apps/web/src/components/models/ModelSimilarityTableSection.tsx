import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Info, X } from 'lucide-react';
import { type ModelEntry, VALUES, VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';

type CalculationMethod = 'weighted-euclidean' | 'cosine' | 'spearman' | 'kendall';
type MetricView = 'distance' | 'similarity';

type PairStep = {
  valueKey: ValueKey;
  valueLabel: string;
  leftWinRate: number | null;
  rightWinRate: number | null;
  leftDerived: number | null;
  rightDerived: number | null;
  diff: number | null;
  diffSquared: number | null;
  weight: number | null;
  weightedDiffSquared: number | null;
};

type KendallStep = {
  leftValueKey: ValueKey;
  rightValueKey: ValueKey;
  pairLabel: string;
  leftDiff: number | null;
  rightDiff: number | null;
  outcome: 'concordant' | 'discordant' | 'tie-left' | 'tie-right' | 'tie-both';
};

type PairMetric = {
  left: ModelEntry;
  right: ModelEntry;
  method: CalculationMethod;
  steps: PairStep[];
  kendallSteps: KendallStep[];
  usedValueCount: number;
  rawScore: number | null;
  distance: number | null;
  similarity: number | null;
  summaryLabel: string;
  summaryNote: string;
  summaryRows: Array<{ label: string; value: number | null }>;
};

type PairDetailDrawerProps = {
  open: boolean;
  metric: PairMetric | null;
  onClose: () => void;
};

type ModelSimilarityTableSectionProps = {
  models: ModelEntry[];
};

const CALCULATION_METHODS: Array<{ value: CalculationMethod; label: string }> = [
  { value: 'weighted-euclidean', label: 'Weighted Euclidean' },
  { value: 'cosine', label: 'Cosine' },
  { value: 'spearman', label: 'Spearman' },
  { value: 'kendall', label: 'Kendall' },
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

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
  const left = stops[rightIndex - 1] ?? stops[0];
  const right = stops[rightIndex] ?? stops[stops.length - 1];
  const localT = (clamped - left.at) / (right.at - left.at);
  const r = Math.round(left.rgb[0] + (right.rgb[0] - left.rgb[0]) * localT);
  const g = Math.round(left.rgb[1] + (right.rgb[1] - left.rgb[1]) * localT);
  const b = Math.round(left.rgb[2] + (right.rgb[2] - left.rgb[2]) * localT);
  return `rgba(${r}, ${g}, ${b}, 0.24)`;
}

function formatViewValue(metric: PairMetric | null, view: MetricView): string {
  if (metric == null || metric.usedValueCount === 0) return '—';
  return view === 'similarity'
    ? formatMetricNumber(metric.similarity)
    : formatMetricNumber(metric.distance);
}

function getCellIntensity(metric: PairMetric | null): number {
  if (metric == null || metric.usedValueCount === 0) return 0;
  return metric.similarity ?? 0;
}

function getMethodCopy(method: CalculationMethod) {
  switch (method) {
    case 'weighted-euclidean':
      return {
        summaryLabel: 'Weighted Euclidean distance',
        summaryNote: 'Smaller means the two models are closer.',
        helpCopy: 'We compare the win rate for each value, then use weighted Euclidean distance to see how close two models are.',
      };
    case 'cosine':
      return {
        summaryLabel: 'Cosine similarity',
        summaryNote: 'Bigger means the two models are closer.',
        helpCopy: 'We center each model around its own average win rate, then compare the direction of the two value patterns.',
      };
    case 'spearman':
      return {
        summaryLabel: 'Spearman rho',
        summaryNote: 'Bigger means the two models are closer.',
        helpCopy: 'We rank the values for each model, then compare how well the two rank orders line up.',
      };
    case 'kendall':
      return {
        summaryLabel: 'Kendall tau-b',
        summaryNote: 'Bigger means the two models are closer.',
        helpCopy: 'We compare every pair of values and count how often the two models keep the same order.',
      };
  }
}

function rankValues(values: Array<{ valueKey: ValueKey; value: number }>): Map<ValueKey, number> {
  const sorted = [...values].sort((left, right) => {
    if (right.value !== left.value) return right.value - left.value;
    return left.valueKey.localeCompare(right.valueKey);
  });

  const ranks = new Map<ValueKey, number>();
  let index = 0;

  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && Math.abs(sorted[end]!.value - sorted[index]!.value) < 1e-9) {
      end += 1;
    }

    const averageRank = ((index + 1) + end) / 2;
    for (let i = index; i < end; i += 1) {
      ranks.set(sorted[i]!.valueKey, averageRank);
    }
    index = end;
  }

  return ranks;
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length === 0 || xs.length !== ys.length) return null;

  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;

  let numerator = 0;
  let sumSquaredX = 0;
  let sumSquaredY = 0;

  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index]! - meanX;
    const dy = ys[index]! - meanY;
    numerator += dx * dy;
    sumSquaredX += dx * dx;
    sumSquaredY += dy * dy;
  }

  const denominator = Math.sqrt(sumSquaredX * sumSquaredY);
  if (denominator === 0) return null;
  return numerator / denominator;
}

function cosineSimilarity(xs: number[], ys: number[]): number | null {
  if (xs.length === 0 || xs.length !== ys.length) return null;

  let dot = 0;
  let sumSquaredX = 0;
  let sumSquaredY = 0;

  for (let index = 0; index < xs.length; index += 1) {
    dot += xs[index]! * ys[index]!;
    sumSquaredX += xs[index]! * xs[index]!;
    sumSquaredY += ys[index]! * ys[index]!;
  }

  const denominator = Math.sqrt(sumSquaredX * sumSquaredY);
  if (denominator === 0) return null;
  return dot / denominator;
}

function buildDisplayScores(rawScore: number | null, method: CalculationMethod): { distance: number | null; similarity: number | null } {
  if (rawScore == null) return { distance: null, similarity: null };

  if (method === 'weighted-euclidean') {
    return {
      distance: rawScore,
      similarity: clamp01(1 - rawScore / 100),
    };
  }

  const similarity = clamp01((rawScore + 1) / 2);
  return {
    distance: clamp01(1 - similarity),
    similarity,
  };
}

function computePairMetric(left: ModelEntry, right: ModelEntry, method: CalculationMethod): PairMetric {
  const comparableValues = VALUES.map((valueKey) => {
    const valueLabel = VALUE_LABELS[valueKey];
    const leftWinRate = left.winRates?.[valueKey] ?? null;
    const rightWinRate = right.winRates?.[valueKey] ?? null;
    return { valueKey, valueLabel, leftWinRate, rightWinRate };
  }).filter((entry) => entry.leftWinRate != null && entry.rightWinRate != null);

  const copy = getMethodCopy(method);

  if (method === 'weighted-euclidean') {
    const steps: PairStep[] = comparableValues.map((entry) => {
      const diff = (entry.leftWinRate ?? 0) - (entry.rightWinRate ?? 0);
      const diffSquared = diff * diff;
      return {
        ...entry,
        leftDerived: null,
        rightDerived: null,
        diff,
        diffSquared,
        weight: 1,
        weightedDiffSquared: diffSquared,
      };
    });

    const usedValueCount = steps.length;
    const sumWeightedDiffSquared = steps.reduce((sum, step) => sum + (step.weightedDiffSquared ?? 0), 0);
    const rawScore = usedValueCount === 0 ? null : Math.sqrt(sumWeightedDiffSquared / usedValueCount);
    const displayScores = buildDisplayScores(rawScore, method);

    return {
      left,
      right,
      method,
      steps,
      kendallSteps: [],
      usedValueCount,
      rawScore,
      distance: displayScores.distance,
      similarity: displayScores.similarity,
      summaryLabel: copy.summaryLabel,
      summaryNote: copy.summaryNote,
      summaryRows: [
        { label: 'Sum of weighted diff²', value: sumWeightedDiffSquared },
        { label: 'Divide by count', value: usedValueCount === 0 ? null : sumWeightedDiffSquared / usedValueCount },
        { label: 'Square root = distance', value: rawScore },
      ],
    };
  }

  if (method === 'cosine') {
    const leftValues = comparableValues.map((entry) => entry.leftWinRate ?? 0);
    const rightValues = comparableValues.map((entry) => entry.rightWinRate ?? 0);
    const leftMean = leftValues.reduce((sum, value) => sum + value, 0) / leftValues.length;
    const rightMean = rightValues.reduce((sum, value) => sum + value, 0) / rightValues.length;

    const steps: PairStep[] = comparableValues.map((entry) => {
      const leftDerived = (entry.leftWinRate ?? 0) - leftMean;
      const rightDerived = (entry.rightWinRate ?? 0) - rightMean;
      return {
        ...entry,
        leftDerived,
        rightDerived,
        diff: null,
        diffSquared: null,
        weight: null,
        weightedDiffSquared: null,
      };
    });

    const leftCentered = steps.map((step) => step.leftDerived ?? 0);
    const rightCentered = steps.map((step) => step.rightDerived ?? 0);
    const rawScore = cosineSimilarity(leftCentered, rightCentered);
    const displayScores = buildDisplayScores(rawScore, method);
    const dot = steps.reduce((sum, step) => sum + ((step.leftDerived ?? 0) * (step.rightDerived ?? 0)), 0);
    const leftNorm = Math.sqrt(leftCentered.reduce((sum, value) => sum + value * value, 0));
    const rightNorm = Math.sqrt(rightCentered.reduce((sum, value) => sum + value * value, 0));

    return {
      left,
      right,
      method,
      steps,
      kendallSteps: [],
      usedValueCount: steps.length,
      rawScore,
      distance: displayScores.distance,
      similarity: displayScores.similarity,
      summaryLabel: copy.summaryLabel,
      summaryNote: copy.summaryNote,
      summaryRows: [
        { label: 'Mean left win rate', value: leftMean },
        { label: 'Mean right win rate', value: rightMean },
        { label: 'Dot product', value: dot },
        { label: 'Left vector length', value: leftNorm },
        { label: 'Right vector length', value: rightNorm },
        { label: 'Cosine similarity', value: rawScore },
      ],
    };
  }

  if (method === 'spearman') {
    const leftRanks = rankValues(comparableValues.map((entry) => ({ valueKey: entry.valueKey, value: entry.leftWinRate ?? 0 })));
    const rightRanks = rankValues(comparableValues.map((entry) => ({ valueKey: entry.valueKey, value: entry.rightWinRate ?? 0 })));

    const steps: PairStep[] = comparableValues.map((entry) => {
      const leftDerived = leftRanks.get(entry.valueKey) ?? null;
      const rightDerived = rightRanks.get(entry.valueKey) ?? null;
      const diff = leftDerived == null || rightDerived == null ? null : leftDerived - rightDerived;
      const diffSquared = diff == null ? null : diff * diff;
      return {
        ...entry,
        leftDerived,
        rightDerived,
        diff,
        diffSquared,
        weight: null,
        weightedDiffSquared: null,
      };
    });

    const rankLeft = steps.map((step) => step.leftDerived ?? 0);
    const rankRight = steps.map((step) => step.rightDerived ?? 0);
    const rawScore = pearsonCorrelation(rankLeft, rankRight);
    const displayScores = buildDisplayScores(rawScore, method);
    const sumRankDiffSquared = steps.reduce((sum, step) => sum + (step.diffSquared ?? 0), 0);

    return {
      left,
      right,
      method,
      steps,
      kendallSteps: [],
      usedValueCount: steps.length,
      rawScore,
      distance: displayScores.distance,
      similarity: displayScores.similarity,
      summaryLabel: copy.summaryLabel,
      summaryNote: copy.summaryNote,
      summaryRows: [
        { label: 'Sum of rank diff²', value: sumRankDiffSquared },
        { label: 'Pearson correlation of ranks', value: rawScore },
        { label: 'Spearman rho', value: rawScore },
      ],
    };
  }

  const kendallSteps: KendallStep[] = [];
  let concordant = 0;
  let discordant = 0;
  let tieLeft = 0;
  let tieRight = 0;

  for (let leftIndex = 0; leftIndex < comparableValues.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < comparableValues.length; rightIndex += 1) {
      const leftEntry = comparableValues[leftIndex]!;
      const rightEntry = comparableValues[rightIndex]!;
      const leftDiff = (leftEntry.leftWinRate ?? 0) - (rightEntry.leftWinRate ?? 0);
      const rightDiff = (leftEntry.rightWinRate ?? 0) - (rightEntry.rightWinRate ?? 0);

      let outcome: KendallStep['outcome'];
      if (Math.abs(leftDiff) < 1e-9 && Math.abs(rightDiff) < 1e-9) {
        outcome = 'tie-both';
      } else if (Math.abs(leftDiff) < 1e-9) {
        outcome = 'tie-left';
        tieLeft += 1;
      } else if (Math.abs(rightDiff) < 1e-9) {
        outcome = 'tie-right';
        tieRight += 1;
      } else if (leftDiff * rightDiff > 0) {
        outcome = 'concordant';
        concordant += 1;
      } else {
        outcome = 'discordant';
        discordant += 1;
      }

      kendallSteps.push({
        leftValueKey: leftEntry.valueKey,
        rightValueKey: rightEntry.valueKey,
        pairLabel: `${leftEntry.valueLabel} vs ${rightEntry.valueLabel}`,
        leftDiff,
        rightDiff,
        outcome,
      });
    }
  }

  const denominator = Math.sqrt((concordant + discordant + tieLeft) * (concordant + discordant + tieRight));
  const rawScore = denominator === 0 ? null : (concordant - discordant) / denominator;
  const displayScores = buildDisplayScores(rawScore, method);

  return {
    left,
    right,
    method,
    steps: [],
    kendallSteps,
    usedValueCount: comparableValues.length,
    rawScore,
    distance: displayScores.distance,
    similarity: displayScores.similarity,
    summaryLabel: copy.summaryLabel,
    summaryNote: copy.summaryNote,
    summaryRows: [
      { label: 'Concordant pairs', value: concordant },
      { label: 'Discordant pairs', value: discordant },
      { label: 'Tie in left only', value: tieLeft },
      { label: 'Tie in right only', value: tieRight },
      { label: 'Kendall tau-b', value: rawScore },
    ],
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
                        <td className="px-4 py-3 text-right font-mono text-gray-900">{formatPercent(step.leftWinRate)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">{formatPercent(step.rightWinRate)}</td>
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

export function ModelSimilarityTableSection({ models }: ModelSimilarityTableSectionProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [method, setMethod] = useState<CalculationMethod>('weighted-euclidean');
  const [view, setView] = useState<MetricView>('distance');
  const [activePair, setActivePair] = useState<{ left: string; right: string } | null>(null);

  const matrix = useMemo(() => {
    const rows = new Map<string, Map<string, PairMetric | null>>();

    for (const left of models) {
      const row = new Map<string, PairMetric | null>();
      for (const right of models) {
        row.set(right.model, left.model === right.model ? null : computePairMetric(left, right, method));
      }
      rows.set(left.model, row);
    }

    return { rows };
  }, [models, method]);

  const activeMetric = useMemo(() => {
    if (activePair == null) return null;
    const left = models.find((model) => model.model === activePair.left) ?? null;
    const right = models.find((model) => model.model === activePair.right) ?? null;
    if (left == null || right == null) return null;
    return computePairMetric(left, right, method);
  }, [activePair, method, models]);

  const methodCopy = getMethodCopy(method);
  const helpCopy = view === 'distance'
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
          <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
            <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Method</span>
            <div className="inline-flex rounded-md border border-gray-200 bg-white p-1">
              {CALCULATION_METHODS.map((option) => {
                const active = method === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={active ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setMethod(option.value)}
                    className={`rounded-md px-3 py-1 text-xs font-medium min-h-0 ${
                      active ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>

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
          <span>{view === 'distance' ? 'Green = closer' : 'Green = more similar'}</span>
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
                    const intensity = getCellIntensity(metric);
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
                            onClick={() => setActivePair({ left: rowModel.model, right: colModel.model })}
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
        onClose={() => setActivePair(null)}
      />
    </section>
  );
}
