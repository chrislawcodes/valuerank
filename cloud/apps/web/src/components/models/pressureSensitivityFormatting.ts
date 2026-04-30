/**
 * Shared formatting / classification helpers for the Pressure Sensitivity
 * cross-model summary and per-pair detail tables.
 */

export const SUMMARY_PRESSURE_RESPONSE_TOOLTIP =
  "Arithmetic mean of per-pair pressure responses across this model's measured pairs. The range in brackets is the spread of per-pair values. Positive = more trials pushed toward the model's own value; negative = more trials pushed away.";

export const PAIR_PRESSURE_RESPONSE_TOOLTIP =
  'Signed push-rate difference: Push toward first minus Push toward other, in percentage points. The CI is the Newcombe 95% confidence interval for the difference of two proportions.';

export const BASELINE_TOOLTIP =
  'Win rate when own and opponent pressure are both at moderate levels. Used as the reference for the push columns.';

export const PUSH_TOWARD_FIRST_TOOLTIP =
  "Win rate when the first value's pressure is high (levels 4–5) and the other value's pressure is moderate. A higher rate means the model picks the first value more under pressure.";

export const PUSH_TOWARD_OTHER_TOOLTIP =
  "Win rate when the other value's pressure is high (levels 4–5) and the first value's pressure is moderate. A higher rate means the model picks the other value more under pressure.";

export const TRIALS_TOOLTIP =
  'Qualifying scored trials that contributed to the Baseline, Push toward first, and Push toward other rates. These are the trials used to compute the Pressure response and its confidence interval.';

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Unsigned percentage-points string, one decimal place. */
export function formatPoints(value: number): string {
  return `${Math.abs(value * 100).toFixed(1)} pp`;
}

/**
 * Signed percentage-points string, one decimal place.
 * Exact zero renders without a sign per spec FR-xxx.
 */
export function formatSignedPoints(value: number): string {
  const pp = value * 100;
  if (pp === 0) return '0.0 pp';
  const sign = pp < 0 ? '−' : '+';
  return `${sign}${Math.abs(pp).toFixed(1)} pp`;
}

/**
 * Ceiling/floor badge classification per spec FR-007.
 * Returns null when no badge should attach (including when the cell
 * value is null/undefined per FR-007a).
 */
export function getBadgeFlag(value: number | null | undefined): 'ceiling' | 'floor' | null {
  if (value == null) return null;
  if (value >= 0.9) return 'ceiling';
  if (value <= 0.1) return 'floor';
  return null;
}

/**
 * Map an undefined pressure-response reason code to the user-facing hover explanation.
 */
export function reasonHoverText(reason: string | null | undefined): string {
  if (reason === 'directional-thin') {
    return 'The push-toward-first pool has no qualifying cells (N ≥ 3). Add more trials where own pressure is high and opponent pressure is moderate.';
  }
  if (reason === 'inverted-thin') {
    return 'The push-toward-other pool has no qualifying cells (N ≥ 3). Add more trials where opponent pressure is high and own pressure is moderate.';
  }
  if (reason === 'directional-and-inverted-thin') {
    return 'Neither direction pool has qualifying cells. This pair needs more coverage to compute a pressure response.';
  }
  if (reason === 'baseline-thin') {
    return 'Pressure response is defined but the baseline pool has no qualifying cells.';
  }
  return '';
}
