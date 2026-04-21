import { describe, expect, it } from 'vitest';
import { spearmanRankCorrelation } from '../../../src/services/statistics/spearman.js';

describe('spearmanRankCorrelation', () => {
  it('matches a tied-rank example', () => {
    const result = spearmanRankCorrelation(
      [1, 1, 2, 3, 3],
      [3, 2, 2, 1, 1],
    );

    // Tied-rank Spearman (Pearson-of-ranks method) for x=[1,1,2,3,3], y=[3,2,2,1,1]:
    //   x_ranks = [1.5,1.5,3,4.5,4.5], y_ranks = [5,3.5,3.5,1.5,1.5]
    //   rho = cov(ranks) / (sd(x_ranks)*sd(y_ranks)) = -8.25 / sqrt(9*9) = -0.9167
    expect(result.rho).toBeCloseTo(-0.9167, 3);
    expect(result.p).toBeLessThan(0.05);
  });

  it('throws on length mismatch', () => {
    expect(() => spearmanRankCorrelation([1, 2], [1])).toThrow(RangeError);
  });
});
