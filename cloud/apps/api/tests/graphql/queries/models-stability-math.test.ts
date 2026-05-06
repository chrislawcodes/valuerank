import { describe, expect, it } from 'vitest';
import {
  classifyRepeatPattern,
  resolveDimensionKeys,
  buildConditionGroups,
  aggregateConditionStats,
  computeVignetteStability,
  averageVignetteStability,
  weightedMean,
} from '../../../src/graphql/queries/models-stability-math.js';

describe('classifyRepeatPattern', () => {
  it('returns stable at the exact directional agreement threshold', () => {
    expect(classifyRepeatPattern(0.80, 0.5, 0.1, 0)).toBe('stable');
  });

  it('returns softLean when the absolute distance and agreement thresholds are met', () => {
    expect(classifyRepeatPattern(0.79, 0.6, 0.1, 0)).not.toBe('stable');
    expect(classifyRepeatPattern(0.79, 0.6, 0.1, 1)).toBe('softLean');
  });

  it('returns noisy when range is 3', () => {
    expect(classifyRepeatPattern(0.5, 0.2, 0.1, 3)).toBe('noisy');
  });

  it('returns torn when the pattern falls through', () => {
    expect(classifyRepeatPattern(0.5, 0.2, 0.1, 2)).toBe('torn');
  });

  it('returns null when any input is null or undefined', () => {
    expect(classifyRepeatPattern(null, 0.5, 0.1, 0)).toBeNull();
    expect(classifyRepeatPattern(undefined, 0.5, 0.1, 0)).toBeNull();
  });
});

describe('resolveDimensionKeys', () => {
  it('returns the shared sorted keys when all scenarios match', () => {
    expect(
      resolveDimensionKeys({
        a: { fairness: 1, security: 2 },
        b: { fairness: 3, security: 4 },
      }),
    ).toEqual({ keys: ['fairness', 'security'], inconsistent: false });
  });

  it('returns inconsistent when one scenario has a different key set', () => {
    expect(
      resolveDimensionKeys({
        a: { fairness: 1, security: 2 },
        b: { fairness: 3, loyalty: 4 },
      }),
    ).toEqual({ inconsistent: true });
  });

  it('returns null for an empty scenario map', () => {
    expect(resolveDimensionKeys({})).toBeNull();
  });

  it('returns null when a scenario has only one key', () => {
    expect(
      resolveDimensionKeys({
        a: { fairness: 1 },
      }),
    ).toBeNull();
  });
});

describe('buildConditionGroups', () => {
  it('groups scenarios with the same levels into the same condition key', () => {
    const groups = buildConditionGroups(
      {
        a: { fairness: 1, security: 2 },
        b: { fairness: 1, security: 2 },
      },
      'fairness',
      'security',
    );

    expect(groups.get('1||2')).toEqual(['a', 'b']);
  });

  it('uses N/A when a key is missing', () => {
    const groups = buildConditionGroups(
      {
        a: { security: 2 },
      },
      'fairness',
      'security',
    );

    expect(groups.get('N/A||2')).toEqual(['a']);
  });

  it('creates multiple entries for distinct level combinations', () => {
    const groups = buildConditionGroups(
      {
        a: { fairness: 1, security: 2 },
        b: { fairness: 1, security: 3 },
        c: { fairness: 2, security: 2 },
      },
      'fairness',
      'security',
    );

    expect(groups.size).toBe(3);
    expect(groups.get('1||2')).toEqual(['a']);
    expect(groups.get('1||3')).toEqual(['b']);
    expect(groups.get('2||2')).toEqual(['c']);
  });
});

describe('weightedMean', () => {
  it('returns null when no eligible entries are present', () => {
    expect(
      weightedMean([
        { sampleCount: 1, value: null },
        { sampleCount: 2, value: undefined },
      ]),
    ).toBeNull();
  });

  it('computes a weighted average using sampleCount as the weight', () => {
    expect(
      weightedMean([
        { sampleCount: 2, value: 0.6 },
        { sampleCount: 4, value: 0.9 },
      ]),
    ).toBeCloseTo(0.8, 10);
  });

  it('returns null when the total weight is zero', () => {
    expect(
      weightedMean([
        { sampleCount: 0, value: 0.9 },
      ]),
    ).toBeNull();
  });
});

describe('aggregateConditionStats', () => {
  it('returns null when all scenarios are below the repeat threshold', () => {
    expect(
      aggregateConditionStats(
        ['a', 'b'],
        {
          a: {
            sampleCount: 1,
            mean: 0,
            stdDev: 0,
            variance: 0,
            min: 0,
            max: 0,
            range: 1,
            directionalAgreement: 0.8,
            medianSignedDistance: 0.5,
            neutralShare: 0.1,
          },
          b: {
            sampleCount: 1,
            mean: 0,
            stdDev: 0,
            variance: 0,
            min: 0,
            max: 0,
            range: 2,
            directionalAgreement: 0.9,
            medianSignedDistance: 0.4,
            neutralShare: 0.2,
          },
        },
      ),
    ).toBeNull();
  });

  it('includes only scenarios with sampleCount at least 2', () => {
    expect(
      aggregateConditionStats(
        ['a', 'b'],
        {
          a: {
            sampleCount: 1,
            mean: 0,
            stdDev: 0,
            variance: 0,
            min: 0,
            max: 0,
            range: 1,
            directionalAgreement: 0.2,
            medianSignedDistance: 0.1,
            neutralShare: 0.8,
          },
          b: {
            sampleCount: 3,
            mean: 0,
            stdDev: 0,
            variance: 0,
            min: 0,
            max: 0,
            range: 4,
            directionalAgreement: 0.7,
            medianSignedDistance: 0.5,
            neutralShare: 0.2,
          },
        },
      ),
    ).toEqual({
      directionalAgreement: 0.7,
      medianSignedDistance: 0.5,
      neutralShare: 0.2,
      maxRange: 4,
      totalSamples: 3,
    });
  });

  it('computes weighted means and rounds to two decimals', () => {
    expect(
      aggregateConditionStats(
        ['a', 'b'],
        {
          a: {
            sampleCount: 2,
            mean: 0,
            stdDev: 0,
            variance: 0,
            min: 0,
            max: 0,
            range: 2,
            directionalAgreement: 0.6,
            medianSignedDistance: 0.4,
            neutralShare: 0.1,
          },
          b: {
            sampleCount: 4,
            mean: 0,
            stdDev: 0,
            variance: 0,
            min: 0,
            max: 0,
            range: 5,
            directionalAgreement: 0.9,
            medianSignedDistance: 0.8,
            neutralShare: 0.3,
          },
        },
      ),
    ).toEqual({
      directionalAgreement: Number((0.8).toFixed(2)),
      medianSignedDistance: Number(((0.4 * 2 + 0.8 * 4) / 6).toFixed(2)),
      neutralShare: Number(((0.1 * 2 + 0.3 * 4) / 6).toFixed(2)),
      maxRange: 5,
      totalSamples: 6,
    });
  });

  it('uses the maximum range across eligible scenarios', () => {
    const stats = aggregateConditionStats(
      ['a', 'b'],
      {
        a: {
          sampleCount: 2,
          mean: 0,
          stdDev: 0,
          variance: 0,
          min: 0,
          max: 0,
          range: 2,
          directionalAgreement: 0.6,
          medianSignedDistance: 0.4,
          neutralShare: 0.1,
        },
        b: {
          sampleCount: 3,
          mean: 0,
          stdDev: 0,
          variance: 0,
          min: 0,
          max: 0,
          range: 7,
          directionalAgreement: 0.9,
          medianSignedDistance: 0.8,
          neutralShare: 0.3,
        },
      },
    );

    expect(stats?.maxRange).toBe(7);
  });
});

describe('computeVignetteStability', () => {
  it('returns null when all grouped conditions are null after aggregation', () => {
    expect(
      computeVignetteStability(
        new Map([['c1', ['a']], ['c2', ['b']]]),
        {
          a: {
            sampleCount: 1,
            mean: 0,
            stdDev: 0,
            variance: 0,
            min: 0,
            max: 0,
            range: 0,
            directionalAgreement: 0.9,
            medianSignedDistance: 0.6,
            neutralShare: 0.1,
          },
          b: {
            sampleCount: 1,
            mean: 0,
            stdDev: 0,
            variance: 0,
            min: 0,
            max: 0,
            range: 3,
            directionalAgreement: 0.2,
            medianSignedDistance: 0.1,
            neutralShare: 0.9,
          },
        },
      ),
    ).toBeNull();
  });

  it('counts stable and noisy conditions and maps noisy to unstable', () => {
    const stability = computeVignetteStability(
      new Map([
        ['c1', ['stable-a', 'stable-b']],
        ['c2', ['noisy-a', 'noisy-b']],
      ]),
      {
        'stable-a': {
          sampleCount: 2,
          mean: 0,
          stdDev: 0,
          variance: 0,
          min: 0,
          max: 0,
          range: 0,
          directionalAgreement: 0.8,
          medianSignedDistance: 0.2,
          neutralShare: 0.1,
        },
        'stable-b': {
          sampleCount: 2,
          mean: 0,
          stdDev: 0,
          variance: 0,
          min: 0,
          max: 0,
          range: 1,
          directionalAgreement: 0.8,
          medianSignedDistance: 0.1,
          neutralShare: 0.1,
        },
        'noisy-a': {
          sampleCount: 2,
          mean: 0,
          stdDev: 0,
          variance: 0,
          min: 0,
          max: 0,
          range: 3,
          directionalAgreement: 0.4,
          medianSignedDistance: 0.1,
          neutralShare: 0.7,
        },
        'noisy-b': {
          sampleCount: 2,
          mean: 0,
          stdDev: 0,
          variance: 0,
          min: 0,
          max: 0,
          range: 4,
          directionalAgreement: 0.4,
          medianSignedDistance: 0.2,
          neutralShare: 0.8,
        },
      },
    );

    expect(stability).toEqual({
      classifiedCount: 2,
      stableShare: 0.5,
      softLeanShare: 0,
      tornShare: 0,
      unstableShare: 0.5,
      avgDirectionalAgreement: stability?.avgDirectionalAgreement ?? null,
    });
    expect(stability?.avgDirectionalAgreement).toBeCloseTo(0.6, 10);
  });

  it('returns null when no grouped conditions can be classified', () => {
    expect(
      computeVignetteStability(
        new Map([['c1', ['a']]]),
        {
          a: {
            sampleCount: 1,
            mean: 0,
            stdDev: 0,
            variance: 0,
            min: 0,
            max: 0,
            range: 0,
            directionalAgreement: 0.9,
            medianSignedDistance: 0.2,
            neutralShare: 0.1,
          },
        },
      ),
    ).toBeNull();
  });
});

describe('averageVignetteStability', () => {
  it('returns null for an empty array', () => {
    expect(averageVignetteStability([])).toBeNull();
  });

  it('averages stability shares across vignettes', () => {
    expect(
      averageVignetteStability([
        {
          classifiedCount: 10,
          stableShare: 1,
          softLeanShare: 0,
          tornShare: 0,
          unstableShare: 0,
          avgDirectionalAgreement: 0.9,
        },
        {
          classifiedCount: 2,
          stableShare: 0,
          softLeanShare: 1,
          tornShare: 0,
          unstableShare: 0,
          avgDirectionalAgreement: 0.5,
        },
      ]),
    ).toEqual({
      stableShare: 0.5,
      softLeanShare: 0.5,
      tornShare: 0,
      unstableShare: 0,
      avgDirectionalAgreement: 0.7,
    });
  });

  it('gives each vignette equal weight regardless of classifiedCount', () => {
    expect(
      averageVignetteStability([
        {
          classifiedCount: 10,
          stableShare: 1,
          softLeanShare: 0,
          tornShare: 0,
          unstableShare: 0,
          avgDirectionalAgreement: 1,
        },
        {
          classifiedCount: 2,
          stableShare: 0,
          softLeanShare: 1,
          tornShare: 0,
          unstableShare: 0,
          avgDirectionalAgreement: 0,
        },
      ]),
    ).toEqual({
      stableShare: 0.5,
      softLeanShare: 0.5,
      tornShare: 0,
      unstableShare: 0,
      avgDirectionalAgreement: 0.5,
    });
  });
});
