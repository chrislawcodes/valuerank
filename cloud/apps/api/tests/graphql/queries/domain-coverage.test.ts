import { describe, expect, it, vi } from 'vitest';
import {
  extractValuePair,
  getCoverageBatchGroupId,
  getCoverageBatchIncrement,
  getCoverageDirection,
  selectPrimaryDefinitionCount,
  selectPrimaryDefinitionCounts,
  computePerModelTrialCounts,
  deduplicateRunsByGroupId,
} from '../../../src/graphql/queries/domain-coverage-utils.js';

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

describe('computePerModelTrialCounts', () => {
  const labels = new Map([
    ['model-a', 'Model A'],
    ['model-b', 'Model B'],
  ]);

  it('returns null breakdown when defaultModelIds is empty', () => {
    const result = computePerModelTrialCounts([], [], labels);
    expect(result).toEqual({ minTrialCount: null, maxTrialCount: null, modelBreakdown: null });
  });

  it('counts transcripts for each default model across ungrouped runs', () => {
    const runs = [
      { config: { samplesPerScenario: 1 }, transcripts: [{ modelId: 'model-a' }, { modelId: 'model-b' }] },
      { config: { samplesPerScenario: 1 }, transcripts: [{ modelId: 'model-a' }] },
    ];
    const result = computePerModelTrialCounts(runs, ['model-a', 'model-b'], labels);
    expect(result.minTrialCount).toBe(1); // model-b only appeared in 1 run
    expect(result.maxTrialCount).toBe(2); // model-a appeared in 2 runs
    expect(result.modelBreakdown).toEqual([
      { modelId: 'model-a', label: 'Model A', trialCount: 2 },
      { modelId: 'model-b', label: 'Model B', trialCount: 1 },
    ]);
  });

  it('counts paired runs as-is - caller must dedup via deduplicateRunsByGroupId first', () => {
    // computePerModelTrialCounts does NOT deduplicate. The call site is responsible.
    // This test documents the contract: duplicate group IDs are counted twice here.
    const runs = [
      { config: { jobChoiceBatchGroupId: 'group-1', samplesPerScenario: 1 }, transcripts: [{ modelId: 'model-a' }] },
      { config: { jobChoiceBatchGroupId: 'group-1', samplesPerScenario: 1 }, transcripts: [{ modelId: 'model-a' }] },
    ];
    const result = computePerModelTrialCounts(runs, ['model-a'], labels);
    expect(result.minTrialCount).toBe(2); // both counted - caller didn't dedup
  });

  it('counts every transcript row, not the planned samplesPerScenario value', () => {
    // Trial count reflects actual transcripts so the displayed number matches
    // what the aggregate analysis pipeline consumes. samplesPerScenario is
    // ignored at this layer -- it's only used by batchCount, which counts
    // intent rather than reality.
    const runs = [
      {
        config: { jobChoiceBatchGroupId: 'g1', samplesPerScenario: 5 },
        // Five real transcripts -> five trials.
        transcripts: [
          { modelId: 'model-a' }, { modelId: 'model-a' }, { modelId: 'model-a' },
          { modelId: 'model-a' }, { modelId: 'model-a' },
        ],
      },
    ];
    const result = computePerModelTrialCounts(runs, ['model-a'], labels);
    expect(result.minTrialCount).toBe(5);
  });

  it('counts duplicate transcripts as separate trials (matches analysis pipeline)', () => {
    // When the worker double-fires on the same (run, scenario, model, sample)
    // slot, both transcripts land in the DB and the aggregate analysis treats
    // them as independent samples. Trial count must reflect that.
    const runs = [
      {
        config: { samplesPerScenario: 1 },
        transcripts: [{ modelId: 'model-a' }, { modelId: 'model-a' }],
      },
    ];
    const result = computePerModelTrialCounts(runs, ['model-a'], labels);
    expect(result.minTrialCount).toBe(2);
  });

  it('ignores transcripts whose model is not in defaultModelIds', () => {
    const runs = [
      {
        config: { samplesPerScenario: 1 },
        transcripts: [
          { modelId: 'model-a' },
          { modelId: 'model-c' }, // not in defaults
          { modelId: 'model-b' },
        ],
      },
    ];
    const result = computePerModelTrialCounts(runs, ['model-a', 'model-b'], labels);
    expect(result.modelBreakdown).toEqual([
      { modelId: 'model-a', label: 'Model A', trialCount: 1 },
      { modelId: 'model-b', label: 'Model B', trialCount: 1 },
    ]);
  });
});

describe('deduplicateRunsByGroupId', () => {
  it('removes duplicate paired runs sharing the same group ID', () => {
    const runs = [
      { config: { jobChoiceBatchGroupId: 'group-1' }, transcripts: [] },
      { config: { jobChoiceBatchGroupId: 'group-1' }, transcripts: [] }, // duplicate
      { config: { jobChoiceBatchGroupId: 'group-2' }, transcripts: [] },
    ];
    expect(deduplicateRunsByGroupId(runs)).toHaveLength(2);
  });

  it('keeps all ungrouped runs regardless', () => {
    const runs = [
      { config: {}, transcripts: [] },
      { config: {}, transcripts: [] },
      { config: { jobChoiceBatchGroupId: 'group-1' }, transcripts: [] },
    ];
    expect(deduplicateRunsByGroupId(runs)).toHaveLength(3);
  });

  it('handles mixed grouped and ungrouped runs', () => {
    const runs = [
      { config: { jobChoiceBatchGroupId: 'g1' }, transcripts: [] },
      { config: { jobChoiceBatchGroupId: 'g1' }, transcripts: [] }, // duplicate
      { config: {}, transcripts: [] }, // ungrouped - keep
      { config: { jobChoiceBatchGroupId: 'g2' }, transcripts: [] },
    ];
    expect(deduplicateRunsByGroupId(runs)).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateRunsByGroupId([])).toHaveLength(0);
  });

  it('with completenessOf callback, prefers the complete companion within a group', () => {
    const runs = [
      { config: { jobChoiceBatchGroupId: 'group-1' }, transcripts: [], complete: false },
      { config: { jobChoiceBatchGroupId: 'group-1' }, transcripts: [], complete: true },
      { config: { jobChoiceBatchGroupId: 'group-2' }, transcripts: [], complete: false },
      { config: { jobChoiceBatchGroupId: 'group-2' }, transcripts: [], complete: false },
    ];
    const survivors = deduplicateRunsByGroupId(runs, (run) => run.complete);
    expect(survivors).toHaveLength(2);
    // group-1 winner is the complete one; group-2 has no complete -- first-seen wins.
    expect(survivors.find((r) => r.config.jobChoiceBatchGroupId === 'group-1')?.complete).toBe(true);
  });

  it('with completenessOf, both-incomplete groups keep first-seen survivor', () => {
    const runs = [
      { config: { jobChoiceBatchGroupId: 'g1' }, transcripts: [], tag: 'first' },
      { config: { jobChoiceBatchGroupId: 'g1' }, transcripts: [], tag: 'second' },
    ];
    const survivors = deduplicateRunsByGroupId(runs, () => false);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.tag).toBe('first');
  });

  it('with completenessOf, ungrouped runs always survive regardless of completeness', () => {
    const runs = [
      { config: {}, transcripts: [], complete: false },
      { config: {}, transcripts: [], complete: false },
      { config: { jobChoiceBatchGroupId: 'g1' }, transcripts: [], complete: true },
    ];
    const survivors = deduplicateRunsByGroupId(runs, (run) => run.complete);
    expect(survivors).toHaveLength(3);
  });

  it('when combined with computePerModelTrialCounts, paired companions count once', () => {
    const labels = new Map([['model-a', 'Model A']]);
    // Simulate A-first and B-first companion runs for the same batch group.
    // Each surviving (post-dedup) run contributes its actual transcript rows
    // -- 5 here -- so two groups produce 10 trials total.
    const fiveTranscripts = Array.from({ length: 5 }, () => ({ modelId: 'model-a' }));
    const runs = [
      { config: { jobChoiceBatchGroupId: 'group-1', samplesPerScenario: 5 }, transcripts: fiveTranscripts },
      { config: { jobChoiceBatchGroupId: 'group-1', samplesPerScenario: 5 }, transcripts: fiveTranscripts },
      { config: { jobChoiceBatchGroupId: 'group-2', samplesPerScenario: 5 }, transcripts: fiveTranscripts },
      { config: { jobChoiceBatchGroupId: 'group-2', samplesPerScenario: 5 }, transcripts: fiveTranscripts },
    ];
    const deduped = deduplicateRunsByGroupId(runs);
    const result = computePerModelTrialCounts(deduped, ['model-a'], labels);
    expect(result.minTrialCount).toBe(10); // 2 groups x 5 transcripts each
  });
});

describe('getCoverageDirection', () => {
  it('returns the trimmed string for a normal direction token', () => {
    expect(getCoverageDirection({ jobChoiceValueFirst: 'career' })).toBe('career');
  });

  it('trims whitespace', () => {
    expect(getCoverageDirection({ jobChoiceValueFirst: '  career  ' })).toBe('career');
  });

  it('returns null for an empty string', () => {
    expect(getCoverageDirection({ jobChoiceValueFirst: '' })).toBeNull();
  });

  it('returns null for whitespace-only', () => {
    expect(getCoverageDirection({ jobChoiceValueFirst: '   ' })).toBeNull();
  });

  it('returns null when the field is missing', () => {
    expect(getCoverageDirection({})).toBeNull();
  });

  it('returns null for a non-string number value', () => {
    expect(getCoverageDirection({ jobChoiceValueFirst: 42 })).toBeNull();
  });

  it('returns null for a non-string boolean value', () => {
    expect(getCoverageDirection({ jobChoiceValueFirst: true })).toBeNull();
  });

  it('returns null for null config', () => {
    expect(getCoverageDirection(null)).toBeNull();
  });

  it('returns the value even when launch mode is not PAIRED_BATCH (trust-but-do-not-validate tripwire)', () => {
    // The algorithm trusts jobChoiceValueFirst regardless of launch mode.
    // If a future change adds a launch-mode guard, this test should fail
    // and force a deliberate update.
    expect(
      getCoverageDirection({ jobChoiceLaunchMode: 'AD_HOC_BATCH', jobChoiceValueFirst: 'career' }),
    ).toBe('career');
  });
});

describe('selectPrimaryDefinitionCounts', () => {
  function makeDirMap(
    entries: Array<[string, Map<string, Set<string>>]>,
  ): Map<string, Map<string, Set<string>>> {
    return new Map(entries);
  }

  it('returns zero for an empty definition list', () => {
    expect(selectPrimaryDefinitionCounts([], new Map(), new Map())).toEqual({
      primaryDefinitionId: null,
      batchCount: 0,
      pairedBatchCount: 0,
      orphanedBatchCount: 0,
    });
  });

  it('single direction only -> pairedBatchCount = 0, orphanedBatchCount = N', () => {
    const batches = new Map([['def-a', 1]]);
    const dirs = makeDirMap([[
      'def-a', new Map([['vf-A', new Set(['g1'])]]),
    ]]);
    expect(selectPrimaryDefinitionCounts(['def-a'], batches, dirs)).toEqual({
      primaryDefinitionId: 'def-a',
      batchCount: 1,
      pairedBatchCount: 0,
      orphanedBatchCount: 1,
    });
  });

  it('both directions equal -> pairedBatchCount = min(N, N), orphanedBatchCount = 0', () => {
    const batches = new Map([['def-a', 4]]);
    const dirs = makeDirMap([[
      'def-a', new Map([
        ['vf-A', new Set(['g1', 'g2'])],
        ['vf-B', new Set(['g1', 'g2'])],
      ]),
    ]]);
    expect(selectPrimaryDefinitionCounts(['def-a'], batches, dirs)).toEqual({
      primaryDefinitionId: 'def-a',
      batchCount: 4,
      pairedBatchCount: 2,
      orphanedBatchCount: 0,
    });
  });

  it('both directions, A=3 B=2 -> pairedBatchCount = min(3, 2) = 2, orphanedBatchCount = 1', () => {
    const batches = new Map([['def-a', 5]]);
    const dirs = makeDirMap([[
      'def-a', new Map([
        ['vf-A', new Set(['g1', 'g2', 'g3'])],
        ['vf-B', new Set(['g1', 'g2'])],
      ]),
    ]]);
    expect(selectPrimaryDefinitionCounts(['def-a'], batches, dirs)).toEqual({
      primaryDefinitionId: 'def-a',
      batchCount: 5,
      pairedBatchCount: 2,
      orphanedBatchCount: 1,
    });
  });

  it('cross-definition pair (companion structure) merges via Set.union per direction', () => {
    // def-a has all A-first runs, def-b has all B-first runs (companion definitions)
    const batches = new Map([['def-a', 2], ['def-b', 2]]);
    const dirs = makeDirMap([
      ['def-a', new Map([['vf-A', new Set(['g1', 'g2'])]])],
      ['def-b', new Map([['vf-B', new Set(['g1', 'g2'])]])],
    ]);
    const result = selectPrimaryDefinitionCounts(
      ['def-a', 'def-b'], batches, dirs,
    );
    expect(result.batchCount).toBe(4);
    expect(result.pairedBatchCount).toBe(2);
    // Tie-break: both have batchCount=2; both have directionCount=1; localeCompare picks 'def-a'
    expect(result.primaryDefinitionId).toBe('def-a');
  });

  it('retry duplicate within group (Set collapses same groupId)', () => {
    // Set semantics: adding the same g1 twice still leaves size=1.
    const batches = new Map([['def-a', 2]]);
    const dirs = makeDirMap([[
      'def-a', new Map([
        ['vf-A', new Set(['g1'])], // Set already collapsed
      ]),
    ]]);
    expect(selectPrimaryDefinitionCounts(['def-a'], batches, dirs)).toEqual({
      primaryDefinitionId: 'def-a',
      batchCount: 2,
      pairedBatchCount: 0, // Only one direction
      orphanedBatchCount: 1, // single-direction Set has size 1
    });
  });

  it('>2 directions corruption: takes min of two largest, calls log.warn', () => {
    const batches = new Map([['def-a', 5]]);
    const dirs = makeDirMap([[
      'def-a', new Map([
        ['vf-A', new Set(['g1', 'g2', 'g3'])], // 3
        ['vf-B', new Set(['g1'])],              // 1
        ['vf-X', new Set(['g4'])],              // 1
      ]),
    ]]);
    const log = { warn: vi.fn() };
    const result = selectPrimaryDefinitionCounts(
      ['def-a'], batches, dirs, log, 'Achievement::Tradition',
    );
    // Two largest counts: 3 and 1 -> min = 1
    expect(result.pairedBatchCount).toBe(1);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        cellKey: 'Achievement::Tradition',
        directions: expect.arrayContaining(['vf-A', 'vf-B', 'vf-X']),
      }),
      expect.stringContaining('>2 distinct'),
    );
  });

  it('tie-break on directionCount: prefers def with both directions', () => {
    // def-a and def-b tie on batchCount=2; def-b has both directions present
    const batches = new Map([['def-a', 2], ['def-b', 2]]);
    const dirs = makeDirMap([
      ['def-a', new Map([['vf-A', new Set(['g1', 'g2'])]])],
      ['def-b', new Map([
        ['vf-A', new Set(['g3'])],
        ['vf-B', new Set(['g3'])],
      ])],
    ]);
    const result = selectPrimaryDefinitionCounts(
      ['def-a', 'def-b'], batches, dirs,
    );
    expect(result.primaryDefinitionId).toBe('def-b');
  });

  it('tie-break on defId.localeCompare when batchCount and directionCount tie', () => {
    const batches = new Map([['def-z', 2], ['def-a', 2]]);
    const dirs = makeDirMap([
      ['def-z', new Map([['vf-A', new Set(['g1', 'g2'])]])],
      ['def-a', new Map([['vf-A', new Set(['g3', 'g4'])]])],
    ]);
    const result = selectPrimaryDefinitionCounts(
      ['def-z', 'def-a'], batches, dirs,
    );
    expect(result.primaryDefinitionId).toBe('def-a');
  });

  it('ignores samplesPerScenario — directional count is per (group, direction), not per sample (tripwire)', () => {
    // The new helper does NOT see samplesPerScenario at all. This test
    // documents that the post-PR-#756 semantic (each complete run = 1 batch
    // regardless of sps) is preserved by the new direction-based helper.
    // If someone re-adds sps multiplication, this test should still pass —
    // the helper has no input field for sps to influence.
    const batches = new Map([['def-a', 2]]);
    const dirs = makeDirMap([[
      'def-a', new Map([
        ['vf-A', new Set(['g1'])],
        ['vf-B', new Set(['g1'])],
      ]),
    ]]);
    expect(selectPrimaryDefinitionCounts(['def-a'], batches, dirs).pairedBatchCount).toBe(1);
  });

  it('does not warn when no log is provided in the >2 corruption case', () => {
    const batches = new Map([['def-a', 5]]);
    const dirs = makeDirMap([[
      'def-a', new Map([
        ['vf-A', new Set(['g1', 'g2'])],
        ['vf-B', new Set(['g1'])],
        ['vf-X', new Set(['g4'])],
      ]),
    ]]);
    // Should not throw without log, just compute the heuristic.
    expect(() =>
      selectPrimaryDefinitionCounts(['def-a'], batches, dirs),
    ).not.toThrow();
  });

  describe('orphanedBatchCount', () => {
    it('symmetric pair (A=B) -> orphanedBatchCount = 0', () => {
      const batches = new Map([['def-a', 6]]);
      const dirs = makeDirMap([[
        'def-a', new Map([
          ['vf-A', new Set(['g1', 'g2', 'g3'])],
          ['vf-B', new Set(['g1', 'g2', 'g3'])],
        ]),
      ]]);
      const result = selectPrimaryDefinitionCounts(['def-a'], batches, dirs);
      expect(result.pairedBatchCount).toBe(3);
      expect(result.orphanedBatchCount).toBe(0);
    });

    it('asymmetric pair (A=4, B=1) -> orphanedBatchCount = abs difference', () => {
      const batches = new Map([['def-a', 5]]);
      const dirs = makeDirMap([[
        'def-a', new Map([
          ['vf-A', new Set(['g1', 'g2', 'g3', 'g4'])],
          ['vf-B', new Set(['g1'])],
        ]),
      ]]);
      const result = selectPrimaryDefinitionCounts(['def-a'], batches, dirs);
      expect(result.pairedBatchCount).toBe(1);
      expect(result.orphanedBatchCount).toBe(3); // 4 - 1
    });

    it('fully missing side (only A-first present) -> orphanedBatchCount = count of present side', () => {
      const batches = new Map([['def-a', 3]]);
      const dirs = makeDirMap([[
        'def-a', new Map([
          ['vf-A', new Set(['g1', 'g2', 'g3'])],
        ]),
      ]]);
      const result = selectPrimaryDefinitionCounts(['def-a'], batches, dirs);
      expect(result.pairedBatchCount).toBe(0);
      expect(result.orphanedBatchCount).toBe(3);
    });

    it('no directions at all -> orphanedBatchCount = 0', () => {
      const batches = new Map([['def-a', 2]]);
      const dirs = makeDirMap([['def-a', new Map()]]);
      const result = selectPrimaryDefinitionCounts(['def-a'], batches, dirs);
      expect(result.pairedBatchCount).toBe(0);
      expect(result.orphanedBatchCount).toBe(0);
    });

    it('cross-definition asymmetric (def-a A-first only, def-b B-first only) -> orphanedBatchCount reflects merged sets', () => {
      const batches = new Map([['def-a', 3], ['def-b', 1]]);
      const dirs = makeDirMap([
        ['def-a', new Map([['vf-A', new Set(['g1', 'g2', 'g3'])]])],
        ['def-b', new Map([['vf-B', new Set(['g1'])]])],
      ]);
      const result = selectPrimaryDefinitionCounts(['def-a', 'def-b'], batches, dirs);
      expect(result.pairedBatchCount).toBe(1);
      expect(result.orphanedBatchCount).toBe(2); // 3 - 1
    });

    it('>2 directions corruption: orphanedBatchCount uses max - min of two largest counts', () => {
      const batches = new Map([['def-a', 5]]);
      const dirs = makeDirMap([[
        'def-a', new Map([
          ['vf-A', new Set(['g1', 'g2', 'g3'])], // 3
          ['vf-B', new Set(['g1'])],              // 1
          ['vf-X', new Set(['g4'])],              // 1
        ]),
      ]]);
      const result = selectPrimaryDefinitionCounts(['def-a'], batches, dirs);
      // Two largest: 3, 1 -> paired = min = 1, orphaned = 3 - 1 = 2
      expect(result.pairedBatchCount).toBe(1);
      expect(result.orphanedBatchCount).toBe(2);
    });
  });
});

/**
 * Integration scenarios — exercise the directional inner-loop construction
 * (mirroring domain-coverage.ts:178–315) plus the helper aggregation,
 * verifying pairedBatchCount and trial-count metrics behave as
 * spec §5.7 documents on the same fixture.
 *
 * These are functional integration tests: they construct realistic runs
 * (config + transcripts) and run them through the same helpers the
 * resolver uses, without Prisma. They catch wiring regressions that
 * helper-only unit tests cannot.
 */
describe('domain-coverage integration scenarios', () => {
  type RunFixture = {
    id: string;
    definitionId: string;
    config: { jobChoiceValueFirst?: string; jobChoiceBatchGroupId?: string; samplesPerScenario?: number; models?: string[] };
    transcripts: Array<{ modelId: string; scenarioId: string | null; sampleIndex: number }>;
    scenarioIds: string[];
  };

  function buildDirectionalMap(
    runs: ReadonlyArray<RunFixture>,
  ): Map<string, Map<string, Set<string>>> {
    const out = new Map<string, Map<string, Set<string>>>();
    for (const run of runs) {
      const direction = getCoverageDirection(run.config);
      if (direction === null) continue;
      const groupId = getCoverageBatchGroupId(run.config);
      const groupKey = groupId ?? `__ungrouped__:${run.id}`;
      const defMap = out.get(run.definitionId) ?? new Map<string, Set<string>>();
      const dirSet = defMap.get(direction) ?? new Set<string>();
      dirSet.add(groupKey);
      defMap.set(direction, dirSet);
      out.set(run.definitionId, defMap);
    }
    return out;
  }

  function buildBatchCounts(runs: ReadonlyArray<RunFixture>): Map<string, number> {
    // For these tests assume every fixture run is "complete" — the resolver
    // already filters by isRunComplete before reaching this aggregation.
    const out = new Map<string, number>();
    for (const run of runs) {
      out.set(run.definitionId, (out.get(run.definitionId) ?? 0) + 1);
    }
    return out;
  }

  it('I1 — Asymmetric pair: 2 A-first + 1 B-first across companion definitions → pairedBatchCount = 1', () => {
    const runs: RunFixture[] = [
      { id: 'r1', definitionId: 'def-a', config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g1' }, transcripts: [], scenarioIds: [] },
      { id: 'r2', definitionId: 'def-a', config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g2' }, transcripts: [], scenarioIds: [] },
      { id: 'r3', definitionId: 'def-b', config: { jobChoiceValueFirst: 'family', jobChoiceBatchGroupId: 'g1' }, transcripts: [], scenarioIds: [] },
    ];
    const dirs = buildDirectionalMap(runs);
    const batches = buildBatchCounts(runs);
    const result = selectPrimaryDefinitionCounts(['def-a', 'def-b'], batches, dirs);
    expect(result.batchCount).toBe(3);
    expect(result.pairedBatchCount).toBe(1); // min(2, 1) = 1
  });

  it('I2 — Metric divergence: 1 healthy paired batch → pairedBatchCount=1 but minTrialCount reflects only one companion', () => {
    // Documented divergence per spec §5.7: pairedBatchCount counts both
    // directions, but the trial-count path keeps deduplicateRunsByGroupId
    // which picks one survivor per group.
    const fiveTranscripts = Array.from({ length: 5 }, (_, i) => ({ modelId: 'model-a', scenarioId: 's1', sampleIndex: i }));
    const runs: RunFixture[] = [
      { id: 'r1', definitionId: 'def-a', config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g1', samplesPerScenario: 5, models: ['model-a'] }, transcripts: fiveTranscripts, scenarioIds: ['s1'] },
      { id: 'r2', definitionId: 'def-b', config: { jobChoiceValueFirst: 'family', jobChoiceBatchGroupId: 'g1', samplesPerScenario: 5, models: ['model-a'] }, transcripts: fiveTranscripts, scenarioIds: ['s1'] },
    ];
    const dirs = buildDirectionalMap(runs);
    const batches = buildBatchCounts(runs);

    // pairedBatchCount: 1 (both directions present, group g1 in each → min(1,1) = 1)
    const cellResult = selectPrimaryDefinitionCounts(['def-a', 'def-b'], batches, dirs);
    expect(cellResult.pairedBatchCount).toBe(1);
    expect(cellResult.batchCount).toBe(2);

    // Trial counts: deduplicateRunsByGroupId picks ONE survivor per groupId,
    // so only one companion's 5 transcripts feed computePerModelTrialCounts.
    const labels = new Map([['model-a', 'Model A']]);
    const dedupedRuns = deduplicateRunsByGroupId(runs);
    expect(dedupedRuns).toHaveLength(1); // only one survivor for groupId 'g1'
    const trialResult = computePerModelTrialCounts(dedupedRuns, ['model-a'], labels);
    expect(trialResult.minTrialCount).toBe(5); // not 10 — trial-count path takes one survivor

    // The divergence: pairedBatchCount=1 says "we have a pair to analyze",
    // but minTrialCount=5 reflects only one companion's transcripts. This is
    // the documented (and intentional) divergence per spec §5.7.
  });

  it('I3 — Legacy run (no jobChoiceValueFirst) coexists with new runs in same cell', () => {
    const runs: RunFixture[] = [
      { id: 'r1', definitionId: 'def-a', config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g1' }, transcripts: [], scenarioIds: [] },
      // Legacy: missing jobChoiceValueFirst — contributes to batchCount but not directional counts
      { id: 'r2', definitionId: 'def-a', config: { jobChoiceBatchGroupId: 'g0' }, transcripts: [], scenarioIds: [] },
    ];
    const dirs = buildDirectionalMap(runs);
    const batches = buildBatchCounts(runs);
    const result = selectPrimaryDefinitionCounts(['def-a'], batches, dirs);
    expect(result.batchCount).toBe(2); // both runs count toward batchCount
    expect(result.pairedBatchCount).toBe(0); // only one direction has any classifiable run
  });

  it('I4 — Retry duplicate within same launch group collapses via Set semantics', () => {
    // Two completed A-first runs sharing the same jobChoiceBatchGroupId
    // (theoretical retry case); plus one complete B-first in the same group.
    const runs: RunFixture[] = [
      { id: 'r1', definitionId: 'def-a', config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g1' }, transcripts: [], scenarioIds: [] },
      { id: 'r2', definitionId: 'def-a', config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g1' }, transcripts: [], scenarioIds: [] }, // retry
      { id: 'r3', definitionId: 'def-b', config: { jobChoiceValueFirst: 'family', jobChoiceBatchGroupId: 'g1' }, transcripts: [], scenarioIds: [] },
    ];
    const dirs = buildDirectionalMap(runs);
    const batches = buildBatchCounts(runs);
    const result = selectPrimaryDefinitionCounts(['def-a', 'def-b'], batches, dirs);
    expect(result.batchCount).toBe(3);
    // Set-of-groupIds collapses the two A-first runs into 1 → min(1, 1) = 1
    expect(result.pairedBatchCount).toBe(1);
  });

  it('I5 — >2 directions corruption: emits log.warn + uses two largest counts', () => {
    const runs: RunFixture[] = [
      { id: 'r1', definitionId: 'def-a', config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g1' }, transcripts: [], scenarioIds: [] },
      { id: 'r2', definitionId: 'def-a', config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g2' }, transcripts: [], scenarioIds: [] },
      { id: 'r3', definitionId: 'def-a', config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g3' }, transcripts: [], scenarioIds: [] },
      { id: 'r4', definitionId: 'def-a', config: { jobChoiceValueFirst: 'family', jobChoiceBatchGroupId: 'g4' }, transcripts: [], scenarioIds: [] },
      { id: 'r5', definitionId: 'def-a', config: { jobChoiceValueFirst: 'leisure', jobChoiceBatchGroupId: 'g5' }, transcripts: [], scenarioIds: [] }, // 3rd direction
    ];
    const dirs = buildDirectionalMap(runs);
    const batches = buildBatchCounts(runs);
    const log = { warn: vi.fn() };
    const result = selectPrimaryDefinitionCounts(['def-a'], batches, dirs, log, 'Achievement::Tradition');
    // Counts: career=3, family=1, leisure=1 → two largest = 3, 1 → min = 1
    expect(result.pairedBatchCount).toBe(1);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        cellKey: 'Achievement::Tradition',
        directions: expect.arrayContaining(['career', 'family', 'leisure']),
      }),
      expect.stringContaining('>2 distinct'),
    );
  });
});
