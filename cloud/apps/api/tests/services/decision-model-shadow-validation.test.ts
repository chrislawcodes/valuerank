import { describe, expect, it } from 'vitest';
import { buildDecisionModelShadowValidationReport } from '../../src/services/decision-model-shadow-validation.js';

function makeDefinitionSnapshot(presentationOrder: 'A_first' | 'B_first' = 'A_first') {
  return {
    dimensions: [{ name: 'achievement' }, { name: 'benevolence_dependability' }],
    methodology: {
      presentation_order: presentationOrder,
    },
  };
}

function makeTranscript(overrides: Record<string, unknown>) {
  return {
    transcriptId: 'default',
    runId: 'run-1',
    modelId: 'model-1',
    scenarioId: 'scenario-1',
    decisionCode: '5',
    decisionMetadata: {
      matchedLabel: 'Achievement',
      parseClass: 'exact',
      parsePath: 'exact.favor_first.strong',
      parserVersion: 'parser-1',
      responseExcerpt: 'Achievement',
    },
    definitionSnapshot: makeDefinitionSnapshot('A_first'),
    orientationFlipped: false,
    ...overrides,
  };
}

describe('buildDecisionModelShadowValidationReport', () => {
  it('counts validation buckets and mismatched scalar compatibility deterministically', () => {
    const report = buildDecisionModelShadowValidationReport(
      [
        makeTranscript({
          transcriptId: 'exact-match',
        }),
        makeTranscript({
          transcriptId: 'fallback-match',
          decisionCode: '4',
          decisionMetadata: {
            matchedLabel: 'Achievement',
            parseClass: 'fallback_resolved',
            parsePath: 'fallback.favor_first.lean',
            parserVersion: 'parser-1',
            responseExcerpt: 'Achievement',
          },
        }),
        makeTranscript({
          transcriptId: 'ambiguous',
          decisionCode: '3',
          decisionMetadata: {
            matchedLabel: 'Achievement',
            parseClass: 'ambiguous',
            parsePath: 'exact.ambiguous',
            parserVersion: 'parser-1',
            responseExcerpt: 'maybe achievement',
          },
        }),
        makeTranscript({
          transcriptId: 'unparseable',
          decisionCode: null,
          decisionMetadata: {
            matchedLabel: null,
            parseClass: 'unparseable',
            parsePath: 'unparseable',
            parserVersion: 'parser-1',
            responseExcerpt: '???',
          },
        }),
        makeTranscript({
          transcriptId: 'missing-metadata',
          definitionSnapshot: null,
        }),
        makeTranscript({
          transcriptId: 'mismatch',
          decisionCode: '1',
        }),
      ],
      new Date('2026-03-23T12:00:00.000Z'),
    );

    expect(report.generatedAt).toBe('2026-03-23T12:00:00.000Z');
    expect(report.transcriptCount).toBe(6);
    expect(report.exactCount).toBe(2);
    expect(report.fallbackResolvedCount).toBe(1);
    expect(report.ambiguousCount).toBe(1);
    expect(report.unparseableCount).toBe(1);
    expect(report.missingMetadataCount).toBe(1);
    expect(report.comparisonEligibleCount).toBe(0);
    expect(report.comparisonMismatchCount).toBe(0);

    expect(report.bucketExemplars.exact[0]?.transcriptId).toBe('exact-match');
    expect(report.bucketExemplars.fallback_resolved[0]?.transcriptId).toBe('fallback-match');
    expect(report.bucketExemplars.ambiguous[0]?.transcriptId).toBe('ambiguous');
    expect(report.bucketExemplars.unparseable[0]?.transcriptId).toBe('unparseable');
    expect(report.bucketExemplars.missing_metadata[0]?.transcriptId).toBe('missing-metadata');
    expect(report.comparisonMismatchExemplars).toHaveLength(0);
    expect(report.transcripts.find((entry) => entry.transcriptId === 'mismatch')?.comparison).toEqual({
      legacyScore: null,
      v2Score: null,
      matches: null,
    });
  });

  it('treats rows with no comparable legacy or v2 scalar as non-comparable', () => {
    const report = buildDecisionModelShadowValidationReport(
      [
        makeTranscript({
          transcriptId: 'non-comparable',
          decisionCode: null,
          decisionMetadata: {
            matchedLabel: 'Achievement',
            parseClass: 'unparseable',
            parsePath: 'unparseable',
            parserVersion: 'parser-1',
            responseExcerpt: '???',
          },
        }),
      ],
      new Date('2026-03-23T12:00:00.000Z'),
    );

    expect(report.transcriptCount).toBe(1);
    expect(report.unparseableCount).toBe(1);
    expect(report.comparisonEligibleCount).toBe(0);
    expect(report.comparisonMismatchCount).toBe(0);
    expect(report.transcripts[0]?.comparison).toEqual({
      legacyScore: null,
      v2Score: null,
      matches: null,
    });
  });
});
