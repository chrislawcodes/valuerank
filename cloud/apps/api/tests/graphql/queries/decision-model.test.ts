import { describe, expect, it } from 'vitest';
import {
  DECISION_MODEL_READ_RULES,
  buildRawDecisionEvidence,
  canonicalDecisionToLegacyScore,
  resolveDecisionModel,
  resolveTranscriptDecisionModel,
  type CanonicalDecision,
  type DecisionModelInput,
  type DecisionPair,
  type RawDecisionEvidence,
} from '../../../src/graphql/queries/domain/decision-model.js';
import {
  canonicalDecisionToLegacyScore as sharedCanonicalDecisionToLegacyScore,
  resolveDecisionModel as sharedResolveDecisionModel,
} from '../../../src/graphql/queries/domain/shared.js';

const PAIR: DecisionPair = {
  valueA: 'Achievement',
  valueB: 'Benevolence_Dependability',
};

function buildManualOverride(
  overrides: Partial<NonNullable<RawDecisionEvidence['manualOverride']>> = {},
): NonNullable<RawDecisionEvidence['manualOverride']> {
  return {
    previousValue: null,
    overriddenAt: '2026-03-23T00:00:00Z',
    overriddenByUserId: 'user-1',
    ...overrides,
  };
}

function buildRaw(
  overrides: Partial<RawDecisionEvidence> = {},
): RawDecisionEvidence {
  return {
    matchedText: 'Achievement',
    matchedLabel: 'Achievement',
    parseClass: 'exact',
    parsePath: 'exact.favor_first.strong',
    parserVersion: 'parser-1',
    responseExcerpt: 'excerpt',
    manualOverride: null,
    ...overrides,
  };
}

function buildInput(
  raw: RawDecisionEvidence,
  overrides: Partial<Omit<DecisionModelInput, 'raw'>> = {},
): DecisionModelInput {
  return {
    pair: PAIR,
    orientationFlipped: false,
    manualOverridePresent: false,
    manualOverrideDecision: null,
    ...overrides,
    raw,
  };
}

function expectCanonical(
  actual: CanonicalDecision,
  expected: Partial<CanonicalDecision>,
): void {
  expect(actual).toMatchObject(expected);
}

describe('decision model', () => {
  it('maps canonical scores to legacy compatibility scores', () => {
    expect(canonicalDecisionToLegacyScore({ direction: 'favor_first', strength: 'strong' })).toBe(5);
    expect(canonicalDecisionToLegacyScore({ direction: 'favor_first', strength: 'lean' })).toBe(4);
    expect(canonicalDecisionToLegacyScore({ direction: 'neutral', strength: 'neutral' })).toBe(3);
    expect(canonicalDecisionToLegacyScore({ direction: 'favor_second', strength: 'lean' })).toBe(2);
    expect(canonicalDecisionToLegacyScore({ direction: 'favor_second', strength: 'strong' })).toBe(1);
    expect(canonicalDecisionToLegacyScore({ direction: 'unknown', strength: 'unknown' })).toBeNull();
  });

  it('reaches the adapter through the shared barrel without changing behavior', () => {
    expect(sharedCanonicalDecisionToLegacyScore).toBe(canonicalDecisionToLegacyScore);

    const input = buildInput(buildRaw());
    expect(sharedResolveDecisionModel(input)).toEqual(resolveDecisionModel(input));
  });

  it('builds raw decision evidence from stored metadata', () => {
    expect(
      buildRawDecisionEvidence({
        matchedText: 'Achievement',
        matchedLabel: 'Achievement',
        parseClass: 'exact',
        parsePath: 'exact.favor_first.strong',
        parserVersion: 'parser-1',
        responseExcerpt: 'Achievement ...',
      }),
    ).toEqual({
      matchedText: 'Achievement',
      matchedLabel: 'Achievement',
      parseClass: 'exact',
      parsePath: 'exact.favor_first.strong',
      parserVersion: 'parser-1',
      responseExcerpt: 'Achievement ...',
      manualOverride: null,
    });
    expect(
      buildRawDecisionEvidence({
        manualOverride: buildManualOverride({ previousValue: '2' }),
      }),
    ).toMatchObject({
      manualOverride: {
        previousValue: '2',
        overriddenAt: '2026-03-23T00:00:00Z',
        overriddenByUserId: 'user-1',
      },
    });
  });

  it('resolves a transcript decision model envelope behind the shared boundary', () => {
    const result = resolveTranscriptDecisionModel({
      decisionCode: null,
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
      orientationFlipped: true,
    });

    expect(result.raw).toEqual({
      matchedText: 'Achievement',
      matchedLabel: 'Achievement',
      parseClass: 'exact',
      parsePath: 'exact.favor_first.strong',
      parserVersion: 'parser-1',
      responseExcerpt: 'Achievement',
      manualOverride: null,
    });
    expect(result.canonical).toMatchObject({
      favoredValueKey: 'Benevolence_Dependability',
      opposedValueKey: 'Achievement',
      direction: 'favor_second',
      strength: 'strong',
      normalizationApplied: true,
      normalizationReason: 'orientation_flipped',
    });
  });

  it('resolves the current job-choice numeric metadata shape behind the shared boundary', () => {
    const result = resolveTranscriptDecisionModel({
      decisionCode: null,
      decisionMetadata: {
        parseClass: 'exact',
        parsePath: 'numeric_deterministic',
        parserVersion: 'job-choice-v2',
        responseExcerpt: '**Strongly support taking the job with trust from other people** ...',
        matchedLabel: null,
      },
      definitionSnapshot: {
        dimensions: [{ name: 'Achievement' }, { name: 'Benevolence_Dependability' }],
        methodology: {
          presentation_order: 'A_first',
        },
      },
      orientationFlipped: true,
    });

    expect(result.raw).toMatchObject({
      parseClass: 'exact',
      parsePath: 'numeric_deterministic',
      parserVersion: 'job-choice-v2',
      matchedLabel: null,
    });
    expect(result.canonical).toMatchObject({
      favoredValueKey: 'Benevolence_Dependability',
      opposedValueKey: 'Achievement',
      direction: 'favor_second',
      strength: 'strong',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'deterministic',
    });
  });

  it('resolves the current job-choice text-label metadata shape behind the shared boundary', () => {
    const result = resolveTranscriptDecisionModel({
      decisionCode: null,
      decisionMetadata: {
        parseClass: 'exact',
        parsePath: 'text_label_leading',
        parserVersion: 'job-choice-v2',
        matchedLabel: 'Strongly support taking the job with trust from other people',
        responseExcerpt: 'Level of Support: Strongly support taking the job with trust from other people ...',
      },
      definitionSnapshot: {
        dimensions: [{ name: 'Achievement' }, { name: 'Benevolence_Dependability' }],
        methodology: {
          presentation_order: 'B_first',
        },
      },
      orientationFlipped: true,
    });

    expect(result.raw).toMatchObject({
      parseClass: 'exact',
      parsePath: 'text_label_leading',
      parserVersion: 'job-choice-v2',
      matchedLabel: 'Strongly support taking the job with trust from other people',
    });
    expect(result.canonical).toMatchObject({
      favoredValueKey: 'Benevolence_Dependability',
      opposedValueKey: 'Achievement',
      direction: 'favor_second',
      strength: 'strong',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'deterministic',
    });
  });

  it('resolves the current job-choice neutral metadata shape behind the shared boundary', () => {
    const result = resolveTranscriptDecisionModel({
      decisionCode: null,
      decisionMetadata: {
        parseClass: 'exact',
        parsePath: 'text_label_exact',
        parserVersion: 'job-choice-v2',
        matchedLabel: 'Neutral / Unsure',
        responseExcerpt: 'Neutral / Unsure Both choices are equally compelling ...',
      },
      definitionSnapshot: {
        dimensions: [{ name: 'Achievement' }, { name: 'Benevolence_Dependability' }],
        methodology: {
          presentation_order: 'A_first',
        },
      },
      orientationFlipped: false,
    });

    expect(result.raw).toMatchObject({
      parseClass: 'exact',
      parsePath: 'text_label_exact',
      parserVersion: 'job-choice-v2',
      matchedLabel: 'Neutral / Unsure',
    });
    expect(result.canonical).toMatchObject({
      favoredValueKey: null,
      opposedValueKey: null,
      direction: 'neutral',
      strength: 'neutral',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'deterministic',
    });
  });

  it('documents the surface read rules for the current migration boundary', () => {
    expect(DECISION_MODEL_READ_RULES).toEqual({
      api: { surface: 'api', defaultMode: 'v1', fallbackLayer: 'server_adapter' },
      web: { surface: 'web', defaultMode: 'v1', fallbackLayer: 'none' },
      worker: { surface: 'worker', defaultMode: 'v1', fallbackLayer: 'server_adapter' },
      export: { surface: 'export', defaultMode: 'v1', fallbackLayer: 'server_adapter' },
    });
  });

  it('resolves an exact first-side strong decision', () => {
    const result = resolveDecisionModel(buildInput(buildRaw()));
    expectCanonical(result.canonical, {
      favoredValueKey: 'Achievement',
      opposedValueKey: 'Benevolence_Dependability',
      direction: 'favor_first',
      strength: 'strong',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'deterministic',
    });
  });

  it('resolves an exact second-side lean decision', () => {
    const result = resolveDecisionModel(
      buildInput(
        buildRaw({
          matchedLabel: 'Benevolence_Dependability',
          parsePath: 'exact.favor_second.lean',
        }),
      ),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: 'Benevolence_Dependability',
      opposedValueKey: 'Achievement',
      direction: 'favor_second',
      strength: 'lean',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'deterministic',
    });
  });

  it('resolves a neutral decision', () => {
    const result = resolveDecisionModel(
      buildInput(
        buildRaw({
          matchedLabel: 'Achievement',
          parsePath: 'exact.neutral',
        }),
      ),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: null,
      opposedValueKey: null,
      direction: 'neutral',
      strength: 'neutral',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'deterministic',
    });
  });

  it('flips orientation for an exact decision', () => {
    const result = resolveDecisionModel(
      buildInput(
        buildRaw({
          matchedLabel: 'Achievement',
          parsePath: 'exact.favor_first.strong',
        }),
        { orientationFlipped: true },
      ),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: 'Benevolence_Dependability',
      opposedValueKey: 'Achievement',
      direction: 'favor_second',
      strength: 'strong',
      normalizationApplied: true,
      normalizationReason: 'orientation_flipped',
      source: 'deterministic',
    });
  });

  it('resolves a fallback-resolved decision', () => {
    const result = resolveDecisionModel(
      buildInput(
        buildRaw({
          parseClass: 'fallback_resolved',
          matchedLabel: 'Benevolence_Dependability',
          parsePath: 'fallback.favor_second.lean',
        }),
      ),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: 'Benevolence_Dependability',
      opposedValueKey: 'Achievement',
      direction: 'favor_second',
      strength: 'lean',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'deterministic',
    });
  });

  it('treats an ambiguous response as unknown', () => {
    const result = resolveDecisionModel(
      buildInput(
        buildRaw({
          parseClass: 'ambiguous',
          parsePath: 'exact.favor_first.strong',
        }),
      ),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: null,
      opposedValueKey: null,
      direction: 'unknown',
      strength: 'unknown',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'unknown',
    });
  });

  it('treats an unparseable response as unknown', () => {
    const result = resolveDecisionModel(
      buildInput(
        buildRaw({
          parseClass: 'unparseable',
          parsePath: 'text_label_ambiguous',
        }),
      ),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: null,
      opposedValueKey: null,
      direction: 'unknown',
      strength: 'unknown',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'unknown',
    });
  });

  it('lets a manual override replace an ambiguous response', () => {
    const result = resolveDecisionModel(
      buildInput(
        buildRaw({
          parseClass: 'ambiguous',
          manualOverride: buildManualOverride({
            previousValue: '2',
          }),
        }),
        {
          manualOverridePresent: true,
          manualOverrideDecision: {
            favoredValueKey: 'Achievement',
            opposedValueKey: 'Benevolence_Dependability',
            direction: 'favor_first',
            strength: 'lean',
          },
        },
      ),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: 'Achievement',
      opposedValueKey: 'Benevolence_Dependability',
      direction: 'favor_first',
      strength: 'lean',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'manual',
    });
  });

  it('lets a manual override replace an exact response', () => {
    const result = resolveDecisionModel(
      buildInput(
        buildRaw({
          parseClass: 'exact',
          parsePath: 'exact.favor_first.strong',
          manualOverride: buildManualOverride({
            previousValue: '5',
          }),
        }),
        {
          manualOverridePresent: true,
          manualOverrideDecision: {
            favoredValueKey: 'Benevolence_Dependability',
            opposedValueKey: 'Achievement',
            direction: 'favor_second',
            strength: 'strong',
          },
        },
      ),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: 'Benevolence_Dependability',
      opposedValueKey: 'Achievement',
      direction: 'favor_second',
      strength: 'strong',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'manual',
    });
  });

  it('returns unknown when pair metadata is missing', () => {
    const result = resolveDecisionModel(
      buildInput(buildRaw({ matchedLabel: 'Achievement' }), {
        pair: null,
        orientationFlipped: false,
      }),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: null,
      opposedValueKey: null,
      direction: 'unknown',
      strength: 'unknown',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'unknown',
    });
  });

  it('returns error when pair metadata is malformed, even with ambiguous evidence', () => {
    const result = resolveDecisionModel(
      buildInput(
        buildRaw({
          parseClass: 'ambiguous',
          matchedLabel: 'Achievement',
        }),
        {
          pair: {
            valueA: 'Achievement',
            valueB: 'Achievement',
          } as DecisionPair,
          orientationFlipped: false,
        },
      ),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: null,
      opposedValueKey: null,
      direction: 'unknown',
      strength: 'unknown',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'error',
    });
  });

  it('returns error for an invalid manual override', () => {
    const result = resolveDecisionModel(
      buildInput(
        buildRaw({
          manualOverride: buildManualOverride({
            previousValue: '5',
          }),
        }),
        {
          manualOverridePresent: true,
          manualOverrideDecision: {
            favoredValueKey: 'Achievement',
            opposedValueKey: 'Benevolence_Dependability',
            direction: 'favor_first',
            strength: 'neutral',
          } as CanonicalDecision,
        },
      ),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: null,
      opposedValueKey: null,
      direction: 'unknown',
      strength: 'unknown',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'error',
    });
  });

  it('lets a valid manual override win over conflicting raw legacy metadata', () => {
    const result = resolveDecisionModel(
      buildInput(
        buildRaw({
          parseClass: 'ambiguous',
          parsePath: 'text_label_ambiguous',
          matchedLabel: 'Benevolence_Dependability',
          manualOverride: buildManualOverride({
            previousValue: '1',
          }),
        }),
        {
          manualOverridePresent: true,
          manualOverrideDecision: {
            favoredValueKey: 'Achievement',
            opposedValueKey: 'Benevolence_Dependability',
            direction: 'favor_first',
            strength: 'strong',
          },
        },
      ),
    );
    expectCanonical(result.canonical, {
      favoredValueKey: 'Achievement',
      opposedValueKey: 'Benevolence_Dependability',
      direction: 'favor_first',
      strength: 'strong',
      normalizationApplied: false,
      normalizationReason: null,
      source: 'manual',
    });
  });

  it('paired batch regression: A_first and B_first both report the same canonical direction when the same value wins', () => {
    // In a paired batch, the same vignette is shown as A_first and B_first.
    // When Achievement wins in both runs, both should produce direction=favor_first.
    // Achievement label derived from JOB_CHOICE_VALUE_STATEMENTS body for 'achievement' token:
    // body = '[level] recognition of their expertise because of ...'
    // labelFromBody → 'taking the job with recognition of their expertise'
    const achievementLabel = 'Strongly support taking the job with recognition of their expertise';

    const aFirstResult = resolveTranscriptDecisionModel({
      decisionCode: null,
      decisionMetadata: {
        parseClass: 'exact',
        parsePath: 'text_label_leading',
        parserVersion: 'job-choice-v2',
        matchedLabel: achievementLabel,
        responseExcerpt: `Level of Support: ${achievementLabel}`,
      },
      definitionSnapshot: {
        dimensions: [{ name: 'Achievement' }, { name: 'Benevolence_Dependability' }],
        methodology: { presentation_order: 'A_first' },
      },
      orientationFlipped: false,
    });

    const bFirstResult = resolveTranscriptDecisionModel({
      decisionCode: null,
      decisionMetadata: {
        parseClass: 'exact',
        parsePath: 'text_label_leading',
        parserVersion: 'job-choice-v2',
        matchedLabel: achievementLabel,
        responseExcerpt: `Level of Support: ${achievementLabel}`,
      },
      definitionSnapshot: {
        dimensions: [{ name: 'Achievement' }, { name: 'Benevolence_Dependability' }],
        methodology: { presentation_order: 'B_first' },
      },
      orientationFlipped: true,
    });

    expect(aFirstResult.canonical.favoredValueKey).toBe('Achievement');
    expect(aFirstResult.canonical.direction).toBe('favor_first');

    // B_first run: Achievement wins → should also be favor_first (canonical first = Achievement from dimensions[0])
    expect(bFirstResult.canonical.favoredValueKey).toBe('Achievement');
    expect(bFirstResult.canonical.direction).toBe('favor_first');
    expect(bFirstResult.canonical.normalizationApplied).toBe(false);
  });
});
