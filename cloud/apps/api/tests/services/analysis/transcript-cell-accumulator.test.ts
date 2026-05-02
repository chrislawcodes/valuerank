import { describe, expect, it } from 'vitest';
import { accumulateTranscriptCells, encodeCellKey, type TranscriptForAccumulation } from '../../../src/services/analysis/transcript-cell-accumulator.js';

const FIRST_VALUE = 'Achievement';
const SECOND_VALUE = 'Security_Personal';

function buildDefinitionSnapshot(valueFirstToken = FIRST_VALUE, valueSecondToken = SECOND_VALUE): unknown {
  return {
    components: {
      value_first: { token: valueFirstToken },
      value_second: { token: valueSecondToken },
    },
    dimensions: [
      {
        name: valueFirstToken,
        levels: [
          { score: 1, label: '1' },
          { score: 2, label: '2' },
        ],
      },
      {
        name: valueSecondToken,
        levels: [
          { score: 1, label: '1' },
          { score: 2, label: '2' },
        ],
      },
    ],
  };
}

function buildTranscript(overrides: Partial<TranscriptForAccumulation> & { runId: string }): TranscriptForAccumulation {
  return {
    id: 't-1',
    runId: overrides.runId,
    modelId: 'm1',
    decisionMetadata: { parseClass: 'exact', parsePath: 'exact.favor_first.strong', matchedLabel: FIRST_VALUE },
    definitionSnapshot: buildDefinitionSnapshot(),
    deletedAt: null,
    scenario: {
      id: 'scenario-1',
      content: {
        dimensionValues: {
          [FIRST_VALUE]: 1,
          [SECOND_VALUE]: 2,
        },
      },
      orientationFlipped: false,
      deletedAt: null,
    },
    ...overrides,
  };
}

describe('accumulateTranscriptCells', () => {
  it('records mirrored wins and losses for a winning transcript', () => {
    const transcript = buildTranscript({ runId: 'run-1' });
    const cellMap = accumulateTranscriptCells({
      transcripts: [transcript],
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
    });

    expect(cellMap.get(encodeCellKey({
      definitionId: 'def1',
      modelId: 'm1',
      valueKey: FIRST_VALUE,
      ownLevel: 1,
      opponentLevel: 2,
    }))).toEqual({ wins: 1, losses: 0, neutrals: 0 });
    expect(cellMap.get(encodeCellKey({
      definitionId: 'def1',
      modelId: 'm1',
      valueKey: SECOND_VALUE,
      ownLevel: 2,
      opponentLevel: 1,
    }))).toEqual({ wins: 0, losses: 1, neutrals: 0 });
  });

  it('records mirrored neutrals for a neutral transcript', () => {
    const transcript = buildTranscript({
      runId: 'run-1',
      decisionMetadata: { parseClass: 'exact', parsePath: 'exact.neutral', matchedLabel: FIRST_VALUE },
    });
    const cellMap = accumulateTranscriptCells({
      transcripts: [transcript],
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
    });

    expect(cellMap.get(encodeCellKey({
      definitionId: 'def1',
      modelId: 'm1',
      valueKey: FIRST_VALUE,
      ownLevel: 1,
      opponentLevel: 2,
    }))).toEqual({ wins: 0, losses: 0, neutrals: 1 });
    expect(cellMap.get(encodeCellKey({
      definitionId: 'def1',
      modelId: 'm1',
      valueKey: SECOND_VALUE,
      ownLevel: 2,
      opponentLevel: 1,
    }))).toEqual({ wins: 0, losses: 0, neutrals: 1 });
  });

  it('skips transcripts with unknown directions', () => {
    const transcript = buildTranscript({
      runId: 'run-1',
      decisionMetadata: { parseClass: 'ambiguous', parsePath: 'exact.ambiguous' },
    });
    const cellMap = accumulateTranscriptCells({
      transcripts: [transcript],
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
    });

    expect(cellMap.size).toBe(0);
  });

  it('skips deleted transcripts', () => {
    const transcript = buildTranscript({ runId: 'run-1', deletedAt: new Date('2025-01-01T00:00:00.000Z') });
    const cellMap = accumulateTranscriptCells({
      transcripts: [transcript],
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
    });

    expect(cellMap.size).toBe(0);
  });

  it('skips transcripts with no scenario', () => {
    const transcript = buildTranscript({ runId: 'run-1', scenario: null });
    const cellMap = accumulateTranscriptCells({
      transcripts: [transcript],
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
    });

    expect(cellMap.size).toBe(0);
  });

  it('skips deleted scenarios', () => {
    const transcript = buildTranscript({
      runId: 'run-1',
      scenario: {
        id: 'scenario-1',
        content: {
          dimensionValues: {
            [FIRST_VALUE]: 1,
            [SECOND_VALUE]: 2,
          },
        },
        orientationFlipped: false,
        deletedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    });
    const cellMap = accumulateTranscriptCells({
      transcripts: [transcript],
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
    });

    expect(cellMap.size).toBe(0);
  });

  it('skips transcripts whose runId is not in scope', () => {
    const transcript = buildTranscript({ runId: 'run-1' });
    const cellMap = accumulateTranscriptCells({
      transcripts: [transcript],
      filteredSourceRunDefinitionById: new Map([['run-2', 'def1']]),
    });

    expect(cellMap.size).toBe(0);
  });

  it('returns an empty map for an empty transcript list', () => {
    const cellMap = accumulateTranscriptCells({
      transcripts: [],
      filteredSourceRunDefinitionById: new Map(),
    });

    expect(cellMap.size).toBe(0);
  });

  it('skips transcripts with invalid value tokens', () => {
    const transcript = buildTranscript({
      runId: 'run-1',
      definitionSnapshot: buildDefinitionSnapshot(FIRST_VALUE, 'NotAValueKey'),
    });
    const cellMap = accumulateTranscriptCells({
      transcripts: [transcript],
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
    });

    expect(cellMap.size).toBe(0);
  });

  it('normalizes lowercase token names in definitionSnapshot to canonical PascalCase', () => {
    const lowercaseFirst = FIRST_VALUE.toLowerCase();
    const lowercaseSecond = SECOND_VALUE.toLowerCase();
    const transcript = buildTranscript({
      runId: 'run-1',
      definitionSnapshot: buildDefinitionSnapshot(lowercaseFirst, lowercaseSecond),
      scenario: {
        id: 'scenario-1',
        content: {
          dimensionValues: {
            [lowercaseFirst]: 1,
            [lowercaseSecond]: 2,
          },
        },
        orientationFlipped: false,
        deletedAt: null,
      },
    });
    const cellMap = accumulateTranscriptCells({
      transcripts: [transcript],
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
    });

    expect(cellMap.size).toBe(2);
    expect(cellMap.get(encodeCellKey({
      definitionId: 'def1',
      modelId: 'm1',
      valueKey: FIRST_VALUE,
      ownLevel: 1,
      opponentLevel: 2,
    }))).toEqual({ wins: 1, losses: 0, neutrals: 0 });
    expect(cellMap.get(encodeCellKey({
      definitionId: 'def1',
      modelId: 'm1',
      valueKey: SECOND_VALUE,
      ownLevel: 2,
      opponentLevel: 1,
    }))).toEqual({ wins: 0, losses: 1, neutrals: 0 });
  });
});
