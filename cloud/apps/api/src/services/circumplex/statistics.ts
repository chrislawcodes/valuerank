import { circularDistance, type ValueKey } from '@valuerank/shared/schwartz';
import { spearmanRankCorrelation } from '../statistics/spearman.js';

export type CircumplexFitVerdict =
  | 'clear'
  | 'partial'
  | 'not_evident'
  | 'insufficient_data';

export type CircumplexFitResult = {
  rho: number | null;
  p: number | null;
  determinatePairs: number;
  verdict: CircumplexFitVerdict;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readMatrixValue(matrix: Array<Array<number | null>>, row: number, col: number): number | null {
  const value = matrix[row]?.[col];
  return isFiniteNumber(value) ? value : null;
}

function readTrialCount(matrix: number[][], row: number, col: number): number {
  const value = matrix[row]?.[col];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function pearsonCorrelation(x: Array<number | null>, y: Array<number | null>): number | null {
  if (x.length !== y.length) {
    throw new RangeError('Pearson inputs must have the same length');
  }

  const paired: Array<[number, number]> = [];
  for (let index = 0; index < x.length; index += 1) {
    const left = x[index];
    const right = y[index];
    if (!isFiniteNumber(left) || !isFiniteNumber(right)) {
      continue;
    }
    paired.push([left, right]);
  }

  if (paired.length < 3) {
    return null;
  }

  const xs = paired.map(([left]) => left);
  const ys = paired.map(([, right]) => right);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let index = 0; index < paired.length; index += 1) {
    const [left, right] = paired[index]!;
    const deltaX = left - meanX;
    const deltaY = right - meanY;
    covariance += deltaX * deltaY;
    varianceX += deltaX * deltaX;
    varianceY += deltaY * deltaY;
  }

  if (varianceX <= 1e-12 || varianceY <= 1e-12) {
    return null;
  }

  return covariance / Math.sqrt(varianceX * varianceY);
}

export function valueProfileMatrix(
  pairwiseWinRates: Array<Array<number | null>>,
  pairTrialCounts: number[][],
  excluded: Set<number>,
): Array<Array<number | null>> {
  const size = pairwiseWinRates.length;
  const matrix = Array.from({ length: size }, () => Array<number | null>(size).fill(null));

  for (let index = 0; index < size; index += 1) {
    if (excluded.has(index)) {
      continue;
    }
    matrix[index]![index] = 1;
  }

  for (let i = 0; i < size; i += 1) {
    if (excluded.has(i)) continue;
    for (let j = i + 1; j < size; j += 1) {
      if (excluded.has(j)) continue;

      const x: Array<number | null> = [];
      const y: Array<number | null> = [];

      for (let k = 0; k < size; k += 1) {
        if (k === i || k === j || excluded.has(k)) continue;

        const leftValue = readMatrixValue(pairwiseWinRates, i, k);
        const rightValue = readMatrixValue(pairwiseWinRates, j, k);
        const leftTrials = readTrialCount(pairTrialCounts, i, k);
        const rightTrials = readTrialCount(pairTrialCounts, j, k);
        if (leftTrials <= 0 || rightTrials <= 0) {
          continue;
        }

        x.push(leftValue);
        y.push(rightValue);
      }

      const correlation = pearsonCorrelation(x, y);
      matrix[i]![j] = correlation;
      matrix[j]![i] = correlation;
    }
  }

  return matrix;
}

export function circumplexFit(
  profileMatrix: Array<Array<number | null>>,
  canonicalOrder: readonly ValueKey[],
): CircumplexFitResult {
  const distances: number[] = [];
  const correlations: number[] = [];

  for (let i = 0; i < canonicalOrder.length; i += 1) {
    for (let j = i + 1; j < canonicalOrder.length; j += 1) {
      const value = profileMatrix[i]?.[j];
      if (!isFiniteNumber(value)) {
        continue;
      }
      distances.push(circularDistance(i, j, canonicalOrder.length));
      correlations.push(value);
    }
  }

  if (distances.length < 15 || new Set(correlations.map((value) => value.toFixed(12))).size < 2 || new Set(distances).size < 2) {
    return {
      rho: null,
      p: null,
      determinatePairs: distances.length,
      verdict: 'insufficient_data',
    };
  }

  const { rho, p } = spearmanRankCorrelation(distances, correlations);
  const verdict: CircumplexFitVerdict = rho <= -0.5
    ? 'clear'
    : rho <= -0.2
      ? 'partial'
      : 'not_evident';

  return {
    rho,
    p,
    determinatePairs: distances.length,
    verdict,
  };
}

export { classicalMds2d, anchorMdsRotation } from './mds.js';
