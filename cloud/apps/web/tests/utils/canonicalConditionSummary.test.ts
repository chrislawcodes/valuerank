import { describe, expect, it } from 'vitest';
import type { Transcript } from '../../src/api/operations/runs';
import { summarizeCanonicalConditionTranscripts } from '../../src/utils/canonicalConditionSummary';

function createTranscript(
  id: string,
  direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown',
  strength: 'strong' | 'lean' | 'neutral' | 'unknown',
): Transcript {
  return {
    id,
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'model-1',
    modelVersion: null,
    content: {},
    decisionCode: null,
    decisionCodeSource: null,
    decisionMetadata: null,
    turnCount: 4,
    tokenCount: 100,
    durationMs: 500,
    estimatedCost: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastAccessedAt: null,
    dimensionValues: null,
    decisionModelV2: direction === 'unknown'
      ? null
      : {
          raw: {
            matchedText: 'test',
            matchedLabel: 'test',
            parseClass: 'exact',
            parsePath: 'exact',
            parserVersion: 'job-choice-v2',
            responseExcerpt: null,
            manualOverride: null,
          },
          canonical: {
            favoredValueKey: direction === 'favor_first' ? 'value-a' : direction === 'favor_second' ? 'value-b' : null,
            opposedValueKey: direction === 'favor_first' ? 'value-b' : direction === 'favor_second' ? 'value-a' : null,
            direction,
            strength,
            normalizationApplied: false,
            normalizationReason: null,
            source: 'deterministic',
          },
          legacy: {
            },
        },
  } as Transcript;
}

// Creates a transcript where favoredValueKey and direction disagree:
// direction='favor_first' would have caused old code to bucket as 'strongly',
// but favoredValueKey='value-b' is alphabetically second → should be opponentStrongly.
function createTranscriptKeysMismatch(id: string): Transcript {
  return {
    id,
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'model-1',
    modelVersion: null,
    content: {},
    decisionCode: null,
    decisionCodeSource: null,
    decisionMetadata: null,
    turnCount: 4,
    tokenCount: 100,
    durationMs: 500,
    estimatedCost: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastAccessedAt: null,
    dimensionValues: null,
    decisionModelV2: {
      raw: {
        matchedText: 'test',
        matchedLabel: 'test',
        parseClass: 'exact',
        parsePath: 'exact',
        parserVersion: 'job-choice-v2',
        responseExcerpt: null,
        manualOverride: null,
      },
      canonical: {
        favoredValueKey: 'value-b',
        opposedValueKey: 'value-a',
        direction: 'favor_first', // contradicts alphabetical order intentionally
        strength: 'strong',
        normalizationApplied: false,
        normalizationReason: null,
        source: 'deterministic',
      },
      legacy: {
        },
    },
  } as Transcript;
}

function createStrongSelected(id: string) {
  return createTranscript(id, 'favor_first', 'strong');
}

function createSomewhatSelected(id: string) {
  return createTranscript(id, 'favor_first', 'lean');
}

function createStrongOpponent(id: string) {
  return createTranscript(id, 'favor_second', 'strong');
}

function createSomewhatOpponent(id: string) {
  return createTranscript(id, 'favor_second', 'lean');
}

describe('summarizeCanonicalConditionTranscripts', () => {
  it('empty input → all null metrics, isOpponent false', () => {
    const result = summarizeCanonicalConditionTranscripts([]);
    expect(result.selectedValueWinRate).toBeNull();
    expect(result.isOpponent).toBe(false);
    expect(result.totalTrials).toBe(0);
    expect(result).not.toHaveProperty('meanPreferenceScore');
    expect(result).not.toHaveProperty('opponentMeanPreferenceScore');
    expect(result).not.toHaveProperty('displayScore');
  });

  it('null selectedValueWinRate falls back to false for isOpponent', () => {
    const result = summarizeCanonicalConditionTranscripts([
      createTranscript('t1', 'unknown', 'unknown'),
    ]);
    expect(result.selectedValueWinRate).toBeNull();
    expect(result.isOpponent).toBe(false);
  });

  it('all-unknown input → totalTrials 0, selectedValueWinRate null', () => {
    const transcripts = [
      createTranscript('t1', 'unknown', 'unknown'),
      createTranscript('t2', 'unknown', 'unknown'),
      createTranscript('t3', 'unknown', 'unknown'),
    ];
    const result = summarizeCanonicalConditionTranscripts(transcripts);
    expect(result.unknownCount).toBe(3);
    expect(result.totalTrials).toBe(0);
    expect(result.selectedValueWinRate).toBeNull();
    expect(result.isOpponent).toBe(false);
  });

  it('all strongly selected → selectedValueWinRate 100%, isOpponent false (blue)', () => {
    const transcripts = [
      createStrongSelected('t1'),
      createStrongSelected('t2'),
      createStrongSelected('t3'),
      createStrongSelected('t4'),
      createStrongSelected('t5'),
    ];
    const result = summarizeCanonicalConditionTranscripts(transcripts);
    expect(result.strongly).toBe(5);
    expect(result.selectedValueWinRate).toBeCloseTo(1.0);
    expect(result.isOpponent).toBe(false);
  });

  it('all somewhat selected → selectedValueWinRate 100%, isOpponent false (blue)', () => {
    const transcripts = [
      createSomewhatSelected('t1'),
      createSomewhatSelected('t2'),
      createSomewhatSelected('t3'),
      createSomewhatSelected('t4'),
      createSomewhatSelected('t5'),
    ];
    const result = summarizeCanonicalConditionTranscripts(transcripts);
    expect(result.somewhat).toBe(5);
    expect(result.selectedValueWinRate).toBeCloseTo(1.0);
    expect(result.isOpponent).toBe(false);
  });

  it('keeps selected-side win rate at 100% when the chosen side is mixed', () => {
    const allStrong = summarizeCanonicalConditionTranscripts([
      createStrongSelected('t1'),
      createStrongSelected('t2'),
      createStrongSelected('t3'),
    ]);
    const allSomewhat = summarizeCanonicalConditionTranscripts([
      createSomewhatSelected('t4'),
      createSomewhatSelected('t5'),
      createSomewhatSelected('t6'),
    ]);
    expect(allStrong.selectedValueWinRate).toBeCloseTo(1.0);
    expect(allSomewhat.selectedValueWinRate).toBeCloseTo(1.0);
  });

  it('all strongly opponent → selectedValueWinRate 0%, isOpponent true (orange)', () => {
    const transcripts = [
      createStrongOpponent('t1'),
      createStrongOpponent('t2'),
      createStrongOpponent('t3'),
      createStrongOpponent('t4'),
      createStrongOpponent('t5'),
    ];
    const result = summarizeCanonicalConditionTranscripts(transcripts);
    expect(result.opponentStrongly).toBe(5);
    expect(result.selectedValueWinRate).toBeCloseTo(0.0);
    expect(result.isOpponent).toBe(true);
  });

  it('all somewhat opponent → selectedValueWinRate 0%, isOpponent true (orange)', () => {
    const transcripts = [
      createSomewhatOpponent('t1'),
      createSomewhatOpponent('t2'),
      createSomewhatOpponent('t3'),
      createSomewhatOpponent('t4'),
      createSomewhatOpponent('t5'),
    ];
    const result = summarizeCanonicalConditionTranscripts(transcripts);
    expect(result.opponentSomewhat).toBe(5);
    expect(result.selectedValueWinRate).toBeCloseTo(0.0);
    expect(result.isOpponent).toBe(true);
  });

  it('mixed: 3 opponentStrongly + 1 opponentSomewhat + 1 neutral = selectedValueWinRate 0% (orange)', () => {
    const transcripts = [
      createStrongOpponent('t1'),
      createStrongOpponent('t2'),
      createStrongOpponent('t3'),
      createSomewhatOpponent('t4'),
      createTranscript('t5', 'neutral', 'neutral'),
    ];
    const result = summarizeCanonicalConditionTranscripts(transcripts);
    expect(result.selectedValueWinRate).toBeCloseTo(0.0);
    expect(result.isOpponent).toBe(true);
  });

  it('tie (1 strongly selected + 1 strongly opponent) → selectedValueWinRate 50%, isOpponent false (neutral)', () => {
    const transcripts = [
      createStrongSelected('t1'),
      createStrongOpponent('t2'),
    ];
    const result = summarizeCanonicalConditionTranscripts(transcripts);
    expect(result.selectedValueWinRate).toBeCloseTo(0.5);
    expect(result.isOpponent).toBe(false);
  });

  it('favoredValueKey alphabetically second (value-b) buckets as opponentStrongly — direction field ignored', () => {
    // This transcript has direction='favor_first' but favoredValueKey='value-b' (> 'value-a').
    // Old direction-based code would have bucketed this as 'strongly' (blue).
    // New alphabetical code must bucket it as 'opponentStrongly' (orange).
    const transcripts = [createTranscriptKeysMismatch('t1')];
    const result = summarizeCanonicalConditionTranscripts(transcripts);
    expect(result.opponentStrongly).toBe(1);
    expect(result.strongly).toBe(0);
    expect(result.selectedValueWinRate).toBeCloseTo(0.0);
    expect(result.isOpponent).toBe(true);
  });
});
