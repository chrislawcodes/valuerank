import { db } from '@valuerank/db';
import { SCHWARTZ_CIRCULAR_ORDER, theoreticalAngleDeg } from '@valuerank/shared/schwartz';
import { builder } from '../builder.js';
import {
  CircumplexAnalysisResultRef,
  type CircumplexAnalysisResultShape,
  type CircumplexMdsCoordShape,
  type CircumplexResultShape,
} from '../types/circumplex.js';
import { aggregatePairwiseWinRates, type CircumplexPairMatrix } from '../../services/circumplex/aggregation.js';
import { classicalMds2d, circumplexFit, valueProfileMatrix } from '../../services/circumplex/statistics.js';

type ModelRow = {
  id: string;
  modelId: string;
  displayName: string;
  provider: {
    displayName: string;
    name: string;
  };
};

function createEmptyPairwiseMatrix(): CircumplexPairMatrix {
  return SCHWARTZ_CIRCULAR_ORDER.map(() =>
    SCHWARTZ_CIRCULAR_ORDER.map(() => ({ winRate: null, trials: 0, neutrals: 0 })));
}

function pairwiseToWinRateMatrix(pairwise: CircumplexPairMatrix): Array<Array<number | null>> {
  return pairwise.map((row) => row.map((cell) => cell.winRate));
}

function pairwiseToTrialMatrix(pairwise: CircumplexPairMatrix): number[][] {
  return pairwise.map((row) => row.map((cell) => cell.trials));
}

function computeExcludedIndices(pairwise: CircumplexPairMatrix): Set<number> {
  const excluded = new Set<number>();

  for (let rowIndex = 0; rowIndex < SCHWARTZ_CIRCULAR_ORDER.length; rowIndex += 1) {
    let determinate = 0;
    let hasLowTrialCell = false;

    for (let colIndex = 0; colIndex < SCHWARTZ_CIRCULAR_ORDER.length; colIndex += 1) {
      if (rowIndex === colIndex) continue;
      const cell = pairwise[rowIndex]?.[colIndex];
      if (cell == null || cell.trials <= 0 || cell.winRate == null) {
        continue;
      }
      determinate += 1;
      if (cell.trials < 20) {
        hasLowTrialCell = true;
      }
    }

    if (determinate < 6 || hasLowTrialCell) {
      excluded.add(rowIndex);
    }
  }

  return excluded;
}

function buildTrialsPerValue(pairwise: CircumplexPairMatrix) {
  return SCHWARTZ_CIRCULAR_ORDER.map((valueKey, rowIndex) => ({
    valueKey,
    trials: pairwise[rowIndex]?.reduce((sum, cell, colIndex) => (
      rowIndex === colIndex ? sum : sum + cell.trials
    ), 0) ?? 0,
  }));
}

function buildMdsCoords(coords: Array<{ x: number; y: number } | null>): CircumplexMdsCoordShape[] {
  return coords.flatMap((point, index) => {
    if (point == null) return [];
    return [{
      valueKey: SCHWARTZ_CIRCULAR_ORDER[index]!,
      x: point.x,
      y: point.y,
      theoreticalAngleDeg: theoreticalAngleDeg(index),
    }];
  });
}

function buildResult(
  modelId: string,
  model: ModelRow | undefined,
  signature: string,
  pairwise: CircumplexPairMatrix,
): CircumplexResultShape {
  const winRateMatrix = pairwiseToWinRateMatrix(pairwise);
  const trialMatrix = pairwiseToTrialMatrix(pairwise);
  const excludedIndices = computeExcludedIndices(pairwise);
  const profileCorrelationMatrix = valueProfileMatrix(winRateMatrix, trialMatrix, excludedIndices);
  const fit = circumplexFit(profileCorrelationMatrix, SCHWARTZ_CIRCULAR_ORDER);
  const distanceMatrix = profileCorrelationMatrix.map((row) => row.map((value) => (value == null ? null : 1 - value)));
  const mds = classicalMds2d(distanceMatrix);

  return {
    modelId,
    modelLabel: model?.displayName ?? model?.modelId ?? modelId,
    providerName: model?.provider.displayName ?? model?.provider.name ?? 'Unknown provider',
    signature,
    valueOrder: [...SCHWARTZ_CIRCULAR_ORDER],
    profileCorrelationMatrix,
    pairTrialCounts: trialMatrix,
    excludedValues: SCHWARTZ_CIRCULAR_ORDER.filter((_valueKey, index) => excludedIndices.has(index)),
    spearmanRho: fit.rho,
    spearmanP: fit.p,
    verdictBand: fit.verdict,
    mds2d: buildMdsCoords(mds.coords),
    mdsStress: mds.stress,
    mdsWarning: mds.warning,
    trialsPerValue: buildTrialsPerValue(pairwise),
  };
}

builder.queryField('circumplexAnalysis', (t) =>
  t.field({
    type: CircumplexAnalysisResultRef,
    args: {
      modelIds: t.arg.stringList({ required: true }),
      signature: t.arg.string({ required: true }),
      minTrialsPerValue: t.arg.int({ required: false }),
    },
    resolve: async (_root, args): Promise<CircumplexAnalysisResultShape> => {
      const signature = String(args.signature);
      const modelIds = [...new Set(args.modelIds.filter((modelId) => modelId != null && modelId !== ''))];
      const minTrialsPerValue = args.minTrialsPerValue ?? 5;

      if (modelIds.length === 0) {
        return {
          signature,
          models: [],
          insufficient: [],
          eligibilityThreshold: minTrialsPerValue,
        };
      }

      const [models, pairwiseMap] = await Promise.all([
        db.llmModel.findMany({
          where: { id: { in: modelIds } },
          include: { provider: true },
        }) as Promise<ModelRow[]>,
        aggregatePairwiseWinRates({ modelIds, signature }),
      ]);

      const modelById = new Map(models.map((model) => [model.id, model] as const));
      const results = modelIds.map((modelId) => {
        const pairwise = pairwiseMap.get(modelId) ?? createEmptyPairwiseMatrix();
        return buildResult(modelId, modelById.get(modelId), signature, pairwise);
      });

      return {
        signature,
        models: results,
        insufficient: [],
        eligibilityThreshold: minTrialsPerValue,
      };
    },
  }),
);
