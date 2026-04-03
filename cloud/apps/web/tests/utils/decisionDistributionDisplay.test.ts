import { describe, expect, it } from 'vitest';
import {
  buildDecisionDistributionBuckets,
  getDecisionDistributionChartAriaLabel,
  getDecisionDistributionHelperText,
  normalizeDecisionDistributionCounts,
} from '../../src/utils/decisionDistributionDisplay';

describe('decisionDistributionDisplay', () => {
  it('returns bucket labels in canonical order', () => {
    const buckets = buildDecisionDistributionBuckets({
      '1': 'Strongly support the other value',
      '2': 'Somewhat support the other value',
      '3': 'Neutral',
      '4': 'Somewhat support this value',
      '5': 'Strongly support this value',
    });

    expect(buckets.map((bucket) => bucket.code)).toEqual([
      'opponentStrongly',
      'opponentSomewhat',
      'neutral',
      'somewhat',
      'strongly',
    ]);
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      'Strongly support the other value',
      'Somewhat support the other value',
      'Neutral',
      'Somewhat support this value',
      'Strongly support this value',
    ]);
    expect(buckets.map((bucket) => bucket.ariaLabel)).toEqual([
      'Strongly support the other value decision bucket',
      'Somewhat support the other value decision bucket',
      'Neutral decision bucket',
      'Somewhat support this value decision bucket',
      'Strongly support this value decision bucket',
    ]);
    expect(getDecisionDistributionChartAriaLabel(buckets)).toContain('Strongly support the other value');
    expect(getDecisionDistributionHelperText()).not.toMatch(/1-5/i);
  });

  it('normalizes missing and unknown bucket keys to zero-count rows', () => {
    expect(
      normalizeDecisionDistributionCounts({
        opponentStrongly: 5,
        neutral: 2,
        strongly: 7,
        '9': 99,
      }),
    ).toEqual({
      opponentStrongly: 5,
      opponentSomewhat: 0,
      neutral: 2,
      somewhat: 0,
      strongly: 7,
    });
  });

  it('normalizes legacy descriptive decision keys to semantic buckets', () => {
    expect(
      normalizeDecisionDistributionCounts({
        opponentStrongly: 2,
        opponentSomewhat: 3,
        neutral: 4,
        somewhat: 5,
        strongly: 6,
      }),
    ).toEqual({
      opponentStrongly: 2,
      opponentSomewhat: 3,
      neutral: 4,
      somewhat: 5,
      strongly: 6,
    });
  });
});
