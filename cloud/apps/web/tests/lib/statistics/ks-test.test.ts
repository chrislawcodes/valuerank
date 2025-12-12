import { describe, it, expect } from 'vitest';
import {
  ksStatistic,
  ksFromCounts,
  buildECDF,
  interpretKS,
} from '../../../src/lib/statistics/ks-test';

describe('ksStatistic', () => {
  describe('basic calculations', () => {
    it('returns 0 for identical distributions', () => {
      const sample1 = [1, 2, 3, 4, 5];
      const sample2 = [1, 2, 3, 4, 5];

      const result = ksStatistic(sample1, sample2);

      expect(result.statistic).toBe(0);
      expect(result.interpretation).toBe('identical');
    });

    it('returns 1 for completely non-overlapping distributions', () => {
      const sample1 = [1, 2, 3, 4, 5];
      const sample2 = [10, 11, 12, 13, 14];

      const result = ksStatistic(sample1, sample2);

      expect(result.statistic).toBe(1);
      expect(result.interpretation).toBe('very_different');
    });

    it('calculates intermediate values for partially overlapping', () => {
      const sample1 = [1, 2, 3, 4, 5];
      const sample2 = [3, 4, 5, 6, 7];

      const result = ksStatistic(sample1, sample2);

      expect(result.statistic).toBeGreaterThan(0);
      expect(result.statistic).toBeLessThan(1);
    });
  });

  describe('decision distributions (1-5 scale)', () => {
    it('detects shift toward higher decisions', () => {
      // Run 1: centered around 2-3
      const sample1 = [1, 2, 2, 2, 3, 3, 3, 3, 4];
      // Run 2: centered around 4-5
      const sample2 = [2, 3, 4, 4, 4, 4, 5, 5, 5];

      const result = ksStatistic(sample1, sample2);

      expect(result.statistic).toBeGreaterThan(0.3);
      expect(['different', 'very_different']).toContain(result.interpretation);
    });

    it('detects similar distributions', () => {
      // Both centered around 3
      const sample1 = [2, 2, 3, 3, 3, 3, 4, 4];
      const sample2 = [2, 2, 3, 3, 3, 3, 4, 4];

      const result = ksStatistic(sample1, sample2);

      expect(result.statistic).toBe(0);
      expect(result.interpretation).toBe('identical');
    });
  });

  describe('edge cases', () => {
    it('handles empty first sample', () => {
      const result = ksStatistic([], [1, 2, 3]);

      expect(result.statistic).toBe(1);
      expect(result.interpretation).toBe('very_different');
      expect(result.n1).toBe(0);
      expect(result.n2).toBe(3);
    });

    it('handles empty second sample', () => {
      const result = ksStatistic([1, 2, 3], []);

      expect(result.statistic).toBe(1);
      expect(result.interpretation).toBe('very_different');
    });

    it('handles both empty samples', () => {
      const result = ksStatistic([], []);

      expect(result.statistic).toBe(0);
      expect(result.interpretation).toBe('identical');
    });

    it('handles single-element samples', () => {
      const result = ksStatistic([3], [3]);

      expect(result.statistic).toBe(0);
    });

    it('handles different sample sizes', () => {
      const sample1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const sample2 = [3, 4, 5];

      const result = ksStatistic(sample1, sample2);

      expect(result.n1).toBe(10);
      expect(result.n2).toBe(3);
      expect(result.statistic).toBeGreaterThanOrEqual(0);
      expect(result.statistic).toBeLessThanOrEqual(1);
    });
  });
});

describe('ksFromCounts', () => {
  it('calculates KS from decision count records', () => {
    // Run 1: mostly 2s and 3s
    const counts1 = { 1: 5, 2: 30, 3: 40, 4: 20, 5: 5 };
    // Run 2: mostly 4s and 5s
    const counts2 = { 1: 5, 2: 10, 3: 20, 4: 40, 5: 25 };

    const result = ksFromCounts(counts1, counts2);

    expect(result.statistic).toBeGreaterThan(0);
    expect(result.n1).toBe(100);
    expect(result.n2).toBe(100);
  });

  it('handles identical count distributions', () => {
    const counts = { 1: 10, 2: 20, 3: 40, 4: 20, 5: 10 };

    const result = ksFromCounts(counts, counts);

    expect(result.statistic).toBe(0);
    expect(result.interpretation).toBe('identical');
  });

  it('handles empty counts', () => {
    const result = ksFromCounts({}, { 3: 10 });

    expect(result.statistic).toBe(1);
    expect(result.interpretation).toBe('very_different');
  });
});

describe('buildECDF', () => {
  it('builds correct ECDF', () => {
    const data = [1, 2, 3, 4, 5];
    const ecdf = buildECDF(data);

    expect(ecdf(0)).toBe(0);    // Nothing <= 0
    expect(ecdf(1)).toBe(0.2);  // 1/5 values <= 1
    expect(ecdf(2)).toBe(0.4);  // 2/5 values <= 2
    expect(ecdf(3)).toBe(0.6);  // 3/5 values <= 3
    expect(ecdf(4)).toBe(0.8);  // 4/5 values <= 4
    expect(ecdf(5)).toBe(1.0);  // All values <= 5
    expect(ecdf(10)).toBe(1.0); // All values <= 10
  });

  it('handles duplicates', () => {
    const data = [2, 2, 2, 4, 4];
    const ecdf = buildECDF(data);

    expect(ecdf(1)).toBe(0);    // Nothing <= 1
    expect(ecdf(2)).toBe(0.6);  // 3/5 values <= 2
    expect(ecdf(3)).toBe(0.6);  // 3/5 values <= 3
    expect(ecdf(4)).toBe(1.0);  // All values <= 4
  });

  it('handles empty data', () => {
    const ecdf = buildECDF([]);

    expect(ecdf(0)).toBe(0);
    expect(ecdf(100)).toBe(0);
  });
});

describe('interpretKS', () => {
  it('returns identical for statistic < 0.1', () => {
    expect(interpretKS(0.0)).toBe('identical');
    expect(interpretKS(0.05)).toBe('identical');
    expect(interpretKS(0.09)).toBe('identical');
  });

  it('returns similar for 0.1 <= statistic < 0.2', () => {
    expect(interpretKS(0.1)).toBe('similar');
    expect(interpretKS(0.15)).toBe('similar');
    expect(interpretKS(0.19)).toBe('similar');
  });

  it('returns different for 0.2 <= statistic < 0.4', () => {
    expect(interpretKS(0.2)).toBe('different');
    expect(interpretKS(0.3)).toBe('different');
    expect(interpretKS(0.39)).toBe('different');
  });

  it('returns very_different for statistic >= 0.4', () => {
    expect(interpretKS(0.4)).toBe('very_different');
    expect(interpretKS(0.6)).toBe('very_different');
    expect(interpretKS(1.0)).toBe('very_different');
  });
});
