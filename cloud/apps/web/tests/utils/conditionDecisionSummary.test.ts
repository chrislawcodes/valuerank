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
                  },
              }
            : null;

  return {
    id,
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'gpt-4',
    modelVersion: 'gpt-4-0125-preview',
    content: {
      turns: [],
      decisionCode: decisionCode ?? '5',
      decision: decisionCode ?? '5',
      score: decisionCode ?? '5',
      summary: {
        decisionCode: decisionCode ?? '5',
        decision: decisionCode ?? '5',
        score: decisionCode ?? '5',
      },
    },
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
      firstValueKey: 'Freedom',
      firstValueLabel: 'Freedom',
      secondValueKey: 'Harmony',
      secondValueLabel: 'Harmony',
    });
    expect(summary.knownCount).toBe(5);
    expect(summary.unknownCount).toBe(1);
    expect(summary.totalCount).toBe(6);
    expect(summary.buckets.map((bucket) => `${bucket.label}:${bucket.count}`)).toEqual([
      'Strongly favors Freedom:1',
      'Somewhat favors Freedom:1',
      'Neutral:1',
      'Somewhat favors Harmony:1',
      'Strongly favors Harmony:1',
      'Unknown:1',
    ]);
    expect(summary.buckets[0].filterParams).toEqual({ decisionStrength: 'strong', favoredValueKey: 'Freedom' });
    expect(summary.buckets[5].filterParams).toEqual({ decisionStrength: 'unknown' });
  });

  it('resolves labels alphabetically regardless of which run the transcript came from', () => {
    // t-1 is from a B_first companion run: favoredValueKey='Harmony' (alphabetically second)
    // t-2, t-3 are from A_first runs: favoredValueKey='Freedom' (alphabetically first)
    // Label pair is always Freedom/Harmony by alphabetical order, independent of presentation order.
    const summary = summarizeConditionDecisionBuckets([
      createTranscript('t-1', '5', 'B_first'),
      createTranscript('t-2', '5', 'A_first'),
      createTranscript('t-3', '5', 'A_first'),
    ]);

    expect(summary.labelPair).toEqual({
      firstValueKey: 'Freedom',
      firstValueLabel: 'Freedom',
      secondValueKey: 'Harmony',
      secondValueLabel: 'Harmony',
    });
    expect(summary.buckets.map((bucket) => `${bucket.label}:${bucket.count}`)).toEqual([
      'Strongly favors Freedom:2',
      'Somewhat favors Freedom:0',
      'Neutral:0',
      'Somewhat favors Harmony:0',
      'Strongly favors Harmony:1',
      'Unknown:0',
    ]);
  });

  it('Harmony wins on B_first run → canonical second bucket, firstValueLabel=Freedom — direction field ignored', () => {
    // All transcripts are from a B_first companion run: firstValueKey=Harmony, secondValueKey=Freedom.
    // decisionCode='5' → favoredValueKey='Harmony', direction='favor_first'.
    // Old direction-based code would have bucketed these as the wrong side (wrong: Harmony labeled blue).
    // New alphabetical code: 'Harmony'.localeCompare('Freedom') > 0 → Harmony is canonical second ✓
    const summary = summarizeConditionDecisionBuckets([
      createTranscript('t-1', '5', 'B_first'),
      createTranscript('t-2', '5', 'B_first'),
      createTranscript('t-3', '5', 'B_first'),
    ]);

    expect(summary.labelPair).toEqual({
      firstValueKey: 'Freedom',
      firstValueLabel: 'Freedom',
      secondValueKey: 'Harmony',
      secondValueLabel: 'Harmony',
    });
    expect(summary.buckets.map((bucket) => `${bucket.label}:${bucket.count}`)).toEqual([
      'Strongly favors Freedom:0',
      'Somewhat favors Freedom:0',
      'Neutral:0',
      'Somewhat favors Harmony:0',
      'Strongly favors Harmony:3',
      'Unknown:0',
    ]);
  });

  it('keeps explicit unknown handling when no renderable transcripts are available, even with legacy score fields present', () => {
    const summary = summarizeConditionDecisionBuckets([
      createTranscript('t-1', null),
      createTranscript('t-2', null),
    ]);

    expect(summary.labelPair).toBeNull();
    expect(summary.knownCount).toBe(0);
    expect(summary.unknownCount).toBe(2);
    expect(summary.buckets.map((bucket) => `${bucket.label}:${bucket.count}`)).toEqual([
      'Strongly favors canonical first value:0',
      'Somewhat favors canonical first value:0',
      'Neutral:0',
      'Somewhat favors canonical second value:0',
      'Strongly favors canonical second value:0',
      'Unknown:2',
    ]);
  });
});
