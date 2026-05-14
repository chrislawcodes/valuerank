import { describe, expect, it } from 'vitest';
import { computeSchwartzAverages, type ParsedTrial } from './pvq-aggregator.js';

function makeScores(value: number): Record<string, number | null> {
  const scores: Record<string, number | null> = {};
  for (let questionNumber = 1; questionNumber <= 40; questionNumber += 1) {
    scores[`q${questionNumber}`] = value;
  }
  return scores;
}

function makeTrial(modelId: string, displayName: string, value: number, refused = false): ParsedTrial {
  return {
    modelId,
    displayName,
    scores: makeScores(value),
    refused,
  };
}

describe('computeSchwartzAverages', () => {
  it('computes category means for two clean models', () => {
    const result = computeSchwartzAverages([
      makeTrial('model-a', 'Alpha', 2),
      makeTrial('model-b', 'Beta', 5),
    ]);

    expect(result.models).toEqual([
      { modelId: 'model-a', displayName: 'Alpha' },
      { modelId: 'model-b', displayName: 'Beta' },
    ]);

    for (const category of result.categories) {
      expect(category.scores).toEqual([
        { modelId: 'model-a', mean: 2, trialCount: 1, refusedCount: 0 },
        { modelId: 'model-b', mean: 5, trialCount: 1, refusedCount: 0 },
      ]);
    }
  });

  it('counts refused trials and averages only clean trials', () => {
    const result = computeSchwartzAverages([
      makeTrial('model-a', 'Alpha', 4),
      makeTrial('model-a', 'Alpha', 1, true),
    ]);

    expect(result.models).toEqual([{ modelId: 'model-a', displayName: 'Alpha' }]);
    for (const category of result.categories) {
      expect(category.scores).toEqual([
        { modelId: 'model-a', mean: 4, trialCount: 1, refusedCount: 1 },
      ]);
    }
  });

  it('excludes models where every trial was refused', () => {
    const result = computeSchwartzAverages([
      makeTrial('model-a', 'Alpha', 4, true),
      makeTrial('model-b', 'Beta', 3),
    ]);

    expect(result.models).toEqual([{ modelId: 'model-b', displayName: 'Beta' }]);
    for (const category of result.categories) {
      expect(category.scores).toEqual([
        { modelId: 'model-b', mean: 3, trialCount: 1, refusedCount: 0 },
      ]);
    }
  });

  it('returns the single-trial score for each category', () => {
    const result = computeSchwartzAverages([
      makeTrial('model-a', 'Alpha', 6),
    ]);

    expect(result.models).toEqual([{ modelId: 'model-a', displayName: 'Alpha' }]);
    for (const category of result.categories) {
      expect(category.scores).toEqual([
        { modelId: 'model-a', mean: 6, trialCount: 1, refusedCount: 0 },
      ]);
    }
  });

  it('keeps only the clean model in a mixed result set', () => {
    const result = computeSchwartzAverages([
      makeTrial('model-a', 'Alpha', 2, true),
      makeTrial('model-b', 'Beta', 4),
    ]);

    expect(result.models).toEqual([{ modelId: 'model-b', displayName: 'Beta' }]);
    for (const category of result.categories) {
      expect(category.scores).toEqual([
        { modelId: 'model-b', mean: 4, trialCount: 1, refusedCount: 0 },
      ]);
    }
  });
});
