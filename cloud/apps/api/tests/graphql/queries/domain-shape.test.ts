/**
 * Pure unit tests for domain-shape.ts computation helpers.
 * No database access. No server setup required.
 */

import { describe, it, expect } from 'vitest';
import {
  computeRawShapeMetrics,
  computeDomainBenchmarks,
  classifyShape,
  computeRankingShapes,
  type ModelWithSortedScores,
} from '../../../src/graphql/queries/domain-shape.js';

// ---------------------------------------------------------------------------
// computeRawShapeMetrics
// ---------------------------------------------------------------------------

describe('computeRawShapeMetrics', () => {
  it('returns zeros for an empty array', () => {
    const result = computeRawShapeMetrics([]);
    expect(result).toEqual({ topGap: 0, bottomGap: 0, spread: 0, steepness: 0, minScore: 0 });
  });

  it('returns zeros for a single-element array (with minScore = that element)', () => {
    const result = computeRawShapeMetrics([1.5]);
    expect(result.topGap).toBe(0);
    expect(result.bottomGap).toBe(0);
    expect(result.spread).toBe(0);
    expect(result.steepness).toBe(0);
    expect(result.minScore).toBeCloseTo(1.5);
  });

  it('computes correct topGap, bottomGap, spread, minScore for two elements', () => {
    const result = computeRawShapeMetrics([2, 1]);
    expect(result.topGap).toBeCloseTo(1);
    expect(result.bottomGap).toBeCloseTo(1);
    expect(result.spread).toBeCloseTo(1);
    expect(result.minScore).toBeCloseTo(1);
  });

  it('computes topGap and bottomGap independently', () => {
    // [10, 4, 3, 1]: topGap=10-4=6, bottomGap=3-1=2, spread=10-1=9, minScore=1
    const result = computeRawShapeMetrics([10, 4, 3, 1]);
    expect(result.topGap).toBeCloseTo(6);
    expect(result.bottomGap).toBeCloseTo(2);
    expect(result.spread).toBeCloseTo(9);
    expect(result.minScore).toBeCloseTo(1);
  });

  it('captures negative minScore correctly', () => {
    // Last element is negative
    const result = computeRawShapeMetrics([1.5, 0.5, -1.2]);
    expect(result.minScore).toBeCloseTo(-1.2);
  });

  it('computes steepness with linearly-decaying weights', () => {
    // Scores [3, 2, 1]: deltas d[0]=1, d[1]=1, weights w[0]=2, w[1]=1
    // steepness = (2*1 + 1*1) / (2+1) = 3/3 = 1
    const result = computeRawShapeMetrics([3, 2, 1]);
    expect(result.steepness).toBeCloseTo(1);
  });

  it('steepness weights first delta higher than last', () => {
    // Scores [4, 1, 0.9]: d[0]=3, d[1]=0.1, w[0]=2, w[1]=1
    // steepness = (2*3 + 1*0.1) / 3 = 6.1/3 ≈ 2.033
    const result = computeRawShapeMetrics([4, 1, 0.9]);
    expect(result.steepness).toBeCloseTo(6.1 / 3, 4);
  });

  it('handles uniform scores correctly (zero spread and steepness)', () => {
    const result = computeRawShapeMetrics([1, 1, 1, 1]);
    expect(result.topGap).toBeCloseTo(0);
    expect(result.spread).toBeCloseTo(0);
    expect(result.steepness).toBeCloseTo(0);
    expect(result.minScore).toBeCloseTo(1);
  });
});

// ---------------------------------------------------------------------------
// computeDomainBenchmarks
// ---------------------------------------------------------------------------

describe('computeDomainBenchmarks', () => {
  it('returns zero benchmarks for empty array', () => {
    const result = computeDomainBenchmarks([]);
    expect(result).toEqual({ domainMeanTopGap: 0, domainStdTopGap: null, medianSpread: 0 });
  });

  it('returns null domainStdTopGap when fewer than 4 models', () => {
    const raw = [
      { topGap: 1, bottomGap: 0.5, spread: 2, steepness: 0.5, minScore: -0.5 },
      { topGap: 2, bottomGap: 0.5, spread: 3, steepness: 0.7, minScore: -0.3 },
    ];
    const result = computeDomainBenchmarks(raw);
    expect(result.domainStdTopGap).toBeNull();
    expect(result.domainMeanTopGap).toBeCloseTo(1.5);
  });

  it('computes domainMeanTopGap correctly', () => {
    const raw = [
      { topGap: 1, bottomGap: 0, spread: 1, steepness: 0, minScore: 0 },
      { topGap: 3, bottomGap: 0, spread: 3, steepness: 0, minScore: 0 },
      { topGap: 2, bottomGap: 0, spread: 2, steepness: 0, minScore: 0 },
      { topGap: 4, bottomGap: 0, spread: 4, steepness: 0, minScore: 0 },
    ];
    const result = computeDomainBenchmarks(raw);
    expect(result.domainMeanTopGap).toBeCloseTo(2.5);
  });

  it('computes domainStdTopGap when N >= 4', () => {
    // topGaps = [1, 3, 2, 4], mean=2.5
    // variance = ((1-2.5)^2 + (3-2.5)^2 + (2-2.5)^2 + (4-2.5)^2) / 4 = 1.25
    // std = sqrt(1.25) ≈ 1.118
    const raw = [
      { topGap: 1, bottomGap: 0, spread: 1, steepness: 0, minScore: 0 },
      { topGap: 3, bottomGap: 0, spread: 3, steepness: 0, minScore: 0 },
      { topGap: 2, bottomGap: 0, spread: 2, steepness: 0, minScore: 0 },
      { topGap: 4, bottomGap: 0, spread: 4, steepness: 0, minScore: 0 },
    ];
    const result = computeDomainBenchmarks(raw);
    expect(result.domainStdTopGap).toBeCloseTo(Math.sqrt(1.25), 4);
  });

  it('computes median spread for even count', () => {
    // spreads = [1, 2, 3, 4], sorted → median = (2+3)/2 = 2.5
    const raw = [
      { topGap: 0, bottomGap: 0, spread: 3, steepness: 0, minScore: 0 },
      { topGap: 0, bottomGap: 0, spread: 1, steepness: 0, minScore: 0 },
      { topGap: 0, bottomGap: 0, spread: 4, steepness: 0, minScore: 0 },
      { topGap: 0, bottomGap: 0, spread: 2, steepness: 0, minScore: 0 },
    ];
    const result = computeDomainBenchmarks(raw);
    expect(result.medianSpread).toBeCloseTo(2.5);
  });

  it('computes median spread for odd count', () => {
    // spreads = [1, 3, 5], sorted → median = 3
    const raw = [
      { topGap: 0, bottomGap: 0, spread: 5, steepness: 0, minScore: 0 },
      { topGap: 0, bottomGap: 0, spread: 1, steepness: 0, minScore: 0 },
      { topGap: 0, bottomGap: 0, spread: 3, steepness: 0, minScore: 0 },
    ];
    const result = computeDomainBenchmarks(raw);
    expect(result.medianSpread).toBeCloseTo(3);
  });
});

// ---------------------------------------------------------------------------
// classifyShape
// ---------------------------------------------------------------------------

describe('classifyShape', () => {
  const defaultBenchmarks = {
    domainMeanTopGap: 0.3,
    domainStdTopGap: 0.2,
    medianSpread: 1.0,
  };

  // --- Top structure ---

  it('classifies strong_leader when topGap >= 0.28', () => {
    const raw = { topGap: 0.5, bottomGap: 0.1, spread: 1.0, steepness: 0.2, minScore: -0.3 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.topStructure).toBe('strong_leader');
  });

  it('classifies strong_leader at exactly the threshold (0.28)', () => {
    const raw = { topGap: 0.28, bottomGap: 0.1, spread: 1.0, steepness: 0.2, minScore: -0.3 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.topStructure).toBe('strong_leader');
  });

  it('classifies tied_leaders when 0.15 <= topGap < 0.28', () => {
    const raw = { topGap: 0.20, bottomGap: 0.1, spread: 0.8, steepness: 0.1, minScore: -0.3 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.topStructure).toBe('tied_leaders');
  });

  it('classifies tied_leaders at the lower boundary (topGap = 0.15)', () => {
    const raw = { topGap: 0.15, bottomGap: 0.1, spread: 0.5, steepness: 0.05, minScore: -0.2 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.topStructure).toBe('tied_leaders');
  });

  it('classifies even_spread when topGap < 0.15', () => {
    const raw = { topGap: 0.08, bottomGap: 0.05, spread: 0.4, steepness: 0.04, minScore: -0.1 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.topStructure).toBe('even_spread');
  });

  it('classifies even_spread for uniform scores (topGap = 0)', () => {
    const raw = { topGap: 0, bottomGap: 0, spread: 0, steepness: 0, minScore: 1.0 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.topStructure).toBe('even_spread');
  });

  // --- Bottom structure ---

  it('classifies hard_no when minScore < -1.0', () => {
    const raw = { topGap: 0.3, bottomGap: 0.5, spread: 2.0, steepness: 0.2, minScore: -1.5 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.bottomStructure).toBe('hard_no');
  });

  it('classifies hard_no at exactly below -1.0 (minScore = -1.001)', () => {
    const raw = { topGap: 0.3, bottomGap: 0.1, spread: 1.5, steepness: 0.15, minScore: -1.001 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.bottomStructure).toBe('hard_no');
  });

  it('classifies mild_avoidance when -1.0 <= minScore < -0.5', () => {
    const raw = { topGap: 0.3, bottomGap: 0.1, spread: 1.0, steepness: 0.1, minScore: -0.75 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.bottomStructure).toBe('mild_avoidance');
  });

  it('classifies mild_avoidance at exactly minScore = -1.0', () => {
    const raw = { topGap: 0.3, bottomGap: 0.1, spread: 1.5, steepness: 0.15, minScore: -1.0 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.bottomStructure).toBe('mild_avoidance');
  });

  it('classifies no_hard_no at exactly minScore = -0.5 (boundary is exclusive)', () => {
    const raw = { topGap: 0.3, bottomGap: 0.1, spread: 0.8, steepness: 0.08, minScore: -0.5 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.bottomStructure).toBe('no_hard_no');
  });

  it('classifies no_hard_no when minScore > -0.5', () => {
    const raw = { topGap: 0.2, bottomGap: 0.05, spread: 0.5, steepness: 0.05, minScore: -0.2 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.bottomStructure).toBe('no_hard_no');
  });

  it('classifies no_hard_no when all values are positive', () => {
    const raw = { topGap: 0.1, bottomGap: 0.05, spread: 0.5, steepness: 0.05, minScore: 0.1 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.bottomStructure).toBe('no_hard_no');
  });

  // --- Two axes are independent ---

  it('can classify strong_leader + hard_no', () => {
    const raw = { topGap: 0.6, bottomGap: 1.0, spread: 3.0, steepness: 0.5, minScore: -2.0 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.topStructure).toBe('strong_leader');
    expect(result.bottomStructure).toBe('hard_no');
  });

  it('can classify even_spread + no_hard_no', () => {
    const raw = { topGap: 0.05, bottomGap: 0.05, spread: 0.3, steepness: 0.03, minScore: 0.0 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.topStructure).toBe('even_spread');
    expect(result.bottomStructure).toBe('no_hard_no');
  });

  // --- dominanceZScore ---

  it('sets dominanceZScore to null when domainStdTopGap is null', () => {
    const benchmarksNoZ = { domainMeanTopGap: 0.3, domainStdTopGap: null, medianSpread: 1.0 };
    const raw = { topGap: 0.3, bottomGap: 0.1, spread: 0.5, steepness: 0.1, minScore: -0.2 };
    const result = classifyShape(raw, benchmarksNoZ);
    expect(result.dominanceZScore).toBeNull();
  });

  it('sets dominanceZScore to 0 when domainStdTopGap is 0', () => {
    const benchmarksZeroStd = { domainMeanTopGap: 0.3, domainStdTopGap: 0, medianSpread: 1.0 };
    const raw = { topGap: 0.3, bottomGap: 0.1, spread: 0.5, steepness: 0.1, minScore: -0.2 };
    const result = classifyShape(raw, benchmarksZeroStd);
    expect(result.dominanceZScore).toBe(0);
  });

  it('computes dominanceZScore correctly', () => {
    // topGap=0.7, mean=0.3, std=0.2 → z=(0.7-0.3)/0.2=2.0
    const raw = { topGap: 0.7, bottomGap: 0.05, spread: 0.8, steepness: 0.3, minScore: -0.1 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.dominanceZScore).toBeCloseTo(2.0);
  });

  // --- Output includes all raw metrics ---

  it('includes all raw metrics in the output', () => {
    const raw = { topGap: 0.3, bottomGap: 0.1, spread: 0.9, steepness: 0.15, minScore: -0.6 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.topGap).toBeCloseTo(0.3);
    expect(result.bottomGap).toBeCloseTo(0.1);
    expect(result.spread).toBeCloseTo(0.9);
    expect(result.steepness).toBeCloseTo(0.15);
  });
});

// ---------------------------------------------------------------------------
// computeRankingShapes (full pipeline)
// ---------------------------------------------------------------------------

describe('computeRankingShapes', () => {
  it('returns empty shapes and zero benchmarks for empty input', () => {
    const result = computeRankingShapes([]);
    expect(result.shapes.size).toBe(0);
    expect(result.benchmarks).toEqual({ domainMeanTopGap: 0, domainStdTopGap: null, medianSpread: 0 });
  });

  it('returns a shape for each model', () => {
    const models: ModelWithSortedScores[] = [
      { model: 'gpt-4', sortedScores: [1.5, 1.0, 0.8, 0.6, 0.4, 0.3, 0.2, 0.1, 0.05, 0.0] },
      { model: 'claude', sortedScores: [1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3] },
    ];
    const result = computeRankingShapes(models);
    expect(result.shapes.has('gpt-4')).toBe(true);
    expect(result.shapes.has('claude')).toBe(true);
    expect(result.shapes.size).toBe(2);
  });

  it('computes correct benchmarks from all models', () => {
    // gpt-4: topGap = 1.5-1.0 = 0.5; claude: topGap = 1.2-1.1 = 0.1
    // With N=2, domainStdTopGap is null (N < 4)
    const models: ModelWithSortedScores[] = [
      { model: 'gpt-4', sortedScores: [1.5, 1.0, 0.8, 0.6, 0.4, 0.3, 0.2, 0.1, 0.05, 0.0] },
      { model: 'claude', sortedScores: [1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3] },
    ];
    const result = computeRankingShapes(models);
    expect(result.benchmarks.domainMeanTopGap).toBeCloseTo(0.3); // (0.5 + 0.1) / 2
    expect(result.benchmarks.domainStdTopGap).toBeNull();
  });

  it('classifies strong_leader for a model with a large topGap', () => {
    // topGap = 2.0 - 1.0 = 1.0 → strong_leader (>= 0.28)
    const models: ModelWithSortedScores[] = [
      { model: 'dominant', sortedScores: [2.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2] },
    ];
    const result = computeRankingShapes(models);
    expect(result.shapes.get('dominant')?.topStructure).toBe('strong_leader');
  });

  it('classifies hard_no for a model with a strongly negative bottom score', () => {
    // minScore = -1.5 → hard_no (< -1.0)
    const models: ModelWithSortedScores[] = [
      { model: 'm1', sortedScores: [1.5, 1.0, 0.8, 0.6, 0.4, 0.3, 0.2, 0.1, 0.05, -1.5] },
    ];
    const result = computeRankingShapes(models);
    expect(result.shapes.get('m1')?.bottomStructure).toBe('hard_no');
  });

  it('classifies no_hard_no for a model with all positive scores', () => {
    const models: ModelWithSortedScores[] = [
      { model: 'm1', sortedScores: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1] },
    ];
    const result = computeRankingShapes(models);
    expect(result.shapes.get('m1')?.bottomStructure).toBe('no_hard_no');
  });

  it('topStructure is one of the three valid values', () => {
    const models: ModelWithSortedScores[] = [
      { model: 'm1', sortedScores: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1] },
    ];
    const result = computeRankingShapes(models);
    const topStructure = result.shapes.get('m1')?.topStructure;
    expect(['strong_leader', 'tied_leaders', 'even_spread']).toContain(topStructure);
  });

  it('bottomStructure is one of the three valid values', () => {
    const models: ModelWithSortedScores[] = [
      { model: 'm1', sortedScores: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1] },
    ];
    const result = computeRankingShapes(models);
    const bottomStructure = result.shapes.get('m1')?.bottomStructure;
    expect(['hard_no', 'mild_avoidance', 'no_hard_no']).toContain(bottomStructure);
  });
});
