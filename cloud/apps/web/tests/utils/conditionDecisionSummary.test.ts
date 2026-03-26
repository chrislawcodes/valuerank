import { describe, expect, it } from 'vitest';
import type { Transcript } from '../../src/api/operations/runs';
import { summarizeConditionDecisionBuckets } from '../../src/utils/conditionDecisionSummary';

function createTranscript(
  id: string,
  decisionCode: string | null,
  presentationOrder: 'A_first' | 'B_first' = 'A_first',
): Transcript {
  const firstValueKey = presentationOrder === 'A_first' ? 'Freedom' : 'Harmony';
  const secondValueKey = presentationOrder === 'A_first' ? 'Harmony' : 'Freedom';

  const decisionModelV2 = decisionCode === '5'
    ? {
        raw: {
          matchedText: 'Freedom',
          matchedLabel: 'Freedom',
          parseClass: 'exact',
          parsePath: 'exact.favor_first.strong',
          parserVersion: 'v1',
          responseExcerpt: 'Freedom',
          manualOverride: null,
        },
        canonical: {
          favoredValueKey: firstValueKey,
          opposedValueKey: secondValueKey,
          direction: 'favor_first',
          strength: 'strong',
          normalizationApplied: false,
          normalizationReason: null,
          source: 'deterministic',
        },
        legacy: {
          rawScore: 5,
          canonicalScore: 5,
        },
      }
    : decisionCode === '4'
      ? {
          raw: {
            matchedText: 'Freedom',
            matchedLabel: 'Freedom',
            parseClass: 'exact',
            parsePath: 'exact.favor_first.lean',
            parserVersion: 'v1',
            responseExcerpt: 'Freedom',
            manualOverride: null,
          },
          canonical: {
            favoredValueKey: firstValueKey,
            opposedValueKey: secondValueKey,
            direction: 'favor_first',
            strength: 'lean',
            normalizationApplied: false,
            normalizationReason: null,
            source: 'deterministic',
          },
          legacy: {
            rawScore: 4,
            canonicalScore: 4,
          },
        }
      : decisionCode === '3'
        ? {
            raw: {
              matchedText: null,
              matchedLabel: null,
              parseClass: 'exact',
              parsePath: 'exact.neutral.neutral',
              parserVersion: 'v1',
              responseExcerpt: null,
              manualOverride: null,
            },
            canonical: {
              favoredValueKey: null,
              opposedValueKey: null,
              direction: 'neutral',
              strength: 'neutral',
              normalizationApplied: false,
              normalizationReason: null,
              source: 'deterministic',
            },
            legacy: {
              rawScore: 3,
              canonicalScore: 3,
            },
          }
        : decisionCode === '2'
          ? {
              raw: {
                matchedText: 'Harmony',
                matchedLabel: 'Harmony',
                parseClass: 'exact',
                parsePath: 'exact.favor_second.lean',
                parserVersion: 'v1',
                responseExcerpt: 'Harmony',
                manualOverride: null,
              },
              canonical: {
                favoredValueKey: secondValueKey,
                opposedValueKey: firstValueKey,
                direction: 'favor_second',
                strength: 'lean',
                normalizationApplied: false,
                normalizationReason: null,
                source: 'deterministic',
              },
              legacy: {
                rawScore: 2,
                canonicalScore: 2,
              },
            }
          : decisionCode === '1'
            ? {
                raw: {
                  matchedText: 'Harmony',
                  matchedLabel: 'Harmony',
                  parseClass: 'exact',
                  parsePath: 'exact.favor_second.strong',
                  parserVersion: 'v1',
                  responseExcerpt: 'Harmony',
                  manualOverride: null,
                },
                canonical: {
                  favoredValueKey: secondValueKey,
                  opposedValueKey: firstValueKey,
                  direction: 'favor_second',
                  strength: 'strong',
                  normalizationApplied: false,
                  normalizationReason: null,
                  source: 'deterministic',
                },
                legacy: {
                  rawScore: 1,
                  canonicalScore: 1,
                },
              }
            : null;

  return {
    id,
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'gpt-4',
    modelVersion: 'gpt-4-0125-preview',
    content: { turns: [] },
    decisionCode,
    decisionCodeSource: 'llm',
    decisionMetadata: null,
    turnCount: 2,
    tokenCount: 100,
    durationMs: 1500,
    estimatedCost: null,
    createdAt: '2024-01-15T10:00:00Z',
    lastAccessedAt: null,
    decisionModelV2,
  };
}

describe('conditionDecisionSummary', () => {
  it('builds canonical buckets in a stable order with derived labels', () => {
    const summary = summarizeConditionDecisionBuckets([
      createTranscript('t-1', '5', 'A_first'),
      createTranscript('t-2', '4', 'A_first'),
      createTranscript('t-3', '3', 'A_first'),
      createTranscript('t-4', '2', 'A_first'),
      createTranscript('t-5', '1', 'A_first'),
      createTranscript('t-6', null, 'A_first'),
    ]);

    expect(summary.labelPair).toEqual({
      firstValueLabel: 'Freedom',
      secondValueLabel: 'Harmony',
    });
    expect(summary.knownCount).toBe(5);
    expect(summary.unknownCount).toBe(1);
    expect(summary.totalCount).toBe(6);
    expect(summary.buckets.map((bucket) => `${bucket.key}:${bucket.label}:${bucket.count}`)).toEqual([
      'strong_first:Strongly favors Freedom:1',
      'lean_first:Somewhat favors Freedom:1',
      'neutral:Neutral:1',
      'lean_second:Somewhat favors Harmony:1',
      'strong_second:Strongly favors Harmony:1',
      'unknown:Unknown:1',
    ]);
  });

  it('keeps explicit unknown handling when no renderable transcripts are available', () => {
    const summary = summarizeConditionDecisionBuckets([
      createTranscript('t-1', null),
      createTranscript('t-2', null),
    ]);

    expect(summary.labelPair).toBeNull();
    expect(summary.knownCount).toBe(0);
    expect(summary.unknownCount).toBe(2);
    expect(summary.buckets.map((bucket) => `${bucket.key}:${bucket.label}:${bucket.count}`)).toEqual([
      'strong_first:Strongly favors canonical first value:0',
      'lean_first:Somewhat favors canonical first value:0',
      'neutral:Neutral:0',
      'lean_second:Somewhat favors canonical second value:0',
      'strong_second:Strongly favors canonical second value:0',
      'unknown:Unknown:2',
    ]);
  });
});
