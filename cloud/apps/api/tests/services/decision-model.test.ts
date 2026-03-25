import { describe, expect, it } from 'vitest';
import {
  resolveAnalysisDecisionModel,
  resolveAnalysisScore,
  resolveAnalysisValueOutcomes,
} from '../../src/services/decision-model.js';

describe('analysis decision model helper', () => {
  const input = {
    decisionCode: 'manual',
    decisionMetadata: {
      matchedLabel: 'Achievement',
      parseClass: 'exact',
      parsePath: 'exact.favor_first.strong',
      parserVersion: 'parser-1',
      responseExcerpt: 'Achievement',
    },
    definitionSnapshot: {
      dimensions: [{ name: 'Achievement' }, { name: 'Benevolence_Dependability' }],
      methodology: {
        presentation_order: 'A_first',
      },
    },
    orientationFlipped: false,
  };

  it('keeps legacy score parsing when V2 is disabled', () => {
    expect(resolveAnalysisDecisionModel(input, false)).toBeNull();
    expect(resolveAnalysisScore(input, false)).toBeNull();
    expect(resolveAnalysisValueOutcomes(input, 'Achievement', 'Benevolence_Dependability', false)).toBeUndefined();
  });

  it('resolves canonical compatibility when V2 is enabled', () => {
    const decisionModel = resolveAnalysisDecisionModel(input, true);

    expect(decisionModel).toMatchObject({
      canonical: {
        favoredValueKey: 'Achievement',
        opposedValueKey: 'Benevolence_Dependability',
        direction: 'favor_first',
        strength: 'strong',
        normalizationApplied: false,
        normalizationReason: null,
        source: 'deterministic',
      },
      legacy: {
        rawScore: null,
        canonicalScore: 5,
      },
    });
    expect(resolveAnalysisScore(input, true)).toBe(5);
    expect(resolveAnalysisValueOutcomes(input, 'Achievement', 'Benevolence_Dependability', true)).toEqual({
      Achievement: 'prioritized',
      Benevolence_Dependability: 'deprioritized',
    });
  });
});
