import { describe, expect, it } from 'vitest';
import {
  findMissingTranscriptKeys,
  isRunComplete,
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

describe('isRunComplete', () => {
  const fullSlots = (
    scenarios: string[],
    models: string[],
    samples: number,
  ): TranscriptKey[] => {
    const out: TranscriptKey[] = [];
    for (const scenarioId of scenarios) {
      for (const modelId of models) {
        for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
          out.push({ scenarioId, modelId, sampleIndex });
        }
      }
    }
    return out;
  };

  it('returns true when every (scenario × model × sample) slot has a transcript', () => {
    expect(
      isRunComplete({
        scenarioIds: ['s1', 's2'],
        models: ['m1', 'm2'],
        samplesPerScenario: 1,
        existingTranscripts: fullSlots(['s1', 's2'], ['m1', 'm2'], 1),
      }),
    ).toBe(true);
  });

  it('returns false when one slot is missing', () => {
    const all = fullSlots(['s1', 's2'], ['m1', 'm2'], 1);
    expect(
      isRunComplete({
        scenarioIds: ['s1', 's2'],
        models: ['m1', 'm2'],
        samplesPerScenario: 1,
        existingTranscripts: all.slice(0, -1), // drop last
      }),
    ).toBe(false);
  });

  it('returns true when extras exist alongside full coverage (duplicates do not break completeness)', () => {
    // Adversarial case: a slot has a duplicate but every slot is still covered.
    // Per spec, only missing slots break completeness; extras are bonus samples.
    const all = fullSlots(['s1'], ['m1'], 1);
    const withDuplicate = [...all, { scenarioId: 's1', modelId: 'm1', sampleIndex: 0 }];
    expect(
      isRunComplete({
        scenarioIds: ['s1'],
        models: ['m1'],
        samplesPerScenario: 1,
        existingTranscripts: withDuplicate,
      }),
    ).toBe(true);
  });

  it('returns false for the right-total-wrong-slots case', () => {
    // Same total transcript count as expected, but one slot has 2 and another
    // has 0 -- completeness must catch this.
    const transcripts: TranscriptKey[] = [
      { scenarioId: 's1', modelId: 'm1', sampleIndex: 0 },
      { scenarioId: 's1', modelId: 'm1', sampleIndex: 0 }, // duplicate of above
      // s2/m1/0 is missing -- gap masked by the duplicate at the count level
    ];
    expect(
      isRunComplete({
        scenarioIds: ['s1', 's2'],
        models: ['m1'],
        samplesPerScenario: 1,
        existingTranscripts: transcripts,
      }),
    ).toBe(false);
  });

  it('rejects vacuous completeness when zero scenarios are expected', () => {
    expect(
      isRunComplete({
        scenarioIds: [],
        models: ['m1'],
        samplesPerScenario: 1,
        existingTranscripts: [],
      }),
    ).toBe(false);
  });

  it('rejects vacuous completeness when zero models are expected', () => {
    expect(
      isRunComplete({
        scenarioIds: ['s1'],
        models: [],
        samplesPerScenario: 1,
        existingTranscripts: [],
      }),
    ).toBe(false);
  });

  it('counts samplesPerScenario>1 correctly: every (scenario × model × sample) slot must be filled', () => {
    expect(
      isRunComplete({
        scenarioIds: ['s1'],
        models: ['m1'],
        samplesPerScenario: 3,
        existingTranscripts: fullSlots(['s1'], ['m1'], 3),
      }),
    ).toBe(true);
    expect(
      isRunComplete({
        scenarioIds: ['s1'],
        models: ['m1'],
        samplesPerScenario: 3,
        existingTranscripts: fullSlots(['s1'], ['m1'], 2),
      }),
    ).toBe(false);
  });

  it('normalizes invalid samplesPerScenario to 1', () => {
    expect(
      isRunComplete({
        scenarioIds: ['s1'],
        models: ['m1'],
        samplesPerScenario: 0,
        existingTranscripts: fullSlots(['s1'], ['m1'], 1),
      }),
    ).toBe(true);
  });
});
