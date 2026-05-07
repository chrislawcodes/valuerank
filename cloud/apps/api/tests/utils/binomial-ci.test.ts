import { describe, expect, it } from 'vitest';

import { wilsonCI95 } from '../../src/utils/binomial-ci.js';

describe('wilsonCI95', () => {
  it('returns null when n is zero', () => {
    expect(wilsonCI95(0, 0)).toBeNull();
  });

  it('returns a zero lower bound and a small upper bound when successes are zero', () => {
    const interval = wilsonCI95(0, 100);

    expect(interval).not.toBeNull();
    expect(interval?.[0]).toBe(0);
    expect(interval?.[1]).toBeLessThan(0.05);
  });

  it('returns a high lower bound and one as the upper bound when successes equal n', () => {
    const interval = wilsonCI95(100, 100);

    expect(interval).not.toBeNull();
    expect(interval?.[0]).toBeGreaterThan(0.95);
    expect(interval?.[1]).toBe(1);
  });

  it('returns an interval around 0.5 for 50 successes out of 100 trials', () => {
    const interval = wilsonCI95(50, 100);

    expect(interval).not.toBeNull();
    expect(interval?.[0]).toBeCloseTo(0.402, 2);
    expect(interval?.[1]).toBeCloseTo(0.598, 2);
    expect(interval?.[0]).toBeLessThan(0.5);
    expect(interval?.[1]).toBeGreaterThan(0.5);
  });

  it('matches the reference interval for 80 successes out of 125 trials', () => {
    const interval = wilsonCI95(80, 125);

    expect(interval).not.toBeNull();
    expect(interval?.[0]).toBeCloseTo(0.553, 2);
    expect(interval?.[1]).toBeCloseTo(0.716, 2);
  });
});
