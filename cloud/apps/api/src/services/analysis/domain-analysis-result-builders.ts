import { SCHWARTZ_CIRCULAR_ORDER } from '@valuerank/shared/schwartz';
import type { PairwiseWinRateModel } from '../../graphql/queries/domain/types.js';
import type { DomainAnalysisSnapshotModel } from './domain-analysis-cache-types.js';

export function extractWinRates(snapshotModel: DomainAnalysisSnapshotModel, valueKeys: readonly string[]): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const vk of valueKeys) {
    if (snapshotModel.valueWinRates != null && snapshotModel.valueWinRates[vk] != null) {
      // valueWinRates is stored on a 0–100 scale; normalize to [0, 1]
      result[vk] = (snapshotModel.valueWinRates[vk] ?? 0) / 100;
    } else {
      const counts = snapshotModel.counts[vk];
      if (counts == null) { result[vk] = null; continue; }
      const total = counts.prioritized + counts.deprioritized + counts.neutral;
      result[vk] = total > 0 ? counts.prioritized / total : null;
    }
  }
  return result;
}

export function buildPairwiseWinRateModel(
  pairwiseWins: Record<string, Record<string, number>>,
  pairwiseNeutrals?: Record<string, Record<string, number>>,
): PairwiseWinRateModel {
  const order = [...SCHWARTZ_CIRCULAR_ORDER];
  const n = order.length;
  const winRateMatrix: Array<Array<number | null>> = [];
  const winRateExcNeutralMatrix: Array<Array<number | null>> = [];
  const trialCountMatrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const winRateRow: Array<number | null> = [];
    const excNeutralWinRateRow: Array<number | null> = [];
    const trialRow: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        winRateRow.push(null);
        excNeutralWinRateRow.push(null);
        trialRow.push(0);
        continue;
      }
      const keyI = order[i] as string;
      const keyJ = order[j] as string;
      const winsIJ = pairwiseWins[keyI]?.[keyJ] ?? 0;
      const winsJI = pairwiseWins[keyJ]?.[keyI] ?? 0;
      // Neutrals are stored from the valueA side only: keyI vs keyJ → neutrals[keyI][keyJ] when keyI < keyJ alphabetically is NOT guaranteed,
      // so check both directions and take whichever has data.
      const neutralsIJ = pairwiseNeutrals != null
        ? (pairwiseNeutrals[keyI]?.[keyJ] ?? pairwiseNeutrals[keyJ]?.[keyI] ?? 0)
        : 0;
      const total = winsIJ + winsJI + neutralsIJ;
      winRateRow.push(total > 0 ? winsIJ / total : null);
      const excNeutralTotal = winsIJ + winsJI;
      excNeutralWinRateRow.push(excNeutralTotal > 0 ? winsIJ / excNeutralTotal : null);
      trialRow.push(total);
    }
    winRateMatrix.push(winRateRow);
    winRateExcNeutralMatrix.push(excNeutralWinRateRow);
    trialCountMatrix.push(trialRow);
  }
  return { valueOrder: order, winRateMatrix, winRateExcNeutralMatrix, trialCountMatrix };
}
