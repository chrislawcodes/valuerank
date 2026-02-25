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
  it('returns zeros for a single-element array', () => {
    const result = computeRawShapeMetrics([1.5]);
    expect(result).toEqual({ topGap: 0, bottomGap: 0, spread: 0, steepness: 0 });
  });

  it('returns zeros for an empty array', () => {
    const result = computeRawShapeMetrics([]);
    expect(result).toEqual({ topGap: 0, bottomGap: 0, spread: 0, steepness: 0 });
  });

  it('computes correct topGap, bottomGap, spread for two elements', () => {
    // [2, 1]: topGap = 2-1=1, bottomGap = 2-1=1 (n-2=0, n-1=1 → s[0]-s[1]=1), spread=1
    const result = computeRawShapeMetrics([2, 1]);
    expect(result.topGap).toBeCloseTo(1);
    expect(result.bottomGap).toBeCloseTo(1);
    expect(result.spread).toBeCloseTo(1);
  });

  it('computes topGap and bottomGap independently', () => {
    // [10, 4, 3, 1]: topGap=10-4=6, bottomGap=3-1=2, spread=10-1=9
    const result = computeRawShapeMetrics([10, 4, 3, 1]);
    expect(result.topGap).toBeCloseTo(6);
    expect(result.bottomGap).toBeCloseTo(2);
    expect(result.spread).toBeCloseTo(9);
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
      { topGap: 1, bottomGap: 0.5, spread: 2, steepness: 0.5 },
      { topGap: 2, bottomGap: 0.5, spread: 3, steepness: 0.7 },
    ];
    const result = computeDomainBenchmarks(raw);
    expect(result.domainStdTopGap).toBeNull();
    expect(result.domainMeanTopGap).toBeCloseTo(1.5);
  });

  it('computes domainMeanTopGap correctly', () => {
    const raw = [
      { topGap: 1, bottomGap: 0, spread: 1, steepness: 0 },
      { topGap: 3, bottomGap: 0, spread: 3, steepness: 0 },
      { topGap: 2, bottomGap: 0, spread: 2, steepness: 0 },
      { topGap: 4, bottomGap: 0, spread: 4, steepness: 0 },
    ];
    const result = computeDomainBenchmarks(raw);
    expect(result.domainMeanTopGap).toBeCloseTo(2.5);
  });

  it('computes domainStdTopGap when N >= 4', () => {
    // topGaps = [1, 3, 2, 4], mean=2.5
    // variance = ((1-2.5)^2 + (3-2.5)^2 + (2-2.5)^2 + (4-2.5)^2) / 4
    //          = (2.25 + 0.25 + 0.25 + 2.25) / 4 = 5/4 = 1.25
    // std = sqrt(1.25) ≈ 1.118
    const raw = [
      { topGap: 1, bottomGap: 0, spread: 1, steepness: 0 },
      { topGap: 3, bottomGap: 0, spread: 3, steepness: 0 },
      { topGap: 2, bottomGap: 0, spread: 2, steepness: 0 },
      { topGap: 4, bottomGap: 0, spread: 4, steepness: 0 },
    ];
    const result = computeDomainBenchmarks(raw);
    expect(result.domainStdTopGap).toBeCloseTo(Math.sqrt(1.25), 4);
  });

  it('computes median spread for even count', () => {
    // spreads = [1, 2, 3, 4], sorted → median = (2+3)/2 = 2.5
    const raw = [
      { topGap: 0, bottomGap: 0, spread: 3, steepness: 0 },
      { topGap: 0, bottomGap: 0, spread: 1, steepness: 0 },
      { topGap: 0, bottomGap: 0, spread: 4, steepness: 0 },
      { topGap: 0, bottomGap: 0, spread: 2, steepness: 0 },
    ];
    const result = computeDomainBenchmarks(raw);
    expect(result.medianSpread).toBeCloseTo(2.5);
  });

  it('computes median spread for odd count', () => {
    // spreads = [1, 3, 5], sorted → median = 3
    const raw = [
      { topGap: 0, bottomGap: 0, spread: 5, steepness: 0 },
      { topGap: 0, bottomGap: 0, spread: 1, steepness: 0 },
      { topGap: 0, bottomGap: 0, spread: 3, steepness: 0 },
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

  it('classifies bimodal: large top and bottom gaps each > 40% of spread', () => {
    // spread=1.0, topGap=0.45, bottomGap=0.45 → each > 0.4*1.0=0.4 and spread > 0.3
    const raw = { topGap: 0.45, bottomGap: 0.45, spread: 1.0, steepness: 0.2 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.label).toBe('bimodal');
  });

  it('bimodal requires spread > BIMODAL_MIN_SPREAD=0.3', () => {
    // spread=0.2 → below min, should NOT classify as bimodal
    const raw = { topGap: 0.1, bottomGap: 0.1, spread: 0.2, steepness: 0.05 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.label).not.toBe('bimodal');
  });

  it('classifies dominant_leader via z-score > 1.5', () => {
    // topGap = mean + 2*std = 0.3 + 2*0.2 = 0.7 → z = (0.7-0.3)/0.2 = 2.0 > 1.5
    const raw = { topGap: 0.7, bottomGap: 0.05, spread: 0.8, steepness: 0.3 };
    // spread=0.8 > 0.3 but topGap=0.7 and bottomGap=0.05; 0.05 < 0.4*0.8=0.32 → not bimodal
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.label).toBe('dominant_leader');
  });

  it('classifies dominant_leader via abs threshold when N < 4 (no z-score)', () => {
    // no z-score when domainStdTopGap is null, fallback: topGap > 0.5
    const benchmarksNoZ = { domainMeanTopGap: 0.3, domainStdTopGap: null, medianSpread: 1.0 };
    const raw = { topGap: 0.6, bottomGap: 0.05, spread: 0.7, steepness: 0.3 };
    const result = classifyShape(raw, benchmarksNoZ);
    expect(result.label).toBe('dominant_leader');
  });

  it('classifies no_clear_leader via z-score < -0.5 and spread < medianSpread', () => {
    // topGap = mean - 1*std = 0.3 - 0.2 = 0.1 → z = (0.1-0.3)/0.2 = -1.0 < -0.5, spread=0.5 < 1.0
    const raw = { topGap: 0.1, bottomGap: 0.05, spread: 0.5, steepness: 0.05 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.label).toBe('no_clear_leader');
  });

  it('classifies no_clear_leader via abs thresholds when no z-score', () => {
    const benchmarksNoZ = { domainMeanTopGap: 0.3, domainStdTopGap: null, medianSpread: 1.0 };
    // topGap=0.05 < 0.1, spread=0.3 < 0.4
    const raw = { topGap: 0.05, bottomGap: 0.02, spread: 0.3, steepness: 0.02 };
    const result = classifyShape(raw, benchmarksNoZ);
    expect(result.label).toBe('no_clear_leader');
  });

  it('defaults to gradual_slope when no other label applies', () => {
    // z-score near 0, spread near median → falls through to default
    const raw = { topGap: 0.3, bottomGap: 0.05, spread: 0.9, steepness: 0.1 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.label).toBe('gradual_slope');
  });

  it('bimodal takes precedence over dominant_leader', () => {
    // High topGap satisfies dominant_leader but bimodal check comes first
    // topGap=0.7, bottomGap=0.45, spread=1.2, topGap/spread=0.583>0.4, bottomGap/spread=0.375<0.4 → NOT bimodal
    // Let's use: topGap=0.6, bottomGap=0.55, spread=1.2 → topGap/spread=0.5>0.4, bottom/spread=0.458>0.4 → bimodal
    const raw = { topGap: 0.6, bottomGap: 0.55, spread: 1.2, steepness: 0.3 };
    const result = classifyShape(raw, defaultBenchmarks);
    expect(result.label).toBe('bimodal');
  });

  it('sets dominanceZScore to null when domainStdTopGap is null', () => {
    const benchmarksNoZ = { domainMeanTopGap: 0.3, domainStdTopGap: null, medianSpread: 1.0 };
    const raw = { topGap: 0.3, bottomGap: 0.1, spread: 0.5, steepness: 0.1 };
    const result = classifyShape(raw, benchmarksNoZ);
    expect(result.dominanceZScore).toBeNull();
  });

  it('sets dominanceZScore to 0 when domainStdTopGap is 0', () => {
    const benchmarksZeroStd = { domainMeanTopGap: 0.3, domainStdTopGap: 0, medianSpread: 1.0 };
    const raw = { topGap: 0.3, bottomGap: 0.1, spread: 0.5, steepness: 0.1 };
    const result = classifyShape(raw, benchmarksZeroStd);
    expect(result.dominanceZScore).toBe(0);
  });

  it('includes all raw metrics in the output', () => {
    const raw = { topGap: 0.3, bottomGap: 0.1, spread: 0.9, steepness: 0.15 };
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

  it('classifies dominant_leader for a model with a large topGap relative to peers', () => {
    // Create 4 models so z-score is available. Three models with topGap~0.1, one with topGap=1.0
    const flat = (start: number): number[] =>
      Array.from({ length: 10 }, (_, i) => start - i * 0.01);
    const models: ModelWithSortedScores[] = [
      { model: 'dominant', sortedScores: [2.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2] },
      { model: 'm1', sortedScores: flat(1.0) },
      { model: 'm2', sortedScores: flat(0.9) },
      { model: 'm3', sortedScores: flat(0.8) },
    ];
    const result = computeRankingShapes(models);
    const dominantShape = result.shapes.get('dominant');
    expect(dominantShape?.label).toBe('dominant_leader');
  });

  it('shape label is one of the four valid values', () => {
    const models: ModelWithSortedScores[] = [
      { model: 'm1', sortedScores: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1] },
    ];
    const result = computeRankingShapes(models);
    const label = result.shapes.get('m1')?.label;
    expect(['dominant_leader', 'gradual_slope', 'no_clear_leader', 'bimodal']).toContain(label);
  });
});
