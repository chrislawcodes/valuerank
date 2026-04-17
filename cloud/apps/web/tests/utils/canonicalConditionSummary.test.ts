import { describe, expect, it } from 'vitest';
import {
  getConditionCellDisplay,
  summarizeCanonicalConditionCounts,
  type CanonicalConditionCounts,
} from '../../src/utils/canonicalConditionSummary';

function summarizeAndDisplay(counts: CanonicalConditionCounts) {
  const summary = summarizeCanonicalConditionCounts(counts);
  const display = getConditionCellDisplay(summary);
  return { summary, display };
}

describe('summarizeCanonicalConditionCounts', () => {
  it.each([
    {
      name: 'strong self lean',
      counts: {
        strongly: 4,
        somewhat: 0,
        neutral: 0,
        opponentSomewhat: 0,
        opponentStrongly: 1,
      },
      expectedNetScore: 1.2,
      expectedDirection: 'self' as const,
      expectedLabel: '1.2',
      expectedBackgroundColor: 'rgba(59, 130, 246, 0.3)',
      expectedTextColorClass: 'text-blue-700',
    },
    {
      name: 'strong opponent lean',
      counts: {
        strongly: 1,
        somewhat: 0,
        neutral: 0,
        opponentSomewhat: 0,
        opponentStrongly: 4,
      },
      expectedNetScore: -1.2,
      expectedDirection: 'opponent' as const,
      expectedLabel: '1.2',
      expectedBackgroundColor: 'rgba(251, 146, 60, 0.3)',
      expectedTextColorClass: 'text-orange-700',
    },
    {
      name: 'mild self lean',
      counts: {
        strongly: 0,
        somewhat: 3,
        neutral: 0,
        opponentSomewhat: 1,
        opponentStrongly: 0,
      },
      expectedNetScore: 0.5,
      expectedDirection: 'self' as const,
      expectedLabel: '0.5',
      expectedBackgroundColor: 'rgba(59, 130, 246, 0.125)',
      expectedTextColorClass: 'text-blue-700',
    },
    {
      name: 'mild opponent lean',
      counts: {
        strongly: 0,
        somewhat: 1,
        neutral: 0,
        opponentSomewhat: 3,
        opponentStrongly: 0,
      },
      expectedNetScore: -0.5,
      expectedDirection: 'opponent' as const,
      expectedLabel: '0.5',
      expectedBackgroundColor: 'rgba(251, 146, 60, 0.125)',
      expectedTextColorClass: 'text-orange-700',
    },
    {
      name: 'exact tie',
      counts: {
        strongly: 2,
        somewhat: 0,
        neutral: 1,
        opponentSomewhat: 0,
        opponentStrongly: 2,
      },
      expectedNetScore: 0,
      expectedDirection: 'neutral' as const,
      expectedLabel: '0.0',
      expectedBackgroundColor: undefined,
      expectedTextColorClass: 'text-gray-500',
    },
  ])(
    '$name',
    ({
      counts,
      expectedNetScore,
      expectedDirection,
      expectedLabel,
      expectedBackgroundColor,
      expectedTextColorClass,
    }) => {
      const { summary, display } = summarizeAndDisplay(counts);
      const summaryNetScore = summary.netScore;
      const displayNetScore = display.netScore;

      expect(summaryNetScore ?? NaN).toBeCloseTo(expectedNetScore);
      expect(summary.direction).toBe(expectedDirection);
      expect(summary.hasData).toBe(true);

      expect(displayNetScore ?? NaN).toBeCloseTo(expectedNetScore);
      expect(display.direction).toBe(expectedDirection);
      expect(display.hasData).toBe(true);
      expect(display.label).toBe(expectedLabel);
      expect(display.backgroundColor).toBe(expectedBackgroundColor);
      expect(display.textColorClass).toBe(expectedTextColorClass);
    },
  );

  it('zero-trial input returns the no-data placeholder and neutral metadata', () => {
    const { summary, display } = summarizeAndDisplay({
      strongly: 0,
      somewhat: 0,
      neutral: 0,
      opponentSomewhat: 0,
      opponentStrongly: 0,
    });

    expect(summary).toMatchObject({
      netScore: null,
      direction: 'neutral',
      hasData: false,
      totalTrials: 0,
    });
    expect(display).toMatchObject({
      netScore: null,
      direction: 'neutral',
      hasData: false,
      label: '—',
      backgroundColor: undefined,
      textColorClass: 'text-gray-500',
    });
  });

  it('accepts fractional counts and produces a finite net score', () => {
    const summary = summarizeCanonicalConditionCounts({
      strongly: 5.5,
      somewhat: 2.3,
      opponentStrongly: 1.2,
      opponentSomewhat: 0.5,
      neutral: 0.5,
    });

    expect(summary.hasData).toBe(true);
    const netScore = summary.netScore;
    expect(netScore).not.toBeNull();
    expect(Number.isFinite(netScore ?? NaN)).toBe(true);
    expect(summary.direction).toBe('self');
  });

  it('ignores superset fields when tallying canonical counts', () => {
    const supersetCounts = {
      strongly: 3,
      somewhat: 2,
      opponentStrongly: 1,
      opponentSomewhat: 0,
      neutral: 0,
      prioritized: 5,
      deprioritized: 1,
      totalTrials: 6,
      unknownCount: 0,
    } as unknown as CanonicalConditionCounts;

    const canonicalCounts = {
      strongly: 3,
      somewhat: 2,
      opponentStrongly: 1,
      opponentSomewhat: 0,
      neutral: 0,
    };

    expect(summarizeCanonicalConditionCounts(supersetCounts)).toEqual(
      summarizeCanonicalConditionCounts(canonicalCounts),
    );
  });

  it('ignores inconsistent non-canonical extras', () => {
    const inconsistentCounts = {
      strongly: 2,
      somewhat: 3,
      opponentStrongly: 1,
      opponentSomewhat: 0,
      neutral: 0,
      prioritized: 999,
      deprioritized: 999,
      totalTrials: 999,
    } as unknown as CanonicalConditionCounts;

    const canonicalCounts = {
      strongly: 2,
      somewhat: 3,
      opponentStrongly: 1,
      opponentSomewhat: 0,
      neutral: 0,
    };

    expect(summarizeCanonicalConditionCounts(inconsistentCounts)).toEqual(
      summarizeCanonicalConditionCounts(canonicalCounts),
    );
  });

  it('coerces missing canonical keys to zero', () => {
    const summary = summarizeCanonicalConditionCounts({
      strongly: 2,
      somewhat: 1,
      opponentStrongly: 1,
      opponentSomewhat: 0,
    } as unknown as CanonicalConditionCounts);

    expect(summary).toMatchObject({
      hasData: true,
      totalTrials: 4,
      direction: 'self',
    });
    expect(summary.netScore).toBeCloseTo(0.75);
  });

  it('coerces non-finite canonical values to zero', () => {
    const summary = summarizeCanonicalConditionCounts({
      strongly: 5,
      somewhat: null as unknown as number,
      opponentStrongly: NaN as unknown as number,
      opponentSomewhat: 2,
      neutral: 0,
    } as CanonicalConditionCounts);

    expect(summary.hasData).toBe(true);
    expect(summary.totalTrials).toBe(7);
    expect(summary.netScore).toBeCloseTo(8 / 7);
    expect(summary.direction).toBe('self');
  });

  it('keeps exact ties neutral and renders them without a fill', () => {
    const { summary, display } = summarizeAndDisplay({
      strongly: 2,
      somewhat: 0,
      neutral: 0,
      opponentSomewhat: 0,
      opponentStrongly: 2,
    });

    expect(summary).toMatchObject({
      hasData: true,
      direction: 'neutral',
      totalTrials: 4,
    });
    expect(summary.netScore ?? NaN).toBe(0);
    expect(display).toMatchObject({
      label: '0.0',
      backgroundColor: undefined,
      textColorClass: 'text-gray-500',
    });
  });

  it.each([
    {
      name: 'positive boundary stays neutral at 0.05',
      counts: {
        strongly: 0,
        somewhat: 1,
        neutral: 19,
        opponentSomewhat: 0,
        opponentStrongly: 0,
      },
      expectedNetScore: 0.05,
      expectedDirection: 'neutral' as const,
    },
    {
      name: 'positive values above the boundary are self',
      counts: {
        strongly: 0,
        somewhat: 3,
        neutral: 47,
        opponentSomewhat: 0,
        opponentStrongly: 0,
      },
      expectedNetScore: 0.06,
      expectedDirection: 'self' as const,
    },
    {
      name: 'negative boundary stays neutral at -0.05',
      counts: {
        strongly: 0,
        somewhat: 0,
        neutral: 19,
        opponentSomewhat: 1,
        opponentStrongly: 0,
      },
      expectedNetScore: -0.05,
      expectedDirection: 'neutral' as const,
    },
    {
      name: 'negative values below the boundary are opponent',
      counts: {
        strongly: 0,
        somewhat: 0,
        neutral: 47,
        opponentSomewhat: 3,
        opponentStrongly: 0,
      },
      expectedNetScore: -0.06,
      expectedDirection: 'opponent' as const,
    },
  ])(
    '$name',
    ({
      counts,
      expectedNetScore,
      expectedDirection,
    }) => {
      const summary = summarizeCanonicalConditionCounts(counts);

      expect(summary.netScore ?? NaN).toBeCloseTo(expectedNetScore);
      expect(summary.direction).toBe(expectedDirection);
    },
  );

  it('formats negative net scores with magnitude-only labels', () => {
    const { summary, display } = summarizeAndDisplay({
      strongly: 0,
      somewhat: 0,
      neutral: 1,
      opponentSomewhat: 0,
      opponentStrongly: 9,
    });

    expect(summary.netScore ?? NaN).toBeCloseTo(-1.8);
    expect(summary.direction).toBe('opponent');
    expect(display.label).toBe('1.8');
    expect(display.backgroundColor).toBe('rgba(251, 146, 60, 0.45)');
    expect(display.textColorClass).toBe('text-orange-700');
  });
});
