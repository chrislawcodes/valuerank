import { SCHWARTZ_CATEGORIES, SCHWARTZ_CATEGORY_ORDER } from './pvq-questions.js';

export type ParsedTrial = {
  modelId: string;
  displayName: string;
  scores: Record<string, number | null>;
  refused: boolean;
};

export type ModelScore = {
  modelId: string;
  mean: number | null;
  trialCount: number;
  refusedCount: number;
};

export type PvqCategoryResult = {
  name: string;
  scores: ModelScore[];
};

export type AggregatedResults = {
  models: { modelId: string; displayName: string }[];
  categories: PvqCategoryResult[];
};

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function getDisplayName(modelTrials: ParsedTrial[], modelId: string): string {
  for (const trial of modelTrials) {
    if (trial.displayName.trim() !== '') {
      return trial.displayName;
    }
  }
  return modelId;
}

export function computeSchwartzAverages(trials: ParsedTrial[]): AggregatedResults {
  const grouped = new Map<string, ParsedTrial[]>();
  for (const trial of trials) {
    const existing = grouped.get(trial.modelId);
    if (existing === undefined) {
      grouped.set(trial.modelId, [trial]);
    } else {
      existing.push(trial);
    }
  }

  const modelEntries = Array.from(grouped.entries())
    .map(([modelId, modelTrials]) => {
      const refusedCount = modelTrials.filter((trial) => trial.refused).length;
      const cleanTrials = modelTrials.filter((trial) => trial.refused === false);
      return {
        modelId,
        displayName: getDisplayName(modelTrials, modelId),
        refusedCount,
        cleanTrials,
      };
    })
    .filter((entry) => entry.cleanTrials.length > 0)
    .sort((left, right) => {
      const byName = left.displayName.localeCompare(right.displayName);
      if (byName !== 0) {
        return byName;
      }
      return left.modelId.localeCompare(right.modelId);
    });

  const models = modelEntries.map((entry) => ({
    modelId: entry.modelId,
    displayName: entry.displayName,
  }));

  const categories = SCHWARTZ_CATEGORY_ORDER.map((categoryName) => {
    const questionIds = SCHWARTZ_CATEGORIES[categoryName] ?? [];
    const scores = modelEntries.map((entry) => {
      const trialMeans = entry.cleanTrials.map((trial) => {
        const categoryScores = questionIds.map((questionId) => trial.scores[questionId]);
        if (categoryScores.some((value) => typeof value !== 'number')) {
          return null;
        }

        const total = categoryScores.reduce<number>((sum, value) => sum + (value as number), 0);
        return total / questionIds.length;
      });
      const categoryMean = mean(trialMeans.filter((value): value is number => value !== null));

      return {
        modelId: entry.modelId,
        mean: categoryMean,
        trialCount: entry.cleanTrials.length,
        refusedCount: entry.refusedCount,
      };
    });

    return {
      name: categoryName,
      scores,
    };
  });

  return {
    models,
    categories,
  };
}
