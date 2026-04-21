import { db } from '@valuerank/db';
import { SCHWARTZ_CIRCULAR_ORDER, theoreticalAngleDeg } from '@valuerank/shared/schwartz';
import { builder } from '../builder.js';
import {
  CircumplexAnalysisResultRef,
  type CircumplexAnalysisResultShape,
  type CircumplexInsufficientModelShape,
  type CircumplexMdsCoordShape,
  type CircumplexResultShape,
} from '../types/circumplex.js';
import { aggregatePairwiseWinRates, type CircumplexPairMatrix } from '../../services/circumplex/aggregation.js';
import { classicalMds2d, circumplexFit, valueProfileMatrix } from '../../services/circumplex/statistics.js';
import { anchorMdsRotation } from '../../services/circumplex/mds.js';
import { classifyEligibility } from '../../services/circumplex/eligibility.js';

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

  // Exclusion rule (revised from the earlier "single-strike" version flagged
  // in diff review). A value is excluded if EITHER:
  //   (a) fewer than 6 of its 9 pair cells are determinate (have a
  //       computable win rate and at least one trial), OR
  //   (b) fewer than 4 of its 9 pair cells have at least 20 trials.
  // Rule (a) is the minimum for a stable Pearson correlation. Rule (b)
  // prevents a single low-trial cell from killing an otherwise well-
  // covered value, while still requiring that most of the profile has
  // enough statistical weight to matter.
  const MIN_DETERMINATE_CELLS = 6;
  const MIN_HIGH_TRIAL_CELLS = 4;
  const HIGH_TRIAL_THRESHOLD = 20;

  for (let rowIndex = 0; rowIndex < SCHWARTZ_CIRCULAR_ORDER.length; rowIndex += 1) {
    let determinate = 0;
    let highTrialCells = 0;

    for (let colIndex = 0; colIndex < SCHWARTZ_CIRCULAR_ORDER.length; colIndex += 1) {
      if (rowIndex === colIndex) continue;
      const cell = pairwise[rowIndex]?.[colIndex];
      if (cell == null || cell.trials <= 0 || cell.winRate == null) {
        continue;
      }
      determinate += 1;
      if (cell.trials >= HIGH_TRIAL_THRESHOLD) {
        highTrialCells += 1;
      }
    }

    if (determinate < MIN_DETERMINATE_CELLS || highTrialCells < MIN_HIGH_TRIAL_CELLS) {
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
  // Rotate so the first included value in canonical order (default: Self-Direction)
  // sits at 12 o'clock. Without this, the MDS output rotates/flips arbitrarily
  // from run to run, making the theoretical-angle overlay meaningless.
  const rotatedCoords = anchorMdsRotation(mds.coords, SCHWARTZ_CIRCULAR_ORDER);

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
    mds2d: buildMdsCoords(rotatedCoords),
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
      const eligible: CircumplexResultShape[] = [];
      const insufficient: CircumplexInsufficientModelShape[] = [];

      for (const modelId of modelIds) {
        const pairwise = pairwiseMap.get(modelId) ?? createEmptyPairwiseMatrix();
        const model = modelById.get(modelId);
        const modelLabel = model?.displayName ?? model?.modelId ?? modelId;
        const providerName = model?.provider.displayName ?? model?.provider.name ?? 'Unknown provider';

        const eligibility = classifyEligibility({
          model: { modelId, modelLabel, providerName },
          pairwise,
          minTrialsPerValue,
        });

        if (eligibility.status === 'eligible') {
          eligible.push(buildResult(modelId, model, signature, pairwise));
        } else {
          insufficient.push({
            modelId,
            modelLabel,
            providerName,
            reason: eligibility.reason ?? 'below_threshold',
            trialsPerValue: eligibility.trialsPerValue.map((entry) => ({
              valueKey: entry.valueKey,
              trials: entry.trials,
            })),
          });
        }
      }

      // Alphabetical stable sort per spec FR-011a.
      eligible.sort((a, b) => a.modelLabel.localeCompare(b.modelLabel));
      insufficient.sort((a, b) => a.modelLabel.localeCompare(b.modelLabel));

      return {
        signature,
        models: eligible,
        insufficient,
        eligibilityThreshold: minTrialsPerValue,
      };
    },
  }),
);
