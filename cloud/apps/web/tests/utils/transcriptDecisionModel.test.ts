import { describe, expect, it } from 'vitest';
import type { Transcript } from '../../src/api/operations/runs';
import {
  CanonicalTranscriptRenderError,
  assertReportTranscriptDecisionModelV2,
  formatCanonicalDecisionHeadline,
  getTranscriptDecisionAuditBadge,
  getTranscriptDecisionDisplayMode,
  getTranscriptDecisionSortValue,
  hasReportTranscriptDecisionModelV2,
  hasTranscriptDecisionModelV2,
  requireRenderableTranscriptDecisionModelV2,
} from '../../src/utils/transcriptDecisionModel';

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

type TranscriptDecisionModelV2FixtureOverrides = {
  raw?: Partial<NonNullable<Transcript['decisionModelV2']>['raw']>;
  canonical?: Partial<NonNullable<Transcript['decisionModelV2']>['canonical']>;
  legacy?: Partial<NonNullable<Transcript['decisionModelV2']>['legacy']>;
};

function createRenderableV2Transcript(
  overrides: TranscriptDecisionModelV2FixtureOverrides = {},
): NonNullable<Transcript['decisionModelV2']> {
  return {
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
      ...overrides.legacy,
    },
  };
}

describe('transcriptDecisionModel', () => {
  it('treats empty transcript sets as legacy', () => {
    expect(getTranscriptDecisionDisplayMode([])).toBe('legacy');
  });

  it('treats partial or empty V2 envelopes as legacy', () => {
    const transcript = createTranscript({
      decisionModelV2: {
        raw: { parseClass: 'exact' } as NonNullable<Transcript['decisionModelV2']>['raw'],
        canonical: null,
        legacy: null,
      } as NonNullable<Transcript['decisionModelV2']>,
    });

    expect(hasTranscriptDecisionModelV2(transcript)).toBe(false);
    expect(getTranscriptDecisionDisplayMode([transcript])).toBe('legacy');
  });

  it.each([
    {
      label: 'missing envelope',
      transcript: createTranscript({ decisionModelV2: null }),
    },
    {
      label: 'empty envelope',
      transcript: createTranscript({ decisionModelV2: {} as NonNullable<Transcript['decisionModelV2']> }),
    },
    {
      label: 'null subfields',
      transcript: createTranscript({
        decisionModelV2: {
          raw: null,
          canonical: null,
          legacy: null,
        } as NonNullable<Transcript['decisionModelV2']>,
      }),
    },
    {
      label: 'invalid canonical direction',
      transcript: createTranscript({
        decisionModelV2: createRenderableV2Transcript({
          canonical: {
            direction: 'unknown',
            strength: 'strong',
          },
        }),
      }),
    },
    {
      label: 'invalid canonical strength',
      transcript: createTranscript({
        decisionModelV2: createRenderableV2Transcript({
          canonical: {
            direction: 'favor_first',
            strength: 'unknown',
          },
        }),
      }),
    },
    {
      label: 'bad raw parse class',
      transcript: createTranscript({
        decisionModelV2: createRenderableV2Transcript({
          raw: {
            parseClass: '' as never,
          },
        }),
      }),
    },
  ])('rejects malformed V2 envelopes: $label', ({ transcript }) => {
    expect(() => requireRenderableTranscriptDecisionModelV2(transcript, 'DomainAnalysisValueDetail page'))
      .toThrow(CanonicalTranscriptRenderError);
    expect(hasTranscriptDecisionModelV2(transcript)).toBe(false);
  });

  it('switches to audit mode only when every transcript has a renderable V2 envelope', () => {
    const renderable = createTranscript({ decisionModelV2: createRenderableV2Transcript() });
    const legacy = createTranscript({ id: 'transcript-2', decisionModelV2: null });

    expect(hasTranscriptDecisionModelV2(renderable)).toBe(true);
    expect(getTranscriptDecisionDisplayMode([renderable])).toBe('audit');
    expect(getTranscriptDecisionDisplayMode([renderable, legacy])).toBe('legacy');
  });

  it('treats an explicit unknown canonical envelope as report-renderable', () => {
    const transcript = createTranscript({
      decisionModelV2: createRenderableV2Transcript({
        canonical: {
          favoredValueKey: null,
          opposedValueKey: null,
          direction: 'unknown',
          strength: 'unknown',
          normalizationApplied: false,
          normalizationReason: null,
          source: 'unknown',
        },
        raw: {
          matchedText: null,
          matchedLabel: null,
          parseClass: 'unparseable',
          parsePath: null,
          parserVersion: null,
          responseExcerpt: null,
          manualOverride: null,
        },
      }),
    });

    expect(hasReportTranscriptDecisionModelV2(transcript)).toBe(true);
    expect(() => assertReportTranscriptDecisionModelV2(transcript)).not.toThrow();
  });

  it('rejects partial canonical envelopes that are missing required fields', () => {
    const transcript = createTranscript({
      decisionModelV2: {
        raw: {
          parseClass: 'exact',
        } as NonNullable<Transcript['decisionModelV2']>['raw'],
        canonical: {
          favoredValueKey: null,
          opposedValueKey: null,
          direction: 'favor_first',
          strength: 'strong',
          normalizationApplied: false,
          normalizationReason: null,
          source: 'deterministic',
        } as NonNullable<Transcript['decisionModelV2']>['canonical'],
        legacy: null,
      } as NonNullable<Transcript['decisionModelV2']>,
    });

    expect(hasReportTranscriptDecisionModelV2(transcript)).toBe(false);
    expect(() => assertReportTranscriptDecisionModelV2(transcript)).toThrow(
      /Survey results require canonical decision-model-v2 data/,
    );
  });

  it('prefers the manual badge over fallback metadata', () => {
    const transcript = createTranscript({
      decisionModelV2: createRenderableV2Transcript({
        raw: {
          parseClass: 'fallback_resolved',
          manualOverride: {
            previousValue: '1',
            overriddenAt: '2024-01-15T12:00:00Z',
            overriddenByUserId: 'user-1',
          },
        },
      }),
    });

    expect(getTranscriptDecisionAuditBadge(transcript)).toBe('Manual');
  });

  it('hides the badge for exact deterministic transcripts', () => {
    const transcript = createTranscript({ decisionModelV2: createRenderableV2Transcript() });

    expect(getTranscriptDecisionAuditBadge(transcript)).toBeNull();
    expect(formatCanonicalDecisionHeadline(transcript)).toBe('Strongly supports Benevolence Dependability');
  });

  it('uses canonical audit sort order instead of legacy canonical scores', () => {
    const transcript = createTranscript({
      decisionModelV2: createRenderableV2Transcript({
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
          },
      }),
    });

    expect(getTranscriptDecisionSortValue(transcript, 'audit')).toBe(0);
  });
});
