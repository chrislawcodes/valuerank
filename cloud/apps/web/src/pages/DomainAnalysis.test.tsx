import { describe, expect, it } from 'vitest';

function computeSupportRate(
  prioritized: number,
  deprioritized: number,
  neutral: number | undefined,
): number | null {
  const n = neutral ?? 0;
  const total = prioritized + deprioritized + n;
  return total > 0 ? ((prioritized + 0.5 * n) / total) * 100 : null;
}

describe('computeSupportRate', () => {
  it('computes the weighted support rate for mixed outcomes', () => {
    expect(computeSupportRate(6, 2, 4)).toBeCloseTo(66.67, 2);
  });

  it('returns 100 when all outcomes are prioritized', () => {
    expect(computeSupportRate(10, 0, 0)).toBe(100);
  });

  it('returns 50 when all outcomes are neutral', () => {
    expect(computeSupportRate(0, 0, 10)).toBe(50);
  });

  it('returns 0 when all outcomes are deprioritized', () => {
    expect(computeSupportRate(0, 10, 0)).toBe(0);
  });

  it('returns null when there is no data', () => {
    expect(computeSupportRate(0, 0, 0)).toBeNull();
  });

  it('treats missing neutral counts as zero', () => {
    expect(computeSupportRate(6, 2, undefined)).toBe(75);
  });
});
