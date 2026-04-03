import { describe, expect, it } from 'vitest';
import {
  resolveAnalysisDecisionModel,
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

  it('returns null for decision model when V2 is disabled', () => {
    expect(resolveAnalysisDecisionModel(input, false)).toBeNull();
    // resolveAnalysisValueOutcomes always uses canonical regardless of flag
    expect(resolveAnalysisValueOutcomes(input, 'Achievement', 'Benevolence_Dependability', false)).toEqual({
      Achievement: 'prioritized',
      Benevolence_Dependability: 'deprioritized',
    });
  });

  it('resolves canonical decision when V2 is enabled', () => {
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
    });
    expect(resolveAnalysisValueOutcomes(input, 'Achievement', 'Benevolence_Dependability', true)).toEqual({
      Achievement: 'prioritized',
      Benevolence_Dependability: 'deprioritized',
    });
  });
});
