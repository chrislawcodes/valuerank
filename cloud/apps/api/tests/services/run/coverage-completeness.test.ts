import { describe, expect, it } from 'vitest';
import {
  findMissingTranscriptKeys,
  normalizeSamplesPerScenario,
  type TranscriptKey,
} from '../../../src/services/run/coverage-completeness.js';

describe('coverage completeness helper', () => {
  it('normalizes invalid sample counts to 1', () => {
    expect(normalizeSamplesPerScenario(undefined)).toBe(1);
    expect(normalizeSamplesPerScenario(null)).toBe(1);
    expect(normalizeSamplesPerScenario(0)).toBe(1);
    expect(normalizeSamplesPerScenario(-1)).toBe(1);
    expect(normalizeSamplesPerScenario(1.5)).toBe(1);
    expect(normalizeSamplesPerScenario('foo')).toBe(1);
    expect(normalizeSamplesPerScenario(1)).toBe(1);
    expect(normalizeSamplesPerScenario(3)).toBe(3);
  });

  it('finds missing transcript keys across scenarios, models, and samples', () => {
    const existingTranscripts: TranscriptKey[] = [
      { scenarioId: 's1', modelId: 'm1', sampleIndex: 0 },
      { scenarioId: 's1', modelId: 'm1', sampleIndex: 1 },
      { scenarioId: 's2', modelId: 'm1', sampleIndex: 0 },
      { scenarioId: 's1', modelId: 'm2', sampleIndex: 0 },
    ];

    const missing = findMissingTranscriptKeys({
      scenarioIds: ['s1', 's2'],
      models: ['m1', 'm2'],
      samplesPerScenario: 2,
      existingTranscripts,
    });

    expect(missing).toEqual([
      { scenarioId: 's2', modelId: 'm1', sampleIndex: 1 },
      { scenarioId: 's1', modelId: 'm2', sampleIndex: 1 },
      { scenarioId: 's2', modelId: 'm2', sampleIndex: 0 },
      { scenarioId: 's2', modelId: 'm2', sampleIndex: 1 },
    ]);
  });

  it('returns an empty list when every expected transcript exists', () => {
    const missing = findMissingTranscriptKeys({
      scenarioIds: ['s1'],
      models: ['m1'],
      samplesPerScenario: 2,
      existingTranscripts: [
        { scenarioId: 's1', modelId: 'm1', sampleIndex: 0 },
        { scenarioId: 's1', modelId: 'm1', sampleIndex: 1 },
      ],
    });

    expect(missing).toEqual([]);
  });

  it('returns every expected key when no transcripts exist', () => {
    const missing = findMissingTranscriptKeys({
      scenarioIds: ['s1', 's2'],
      models: ['m1'],
      samplesPerScenario: 2,
      existingTranscripts: [],
    });

    expect(missing).toEqual([
      { scenarioId: 's1', modelId: 'm1', sampleIndex: 0 },
      { scenarioId: 's1', modelId: 'm1', sampleIndex: 1 },
      { scenarioId: 's2', modelId: 'm1', sampleIndex: 0 },
      { scenarioId: 's2', modelId: 'm1', sampleIndex: 1 },
    ]);
  });

  it('does not collide on colon-containing ids', () => {
    const missing = findMissingTranscriptKeys({
      scenarioIds: ['a:b', 'a'],
      models: ['c', 'b:c'],
      samplesPerScenario: 1,
      existingTranscripts: [{ scenarioId: 'a:b', modelId: 'c', sampleIndex: 0 }],
    });

    expect(missing).toEqual([
      { scenarioId: 'a', modelId: 'c', sampleIndex: 0 },
      { scenarioId: 'a:b', modelId: 'b:c', sampleIndex: 0 },
      { scenarioId: 'a', modelId: 'b:c', sampleIndex: 0 },
    ]);
  });
});
