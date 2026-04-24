import { describe, expect, it } from 'vitest';
import { calculatePercentComplete } from '../../../src/services/run/progress.js';

describe('calculatePercentComplete', () => {
  it('calculates progress from completed and failed counts', () => {
    expect(calculatePercentComplete({ total: 10, completed: 5, failed: 0 })).toBe(50);
    expect(calculatePercentComplete({ total: 10, completed: 3, failed: 2 })).toBe(50);
    expect(calculatePercentComplete({ total: 10, completed: 0, failed: 0 })).toBe(0);
  });

  it('returns 100 when total is zero', () => {
    expect(calculatePercentComplete({ total: 0, completed: 0, failed: 0 })).toBe(100);
  });

  it('rounds to the nearest integer', () => {
    expect(calculatePercentComplete({ total: 3, completed: 1, failed: 0 })).toBe(33);
    expect(calculatePercentComplete({ total: 3, completed: 2, failed: 0 })).toBe(67);
  });
});
