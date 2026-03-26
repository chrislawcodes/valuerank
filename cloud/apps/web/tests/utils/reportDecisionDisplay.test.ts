import { describe, expect, it } from 'vitest';
import type { Transcript } from '../../src/api/operations/runs';
import { summarizeReportTranscriptDecisions } from '../../src/utils/reportDecisionDisplay';

function createTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: 'transcript-1',
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'gpt-4',
    modelVersion: 'gpt-4-0125-preview',
    content: { turns: [] },
    decisionCode: '3',
    decisionCodeSource: 'llm',
    decisionMetadata: null,
    turnCount: 2,
    tokenCount: 100,
    durationMs: 1500,
    estimatedCost: null,
    createdAt: '2024-01-15T10:00:00Z',
    lastAccessedAt: null,
    ...overrides,
  };
}

function createRenderableTranscript(
  id: string,
  overrides: Partial<NonNullable<Transcript['decisionModelV2']>> = {},
): Transcript {
  return createTranscript({
    id,
    decisionModelV2: {
      raw: {
        matchedText: 'Achievement',
        matchedLabel: 'Achievement',
        parseClass: 'exact',
        parsePath: 'exact.favor_second.strong',
        parserVersion: 'v1',
        responseExcerpt: 'Achievement',
        manualOverride: null,
        ...overrides.raw,
      },
      canonical: {
        favoredValueKey: 'Benevolence_Dependability',
        opposedValueKey: 'Achievement',
        direction: 'favor_second',
        strength: 'strong',
        normalizationApplied: true,
        normalizationReason: 'orientation_flipped',
        source: 'deterministic',
        ...overrides.canonical,
      },
      legacy: {
        rawScore: null,
        canonicalScore: null,
        ...overrides.legacy,
      },
    },
  });
}

describe('reportDecisionDisplay', () => {
  it('returns an empty state for no transcripts', () => {
    const summary = summarizeReportTranscriptDecisions([]);

    expect(summary).toEqual({
      headline: '—',
      totalCount: 0,
      renderableCount: 0,
      unknownCount: 0,
      buckets: [],
    });
  });

  it('selects a strict-majority canonical headline from renderable transcripts only', () => {
    const summary = summarizeReportTranscriptDecisions([
      createRenderableTranscript('renderable-1'),
      createRenderableTranscript('renderable-2'),
      createRenderableTranscript('renderable-3', {
        canonical: {
          favoredValueKey: 'Achievement',
          opposedValueKey: 'Benevolence_Dependability',
          direction: 'favor_first',
          strength: 'lean',
          normalizationApplied: false,
          normalizationReason: null,
          source: 'deterministic',
        },
        raw: {
          matchedText: 'Achievement',
          matchedLabel: 'Achievement',
          parseClass: 'exact',
          parsePath: 'exact.favor_first.lean',
          parserVersion: 'v1',
          responseExcerpt: 'Achievement',
          manualOverride: null,
        },
        legacy: {
          rawScore: null,
          canonicalScore: null,
        },
      }),
    ]);

    expect(summary.headline).toBe('Strongly favors Benevolence Dependability');
    expect(summary.renderableCount).toBe(3);
    expect(summary.unknownCount).toBe(0);
    expect(summary.buckets.map((bucket) => `${bucket.kind}:${bucket.label}:${bucket.count}`)).toEqual([
      'strong:Strongly favors Benevolence Dependability:2',
      'lean:Somewhat favors Achievement:1',
    ]);
  });

  it('returns mixed when renderable transcripts split without a strict majority', () => {
    const summary = summarizeReportTranscriptDecisions([
      createRenderableTranscript('strong-1'),
      createRenderableTranscript('lean-1', {
        canonical: {
          favoredValueKey: 'Achievement',
          opposedValueKey: 'Benevolence_Dependability',
          direction: 'favor_first',
          strength: 'lean',
          normalizationApplied: false,
          normalizationReason: null,
          source: 'deterministic',
        },
        raw: {
          matchedText: 'Achievement',
          matchedLabel: 'Achievement',
          parseClass: 'exact',
          parsePath: 'exact.favor_first.lean',
          parserVersion: 'v1',
          responseExcerpt: 'Achievement',
          manualOverride: null,
        },
        legacy: {
          rawScore: null,
          canonicalScore: null,
        },
      }),
    ]);

    expect(summary.headline).toBe('Mixed');
    expect(summary.buckets.map((bucket) => bucket.label)).toEqual([
      'Strongly favors Benevolence Dependability',
      'Somewhat favors Achievement',
    ]);
  });

  it('throws when canonical decision-model-v2 data is missing', () => {
    expect(() =>
      summarizeReportTranscriptDecisions([
        createRenderableTranscript('renderable-1'),
        createTranscript({ id: 'legacy-1', decisionModelV2: null }),
      ])
    ).toThrow(/reportDecisionDisplay helper requires canonical decision-model-v2 data for transcript legacy-1/);
  });

  it('throws when canonical decision-model-v2 data is not renderable', () => {
    expect(() =>
      summarizeReportTranscriptDecisions([
        createTranscript({
          id: 'malformed-1',
          decisionModelV2: {
            raw: {
              matchedText: null,
              matchedLabel: null,
              parseClass: 'unparseable',
              parsePath: null,
              parserVersion: null,
              responseExcerpt: null,
              manualOverride: null,
            },
            canonical: {
              favoredValueKey: null,
              opposedValueKey: null,
              direction: 'unknown',
              strength: 'unknown',
              normalizationApplied: false,
              normalizationReason: null,
              source: 'unknown',
            },
            legacy: {
              rawScore: null,
              canonicalScore: null,
            },
          },
        }),
      ])
    ).toThrow(/reportDecisionDisplay helper requires canonical decision-model-v2 data for transcript malformed-1/);
  });
});
