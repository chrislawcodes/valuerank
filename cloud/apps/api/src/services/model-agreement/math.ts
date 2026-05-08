export const MIN_TRIALS_FOR_CONSISTENCY = 2;
export const KAPPA_TIE_EPSILON = 1e-9;

/** True when proportionA is within KAPPA_TIE_EPSILON of 0.5 (exact ties + floating-point drift). */
export function isTied(proportionA: number): boolean {
  return Math.abs(proportionA - 0.5) < KAPPA_TIE_EPSILON;
}

function assertProbability(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be within [0, 1]`);
  }
}

/**
 * Cohen's kappa from observed and chance agreement rates.
 * Returns null when chanceAgreement === 1 (degenerate — both raters always agreed by marginal chance).
 * Throws if inputs are outside [0, 1] (defensive — these come from internal computation).
 */
export function cohensKappa(observedAgreement: number, chanceAgreement: number): number | null {
  assertProbability(observedAgreement, 'observedAgreement');
  assertProbability(chanceAgreement, 'chanceAgreement');

  if (chanceAgreement === 1) {
    return null;
  }

  return (observedAgreement - chanceAgreement) / (1 - chanceAgreement);
}

/**
 * Maps a kappa value to a Landis-Koch interpretation label.
 * Returns null when kappa is null.
 */
export type KappaLabel =
  | 'Poor (worse than chance)'
  | 'Slight'
  | 'Fair'
  | 'Moderate'
  | 'Substantial'
  | 'Near-perfect';

export function kappaInterpretation(kappa: number | null): KappaLabel | null {
  if (kappa == null) {
    return null;
  }

  if (kappa < 0) {
    return 'Poor (worse than chance)';
  }
  if (kappa < 0.2) {
    return 'Slight';
  }
  if (kappa < 0.4) {
    return 'Fair';
  }
  if (kappa < 0.6) {
    return 'Moderate';
  }
  if (kappa < 0.8) {
    return 'Substantial';
  }
  return 'Near-perfect';
}

/**
 * Percent agreement = matchedCells / totalCells. Returns null when totalCells === 0.
 */
export function percentAgreement(matchedCells: number, totalCells: number): number | null {
  if (!Number.isFinite(matchedCells) || !Number.isFinite(totalCells) || matchedCells < 0 || totalCells < 0) {
    throw new RangeError('matchedCells and totalCells must be finite, non-negative numbers');
  }

  if (totalCells === 0) {
    return null;
  }

  if (matchedCells > totalCells) {
    throw new RangeError('matchedCells cannot exceed totalCells');
  }

  return matchedCells / totalCells;
}

/**
 * Equal-weight aggregation: mean over vignettes of mean over cells within each vignette.
 * Outer array = vignettes; inner array = per-cell values within that vignette.
 * Returns null when every vignette is empty (or array is empty).
 */
export function equalWeightAggregate(perVignetteValues: ReadonlyArray<ReadonlyArray<number>>): number | null {
  let vignetteTotal = 0;
  let vignetteCount = 0;

  for (const values of perVignetteValues) {
    if (values.length === 0) {
      continue;
    }

    let cellTotal = 0;
    for (const value of values) {
      cellTotal += value;
    }

    vignetteTotal += cellTotal / values.length;
    vignetteCount += 1;
  }

  if (vignetteCount === 0) {
    return null;
  }

  return vignetteTotal / vignetteCount;
}
