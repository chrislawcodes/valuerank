import { describe, it, expect } from 'vitest';
import {
  cohensD,
  cohensDFromData,
  interpretEffectSize,
} from '../../../src/lib/statistics/cohens-d';

describe('cohensD', () => {
  describe('basic calculations', () => {
    it('returns negligible effect for identical distributions', () => {
      const result = cohensD(3.0, 1.0, 100, 3.0, 1.0, 100);

      expect(result.d).toBe(0);
      expect(result.absD).toBe(0);
      expect(result.interpretation).toBe('negligible');
      expect(result.direction).toBe('none');
    });

    it('calculates small effect size correctly', () => {
      // d = (3.2 - 3.0) / 1.0 = 0.2 (small effect)
      const result = cohensD(3.2, 1.0, 100, 3.0, 1.0, 100);

      expect(result.d).toBeCloseTo(0.2, 1);
      expect(result.interpretation).toBe('small');
      expect(result.direction).toBe('positive');
    });

    it('calculates medium effect size correctly', () => {
      // d = (3.5 - 3.0) / 1.0 = 0.5 (medium effect)
      const result = cohensD(3.5, 1.0, 100, 3.0, 1.0, 100);

      expect(result.d).toBeCloseTo(0.5, 1);
      expect(result.interpretation).toBe('medium');
      expect(result.direction).toBe('positive');
    });

    it('calculates large effect size correctly', () => {
      // d = (4.0 - 3.0) / 1.0 = 1.0 (clearly large effect)
      const result = cohensD(4.0, 1.0, 100, 3.0, 1.0, 100);

      expect(result.d).toBeCloseTo(1.0, 1);
      expect(result.interpretation).toBe('large');
      expect(result.direction).toBe('positive');
    });

    it('handles negative effect correctly', () => {
      const result = cohensD(2.5, 1.0, 100, 3.0, 1.0, 100);

      expect(result.d).toBeLessThan(0);
      expect(result.absD).toBeGreaterThan(0);
      expect(result.direction).toBe('negative');
    });
  });

  describe('pooled standard deviation', () => {
    it('correctly pools variances from different sample sizes', () => {
      // With different sample sizes, pooled SD should be weighted
      const result = cohensD(3.5, 1.0, 50, 3.0, 1.2, 150);

      // Should still calculate valid result
      expect(result.d).toBeGreaterThan(0);
      expect(result.interpretation).toBeDefined();
    });

    it('handles different standard deviations', () => {
      // Even with different SDs, should calculate pooled
      const result = cohensD(3.0, 0.5, 100, 3.0, 1.5, 100);

      // Same means, so d should be ~0
      expect(result.absD).toBeCloseTo(0, 1);
    });
  });

  describe('edge cases', () => {
    it('handles sample size of 1', () => {
      const result = cohensD(3.0, 1.0, 1, 3.0, 1.0, 100);

      expect(result.d).toBe(0);
      expect(result.interpretation).toBe('negligible');
    });

    it('handles zero standard deviation', () => {
      const result = cohensD(3.0, 0, 100, 3.0, 0, 100);

      expect(result.d).toBe(0);
      expect(result.interpretation).toBe('negligible');
    });

    it('handles zero variance with different means', () => {
      const result = cohensD(4.0, 0, 100, 3.0, 0, 100);

      expect(result.d).toBe(Infinity);
      expect(result.interpretation).toBe('large');
      expect(result.direction).toBe('positive');
    });
  });
});

describe('cohensDFromData', () => {
  it('calculates from raw arrays', () => {
    // Sample 1: mean ~3.0, sample 2: mean ~4.0
    const sample1 = [2, 3, 3, 3, 4];
    const sample2 = [3, 4, 4, 4, 5];

    const result = cohensDFromData(sample1, sample2);

    expect(result.d).toBeLessThan(0); // sample1 mean < sample2 mean
    expect(result.interpretation).toBeDefined();
  });

  it('handles empty arrays', () => {
    const result = cohensDFromData([], [1, 2, 3]);

    expect(result.d).toBe(0);
    expect(result.interpretation).toBe('negligible');
  });

  it('handles single-element arrays', () => {
    const result = cohensDFromData([3], [4, 5, 6]);

    expect(result.d).toBe(0);
    expect(result.interpretation).toBe('negligible');
  });
});

describe('interpretEffectSize', () => {
  it('returns negligible for d < 0.2', () => {
    expect(interpretEffectSize(0.0)).toBe('negligible');
    expect(interpretEffectSize(0.1)).toBe('negligible');
    expect(interpretEffectSize(0.19)).toBe('negligible');
  });

  it('returns small for 0.2 <= d < 0.5', () => {
    expect(interpretEffectSize(0.2)).toBe('small');
    expect(interpretEffectSize(0.35)).toBe('small');
    expect(interpretEffectSize(0.49)).toBe('small');
  });

  it('returns medium for 0.5 <= d < 0.8', () => {
    expect(interpretEffectSize(0.5)).toBe('medium');
    expect(interpretEffectSize(0.65)).toBe('medium');
    expect(interpretEffectSize(0.79)).toBe('medium');
  });

  it('returns large for d >= 0.8', () => {
    expect(interpretEffectSize(0.8)).toBe('large');
    expect(interpretEffectSize(1.0)).toBe('large');
    expect(interpretEffectSize(2.0)).toBe('large');
  });
});
