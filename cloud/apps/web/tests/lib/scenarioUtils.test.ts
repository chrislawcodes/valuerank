import { describe, expect, it } from 'vitest';
import type { Transcript } from '../../src/api/operations/runs';
import {
  buildNormalizedScenarioDimensionsMap,
  filterTranscriptsForPivotCell,
  getScenarioDimensionsForId,
  normalizeModelId,
  normalizeScenarioId,
} from '../../src/utils/scenarioUtils';

function makeTranscript(overrides: Partial<Transcript>): Transcript {
  return {
    id: 't-1',
    runId: 'run-1',
    scenarioId: 'scenario-a',
    modelId: 'claude-sonnet-4-5',
    modelVersion: null,
    content: {},
    turnCount: 1,
    tokenCount: 100,
    durationMs: 1000,
    estimatedCost: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastAccessedAt: null,
    ...overrides,
  };
}

describe('scenarioUtils', () => {
  it('normalizes scenario and model ids', () => {
    expect(normalizeScenarioId('scenario-abc123')).toBe('abc123');
    expect(normalizeScenarioId('db://scenario-abc123')).toBe('abc123');
    expect(normalizeModelId('anthropic:claude-sonnet-4-5')).toBe('claude-sonnet-4-5');
  });

  it('resolves scenario dimensions by raw and normalized scenario ids', () => {
    const scenarioDimensions = {
      'scenario-a': { power: '1', conformity: '1' },
      b: { power: '2', conformity: '1' },
    };
    const normalizedMap = buildNormalizedScenarioDimensionsMap(scenarioDimensions);

    expect(getScenarioDimensionsForId('scenario-a', scenarioDimensions, normalizedMap)).toEqual({
      power: '1',
      conformity: '1',
    });
    expect(getScenarioDimensionsForId('a', scenarioDimensions, normalizedMap)).toEqual({
      power: '1',
      conformity: '1',
    });
  });

  it('filters transcripts with exact and normalized scenario/model matches', () => {
    const transcripts = [
      makeTranscript({ id: 't-1', scenarioId: 'scenario-a', modelId: 'anthropic:claude-sonnet-4-5', decisionCode: '3' }),
      makeTranscript({ id: 't-2', scenarioId: 'a', modelId: 'claude-sonnet-4-5', decisionCode: 'other' }),
      makeTranscript({ id: 't-3', scenarioId: 'scenario-b', modelId: 'claude-sonnet-4-5', decisionCode: '3' }),
    ];

    const filtered = filterTranscriptsForPivotCell({
      transcripts,
      scenarioDimensions: {
        'scenario-a': { power: '1', conformity: '1' },
        'scenario-b': { power: '2', conformity: '1' },
      },
      rowDim: 'power',
      colDim: 'conformity',
      row: '1',
      col: '1',
      selectedModel: 'claude-sonnet-4-5',
    });

    expect(filtered.map((t) => t.id)).toEqual(['t-1', 't-2']);
  });

  it('filters transcripts by favoredValueKey and decisionStrength when provided', () => {
    const transcripts = [
      makeTranscript({
        id: 'strong-first',
        scenarioId: 'scenario-a',
        modelId: 'claude-sonnet-4-5',
        decisionCode: '5',
        decisionModelV2: {
          raw: {
            matchedText: null,
            matchedLabel: null,
            parseClass: 'exact',
            parsePath: null,
            parserVersion: null,
            responseExcerpt: null,
            manualOverride: null,
          },
          canonical: {
            favoredValueKey: 'conformity_interpersonal',
            opposedValueKey: 'achievement',
            direction: 'favor_first',
            strength: 'strong',
            normalizationApplied: false,
            normalizationReason: null,
            source: 'deterministic',
          },
          legacy: { rawScore: 5, canonicalScore: 5 },
        },
      }),
      makeTranscript({
        id: 'strong-second',
        scenarioId: 'scenario-a',
        modelId: 'claude-sonnet-4-5',
        decisionCode: '1', // raw score matches canonical score (no flip)
        decisionModelV2: {
          raw: {
            matchedText: null,
            matchedLabel: null,
            parseClass: 'exact',
            parsePath: null,
            parserVersion: null,
            responseExcerpt: null,
            manualOverride: null,
          },
          canonical: {
            favoredValueKey: 'achievement',
            opposedValueKey: 'conformity_interpersonal',
            direction: 'favor_second',
            strength: 'strong',
            normalizationApplied: false,
            normalizationReason: null,
            source: 'deterministic',
          },
          legacy: { rawScore: 1, canonicalScore: 1 },
        },
      }),
      makeTranscript({
        id: 'lean-first',
        scenarioId: 'scenario-a',
        modelId: 'claude-sonnet-4-5',
        decisionCode: '4',
        decisionModelV2: {
          raw: {
            matchedText: null,
            matchedLabel: null,
            parseClass: 'exact',
            parsePath: null,
            parserVersion: null,
            responseExcerpt: null,
            manualOverride: null,
          },
          canonical: {
            favoredValueKey: 'conformity_interpersonal',
            opposedValueKey: 'achievement',
            direction: 'favor_first',
            strength: 'lean',
            normalizationApplied: false,
            normalizationReason: null,
            source: 'deterministic',
          },
          legacy: { rawScore: 4, canonicalScore: 4 },
        },
      }),
    ];

    const filtered = filterTranscriptsForPivotCell({
      transcripts,
      scenarioDimensions: { 'scenario-a': { power: '1', conformity: '1' } },
      rowDim: 'power',
      colDim: 'conformity',
      row: '1',
      col: '1',
      selectedModel: 'claude-sonnet-4-5',
      favoredValueKey: 'conformity_interpersonal',
      decisionStrength: 'strong',
    });

    expect(filtered.map((t) => t.id)).toEqual(['strong-first']);
  });

  it('matches unknown transcripts when decisionStrength is unknown', () => {
    const transcripts = [
      makeTranscript({
        id: 'known',
        scenarioId: 'scenario-a',
        modelId: 'claude-sonnet-4-5',
        decisionCode: '5',
        decisionModelV2: {
          raw: {
            matchedText: null,
            matchedLabel: null,
            parseClass: 'exact',
            parsePath: null,
            parserVersion: null,
            responseExcerpt: null,
            manualOverride: null,
          },
          canonical: {
            favoredValueKey: 'conformity_interpersonal',
            opposedValueKey: 'achievement',
            direction: 'favor_first',
            strength: 'strong',
            normalizationApplied: false,
            normalizationReason: null,
            source: 'deterministic',
          },
          legacy: { rawScore: 5, canonicalScore: 5 },
        },
      }),
      makeTranscript({
        id: 'unresolved-v2',
        scenarioId: 'scenario-a',
        modelId: 'claude-sonnet-4-5',
        decisionCode: 'other',
        decisionModelV2: null,
      }),
      makeTranscript({
        id: 'unknown-canonical',
        scenarioId: 'scenario-a',
        modelId: 'claude-sonnet-4-5',
        decisionCode: '3',
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
          legacy: { rawScore: null, canonicalScore: null },
        },
      }),
    ];

    const filtered = filterTranscriptsForPivotCell({
      transcripts,
      scenarioDimensions: { 'scenario-a': { power: '1', conformity: '1' } },
      rowDim: 'power',
      colDim: 'conformity',
      row: '1',
      col: '1',
      selectedModel: 'claude-sonnet-4-5',
      decisionStrength: 'unknown',
    });

    expect(filtered.map((t) => t.id)).toEqual(['unresolved-v2', 'unknown-canonical']);
  });

  it('returns empty when required pivot parameters are missing', () => {
    const filtered = filterTranscriptsForPivotCell({
      transcripts: [makeTranscript({ id: 't-1' })],
      scenarioDimensions: {
        'scenario-a': { power: '1', conformity: '1' },
      },
      rowDim: '',
      colDim: 'conformity',
      row: '1',
      col: '1',
      selectedModel: '',
    });

    expect(filtered).toEqual([]);
  });
});
