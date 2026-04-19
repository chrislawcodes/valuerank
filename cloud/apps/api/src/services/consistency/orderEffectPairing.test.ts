import { describe, expect, it } from 'vitest';
import { computeOrderEffect } from './orderEffectPairing.js';

function makeTranscript(
  scenarioId: string,
  favoredValueKey: string,
  opposedValueKey: string,
): {
  scenarioId: string;
  decisionModelV2: {
    canonical: {
      favoredValueKey: string;
      opposedValueKey: string;
      direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown';
      strength: 'strong' | 'lean' | 'neutral' | 'unknown';
    };
  };
} {
  return {
    scenarioId,
    decisionModelV2: {
      canonical: {
        favoredValueKey,
        opposedValueKey,
        direction: 'favor_first',
        strength: 'strong',
      },
    },
  };
}

describe('computeOrderEffect', () => {
  it('returns same for matching transcript pairs', () => {
    const result = computeOrderEffect(
      [makeTranscript('1', 'A', 'B'), makeTranscript('2', 'A', 'B')],
      [makeTranscript('1', 'A', 'B'), makeTranscript('2', 'A', 'B')],
    );

    expect(result.notApplicable).toBe(false);
    expect(result.samePct).toBe(100);
    expect(result.flippedPct).toBe(0);
    expect(result.noisyPct).toBe(0);
  });

  it('returns flipped for reversed transcript pairs', () => {
    const result = computeOrderEffect(
      [makeTranscript('1', 'A', 'B'), makeTranscript('2', 'A', 'B')],
      [makeTranscript('1', 'B', 'A'), makeTranscript('2', 'B', 'A')],
    );

    expect(result.notApplicable).toBe(false);
    expect(result.samePct).toBe(0);
    expect(result.flippedPct).toBe(100);
    expect(result.noisyPct).toBe(0);
  });

  it('mixes same, flipped, and noisy outcomes', () => {
    const result = computeOrderEffect(
      [makeTranscript('1', 'A', 'B'), makeTranscript('2', 'A', 'B'), makeTranscript('3', 'A', 'B')],
      [
        makeTranscript('1', 'A', 'B'),
        makeTranscript('2', 'B', 'A'),
        {
          scenarioId: '3',
          decisionModelV2: {
            canonical: {
              favoredValueKey: 'A',
              opposedValueKey: 'B',
              direction: 'neutral',
              strength: 'neutral',
            },
          },
        },
      ],
    );

    expect(result.notApplicable).toBe(false);
    expect(result.samePct + result.flippedPct + result.noisyPct).toBe(100);
    expect(result.samePct).toBeGreaterThan(0);
    expect(result.flippedPct).toBeGreaterThan(0);
    expect(result.noisyPct).toBeGreaterThan(0);
  });

  it('returns not applicable when one order is missing', () => {
    expect(computeOrderEffect([makeTranscript('1', 'A', 'B')], [])).toEqual({
      samePct: 0,
      flippedPct: 0,
      noisyPct: 0,
      notApplicable: true,
    });
  });
});
