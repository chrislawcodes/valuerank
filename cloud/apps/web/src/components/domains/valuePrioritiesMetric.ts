import { type ModelEntry, type ValueKey } from '../../data/domainAnalysisData';

export type DisplayMetric = 'winRate' | 'logit';

export const DISPLAY_METRICS: Array<{ value: DisplayMetric; label: string }> = [
  { value: 'winRate', label: 'Win rate' },
  { value: 'logit', label: 'Logit' },
];

export function getMetricValue(
  model: ModelEntry,
  valueKey: ValueKey,
  metric: DisplayMetric
): number | null {
  return metric === 'winRate' ? (model.winRates?.[valueKey] ?? null) : model.values[valueKey];
}

export function formatMetricValue(value: number | null, metric: DisplayMetric): string {
  if (value == null) return 'n/a';
  return metric === 'winRate' ? `${value.toFixed(1)}%` : value.toFixed(2);
}
