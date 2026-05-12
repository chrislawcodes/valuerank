import { type ModelEntry, type ValueKey } from '../../data/domainAnalysisData';

export type DisplayMetric = 'winRate' | 'logit';
const trialCountFormatter = new Intl.NumberFormat('en-US');

export const DISPLAY_METRICS: Array<{ value: DisplayMetric; label: string }> = [
  { value: 'winRate', label: 'Win rate' },
  { value: 'logit', label: 'Logit' },
];

export function getMetricValue(
  model: ModelEntry,
  valueKey: ValueKey,
  metric: DisplayMetric,
  winRateMode: 'all' | 'exc-neutral' = 'all'
): number | null {
  if (metric === 'winRate') {
    if (winRateMode === 'exc-neutral') {
      return model.winRatesExcNeutral?.[valueKey] ?? null;
    }
    return model.winRates?.[valueKey] ?? null;
  }
  return model.values[valueKey] ?? null;
}

export function formatMetricValue(value: number | null, metric: DisplayMetric): string {
  if (value == null) return 'n/a';
  return metric === 'winRate' ? `${value.toFixed(1)}%` : value.toFixed(2);
}

export function formatTrialCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return trialCountFormatter.format(value);
}
