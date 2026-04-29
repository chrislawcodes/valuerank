/**
 * Shared formatting / classification helpers for the Pressure Sensitivity
 * cross-model summary and per-pair detail tables. Extracted to one place
 * so tooltip copy, percentage rendering, and ceiling/floor logic stay in
 * sync between PressureSensitivitySummary.tsx and PressureSensitivityDetail.tsx.
 */

export const GROUP_TOOLTIP =
  'The percentage of trials where the model picked the value. Same formula as the win rate shown elsewhere in ValueRank: picks / (picks + non-picks + neutrals). Higher = the model picks it more often.';

export const LOW_TOOLTIP =
  "The model's win rate when pressure on this value is light (levels 1 or 2 out of 5).";

export const HIGH_TOOLTIP =
  "The model's win rate when pressure on this value is heavy (levels 4 or 5 out of 5).";

export const SUMMARY_DELTA_TOOLTIP =
  "How much the win rate changes from light pressure to heavy pressure, in percentage points. Light pressure = own pressure level 1 or 2 on this value. Heavy pressure = level 4 or 5. Level 3 is excluded so the Δ reflects the biggest contrast in the data. The CI is the spread of per-pair Δs across this model's measured value pairs.";

export const PAIR_DELTA_TOOLTIP =
  'How much the win rate changes from light pressure to heavy pressure for this pair, in percentage points. The CI is trial-level uncertainty within the pair (Wilson-propagated diff-of-proportions).';

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/**
 * Format a Δ magnitude as percentage points. Falls back to one decimal
 * place when the rounded integer would be 0 — keeps small but real
 * effects from collapsing into "0 pp".
 */
export function formatPoints(value: number): string {
  const pp = Math.abs(value * 100);
  if (pp < 1 && pp > 0) {
    return `${pp.toFixed(1)} pp`;
  }
  return `${pp.toFixed(0)} pp`;
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
 * Map an undefined-Δ reason code to the user-facing hover explanation
 * per spec FR-008.
 */
export function reasonHoverText(reason: string | null | undefined): string {
  if (reason === 'low-band-thin') {
    return 'Low pressure band has no cells with N ≥ 3 trials. Try adding more low-pressure runs.';
  }
  if (reason === 'high-band-thin') {
    return 'High pressure band has no cells with N ≥ 3 trials. Try adding more high-pressure runs.';
  }
  if (reason === 'both-bands-thin') {
    return 'Neither pressure band has cells with N ≥ 3 trials. This pair needs more coverage to compute a Δ.';
  }
  return '';
}
