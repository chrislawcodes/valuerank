import { describe, expect, it } from 'vitest';
import {
  extractValuePair,
  getCoverageBatchGroupId,
  getCoverageBatchIncrement,
  selectPrimaryDefinitionCount,
  selectPrimaryDefinitionCounts,
} from '../domain-coverage-utils.js';

describe('extractValuePair', () => {
  it('normalizes lowercase dimension names to canonical coverage keys', () => {
    expect(
      extractValuePair({
        dimensions: [
          { name: 'achievement' },
          { name: 'benevolence_dependability' },
        ],
      }),
    ).toEqual({
      valueA: 'Achievement',
      valueB: 'Benevolence_Dependability',
    });
  });

  it('preserves already-canonical keys', () => {
    expect(
      extractValuePair({
        dimensions: [
          { name: 'Self_Direction_Action' },
          { name: 'Universalism_Nature' },
        ],
      }),
    ).toEqual({
      valueA: 'Self_Direction_Action',
      valueB: 'Universalism_Nature',
    });
  });

  it('returns dimension order regardless of methodology', () => {
    expect(
      extractValuePair({
        dimensions: [
          { name: 'achievement' },
          { name: 'benevolence_dependability' },
        ],
        methodology: {},
      }),
    ).toEqual({
      valueA: 'Achievement',
      valueB: 'Benevolence_Dependability',
    });
  });

  it('rejects definitions that do not resolve to known coverage keys', () => {
    expect(
      extractValuePair({
        dimensions: [
          { name: 'achievement' },
          { name: 'not_a_real_dimension' },
        ],
      }),
    ).toBeNull();
  });
});

describe('selectPrimaryDefinitionCount', () => {
  it('uses the primary definition count without summing sibling definitions', () => {
    const counts = new Map<string, number>([
      ['def-a', 2],
      ['def-b', 1],
    ]);

    expect(selectPrimaryDefinitionCount(['def-a', 'def-b'], counts)).toEqual({
      primaryDefinitionId: 'def-a',
      batchCount: 2,
    });
  });

  it('returns zero for an empty definition list', () => {
    expect(selectPrimaryDefinitionCount([], new Map())).toEqual({
      primaryDefinitionId: null,
      batchCount: 0,
    });
  });
});

describe('selectPrimaryDefinitionCounts', () => {
  it('returns the total cell counts while choosing a stable primary definition', () => {
    const batchCounts = new Map<string, number>([
      ['def-a', 2],
      ['def-b', 2],
    ]);
    const pairedCounts = new Map<string, number>([
      ['def-a', 1],
      ['def-b', 3],
    ]);

    expect(selectPrimaryDefinitionCounts(['def-a', 'def-b'], batchCounts, pairedCounts)).toEqual({
      primaryDefinitionId: 'def-b',
      batchCount: 4,
      pairedBatchCount: 4,
    });
  });

  it('prefers the higher paired count when batch counts tie', () => {
    const batchCounts = new Map<string, number>([
      ['def-a', 2],
      ['def-b', 2],
    ]);
    const pairedCounts = new Map<string, number>([
      ['def-a', 1],
      ['def-b', 3],
    ]);

    expect(selectPrimaryDefinitionCounts(['def-a', 'def-b'], batchCounts, pairedCounts)).toEqual({
      primaryDefinitionId: 'def-b',
      batchCount: 4,
      pairedBatchCount: 4,
    });
  });

  it('returns zero for an empty definition list', () => {
    expect(selectPrimaryDefinitionCounts([], new Map(), new Map())).toEqual({
      primaryDefinitionId: null,
      batchCount: 0,
      pairedBatchCount: 0,
    });
  });

  it('deduplicates shared group IDs across companion definitions', () => {
    // A_first and B_first definitions share the same paired batch group IDs
    const batchCounts = new Map<string, number>([
      ['def-a-first', 5],
      ['def-b-first', 5],
    ]);
    const pairedCounts = new Map<string, number>([
      ['def-a-first', 3],
      ['def-b-first', 3],
    ]);
    const groupIds = new Map<string, Set<string>>([
      ['def-a-first', new Set(['group-1', 'group-2', 'group-3'])],
      ['def-b-first', new Set(['group-1', 'group-2', 'group-3'])],
    ]);

    // Without dedup: 3 + 3 = 6. With dedup: 3 unique groups.
    expect(selectPrimaryDefinitionCounts(
      ['def-a-first', 'def-b-first'], batchCounts, pairedCounts, groupIds,
    )).toEqual({
      primaryDefinitionId: 'def-a-first',
      batchCount: 10,
      pairedBatchCount: 3,
    });
  });

  it('counts ungrouped runs separately from grouped runs', () => {
    const batchCounts = new Map<string, number>([
      ['def-a', 3],
    ]);
    // pairedBatchCount = 2 grouped + 1 ungrouped = 3
    const pairedCounts = new Map<string, number>([
      ['def-a', 3],
    ]);
    const groupIds = new Map<string, Set<string>>([
      ['def-a', new Set(['group-1', 'group-2'])],
    ]);

    expect(selectPrimaryDefinitionCounts(
      ['def-a'], batchCounts, pairedCounts, groupIds,
    )).toEqual({
      primaryDefinitionId: 'def-a',
      batchCount: 3,
      pairedBatchCount: 3, // 2 grouped + 1 ungrouped
    });
  });

  it('deduplicates with samplesPerScenario increments across companions', () => {
    // 3 paired batch groups shared across A_first and B_first.
    // Group 1: sps=1, Group 2: sps=1, Group 3: sps=3 → total 5 batches per side.
    const batchCounts = new Map<string, number>([
      ['def-a-first', 10],
      ['def-b-first', 10],
    ]);
    const pairedCounts = new Map<string, number>([
      ['def-a-first', 5],
      ['def-b-first', 5],
    ]);
    const groupIds = new Map<string, Set<string>>([
      ['def-a-first', new Set(['group-1', 'group-2', 'group-3'])],
      ['def-b-first', new Set(['group-1', 'group-2', 'group-3'])],
    ]);
    const increments = new Map<string, Map<string, number>>([
      ['def-a-first', new Map([['group-1', 1], ['group-2', 1], ['group-3', 3]])],
      ['def-b-first', new Map([['group-1', 1], ['group-2', 1], ['group-3', 3]])],
    ]);

    // Without dedup: 5 + 5 = 10. With dedup: 1+1+3 = 5 (max increment per group).
    expect(selectPrimaryDefinitionCounts(
      ['def-a-first', 'def-b-first'], batchCounts, pairedCounts, groupIds, increments,
    )).toEqual({
      primaryDefinitionId: 'def-a-first',
      batchCount: 20,
      pairedBatchCount: 5,
    });
  });
});

describe('getCoverageBatchIncrement', () => {

  it('returns samplesPerScenario when it is a valid positive integer', () => {
    expect(getCoverageBatchIncrement(5)).toBe(5);
  });

  it('returns 1 when samplesPerScenario is 1', () => {
    expect(getCoverageBatchIncrement(1)).toBe(1);
  });

  it('falls back to 1 when config is null (entire config null)', () => {
    const value = (null as { samplesPerScenario?: unknown } | null)?.samplesPerScenario;
    expect(getCoverageBatchIncrement(value)).toBe(1);
  });

  it('falls back to 1 when samplesPerScenario is absent from config', () => {
    expect(getCoverageBatchIncrement(undefined)).toBe(1);
  });

  it('falls back to 1 when samplesPerScenario is null', () => {
    expect(getCoverageBatchIncrement(null)).toBe(1);
  });

  it('falls back to 1 when samplesPerScenario is a string', () => {
    expect(getCoverageBatchIncrement('5')).toBe(1);
  });

  it('falls back to 1 when samplesPerScenario is a float', () => {
    expect(getCoverageBatchIncrement(1.5)).toBe(1);
  });

  it('falls back to 1 when samplesPerScenario is 0', () => {
    expect(getCoverageBatchIncrement(0)).toBe(1);
  });

  it('falls back to 1 when samplesPerScenario is negative', () => {
    expect(getCoverageBatchIncrement(-10)).toBe(1);
  });

  it('falls back to 1 when samplesPerScenario is NaN', () => {
    expect(getCoverageBatchIncrement(NaN)).toBe(1);
  });

  it('falls back to 1 when samplesPerScenario is Infinity', () => {
    expect(getCoverageBatchIncrement(Infinity)).toBe(1);
  });

  it('falls back to 1 when samplesPerScenario is -Infinity', () => {
    expect(getCoverageBatchIncrement(-Infinity)).toBe(1);
  });

  it('sums correctly across multiple runs for the same definition (5+5=10)', () => {
    const batchCountByDefinitionId = new Map<string, number>();
    const defId = 'def-1';
    for (const samplesPerScenario of [5, 5]) {
      const increment = getCoverageBatchIncrement(samplesPerScenario);
      batchCountByDefinitionId.set(defId, (batchCountByDefinitionId.get(defId) ?? 0) + increment);
    }
    expect(batchCountByDefinitionId.get(defId)).toBe(10);
  });

  it('sums correctly when one run has samplesPerScenario=5 and one has null (5+1=6)', () => {
    const batchCountByDefinitionId = new Map<string, number>();
    const defId = 'def-2';
    for (const samplesPerScenario of [5, null]) {
      const increment = getCoverageBatchIncrement(samplesPerScenario);
      batchCountByDefinitionId.set(defId, (batchCountByDefinitionId.get(defId) ?? 0) + increment);
    }
    expect(batchCountByDefinitionId.get(defId)).toBe(6);
  });
});

describe('getCoverageBatchGroupId', () => {
  it('prefers jobChoiceBatchGroupId when present', () => {
    expect(
      getCoverageBatchGroupId({
        jobChoiceBatchGroupId: 'job-choice-group',
        pairedBatchGroupId: 'paired-group',
      }),
    ).toBe('job-choice-group');
  });

  it('falls back to pairedBatchGroupId when jobChoiceBatchGroupId is absent', () => {
    expect(
      getCoverageBatchGroupId({
        pairedBatchGroupId: 'paired-group',
      }),
    ).toBe('paired-group');
  });

  it('trims whitespace from the selected batch-group id', () => {
    expect(
      getCoverageBatchGroupId({
        jobChoiceBatchGroupId: '  group-id  ',
      }),
    ).toBe('group-id');
  });

  it('returns null when both batch-group ids are missing or blank', () => {
    expect(getCoverageBatchGroupId({})).toBeNull();
    expect(getCoverageBatchGroupId({ jobChoiceBatchGroupId: '   ' })).toBeNull();
  });
});
