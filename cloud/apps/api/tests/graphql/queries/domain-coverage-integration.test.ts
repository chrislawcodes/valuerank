import { describe, expect, it, vi } from 'vitest';
import {
  getCoverageBatchGroupId,
  getCoverageDirection,
  computeConditionCounts,
  selectPrimaryDefinitionCounts,
  computePerModelTrialCounts,
  deduplicateRunsByGroupId,
} from '../../../src/graphql/queries/domain-coverage-utils.js';
import { isRunComplete } from '../../../src/services/run/coverage-completeness.js';

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
    const result = selectPrimaryDefinitionCounts(['def-a', 'def-b'], batches, dirs, 'vf-A', 'vf-B');
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
    const cellResult = selectPrimaryDefinitionCounts(['def-a', 'def-b'], batches, dirs, 'vf-A', 'vf-B');
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
    const result = selectPrimaryDefinitionCounts(['def-a'], batches, dirs, 'vf-A', 'vf-B');
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
    const result = selectPrimaryDefinitionCounts(['def-a', 'def-b'], batches, dirs, 'vf-A', 'vf-B');
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
    const result = selectPrimaryDefinitionCounts(['def-a'], batches, dirs, 'vf-A', 'vf-B', log, 'Achievement::Tradition');
    // Counts: Career=3, Family=1, Leisure=1 → two largest = 3, 1 → min = 1
    // Direction tokens normalized to PascalCase by getCoverageDirection.
    expect(result.pairedBatchCount).toBe(1);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        cellKey: 'Achievement::Tradition',
        directions: expect.arrayContaining(['Career', 'Family', 'Leisure']),
      }),
      expect.stringContaining('>2 distinct'),
    );
  });

  it('filters out runs missing a current default model before batch, incomplete, and trial counts', () => {
    const effectiveModelIds = ['model-a', 'model-b'];
    const runs: RunFixture[] = [
      {
        id: 'kept',
        definitionId: 'def-a',
        config: {
          jobChoiceValueFirst: 'career',
          jobChoiceBatchGroupId: 'g1',
          samplesPerScenario: 1,
          models: ['model-a', 'model-b'],
        },
        transcripts: [
          { modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 },
          { modelId: 'model-b', scenarioId: 's1', sampleIndex: 0 },
        ],
        scenarioIds: ['s1'],
      },
      {
        id: 'filtered',
        definitionId: 'def-a',
        config: {
          jobChoiceValueFirst: 'career',
          jobChoiceBatchGroupId: 'g2',
          samplesPerScenario: 1,
          models: ['model-a', 'model-c'],
        },
        transcripts: [
          { modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 },
        ],
        scenarioIds: ['s1'],
      },
    ];

    const batchCountByDefinitionId = new Map<string, number>();
    const incompleteBatchCountByDefinitionId = new Map<string, number>();
    const nonAggregateRunsByDefinitionId = new Map<string, Array<{
      config: unknown;
      transcripts: Array<{ modelId: string; scenarioId: string | null; sampleIndex: number }>;
      scenarioIds: string[];
    }>>();

    for (const run of runs) {
      const config = run.config;
      const models = Array.isArray(config.models)
        ? config.models.filter((m): m is string => typeof m === 'string' && m.length > 0)
        : null;
      const matchesEffectiveModelSet = effectiveModelIds.length === 0
        || (models !== null && effectiveModelIds.every((id) => models.includes(id)));
      if (!matchesEffectiveModelSet) {
        continue;
      }

      const rawSamples = config.samplesPerScenario;
      const samplesPerScenario = typeof rawSamples === 'number' ? rawSamples : null;
      const existingTranscripts = run.transcripts.filter(
        (t): t is { scenarioId: string; modelId: string; sampleIndex: number } => t.scenarioId !== null,
      );
      const complete = isRunComplete({
        scenarioIds: run.scenarioIds,
        models: models ?? [],
        samplesPerScenario,
        existingTranscripts,
      });

      if (!complete) {
        incompleteBatchCountByDefinitionId.set(
          run.definitionId,
          (incompleteBatchCountByDefinitionId.get(run.definitionId) ?? 0) + 1,
        );
        continue;
      }

      batchCountByDefinitionId.set(
        run.definitionId,
        (batchCountByDefinitionId.get(run.definitionId) ?? 0) + 1,
      );

      const nonAggregateRuns = nonAggregateRunsByDefinitionId.get(run.definitionId) ?? [];
      nonAggregateRuns.push({
        config: run.config,
        transcripts: run.transcripts,
        scenarioIds: run.scenarioIds,
      });
      nonAggregateRunsByDefinitionId.set(run.definitionId, nonAggregateRuns);
    }

    expect(batchCountByDefinitionId.get('def-a')).toBe(1);
    expect(incompleteBatchCountByDefinitionId.get('def-a')).toBeUndefined();
    expect(nonAggregateRunsByDefinitionId.get('def-a')).toHaveLength(1);
  });
});

describe('domain-coverage condition integration scenarios', () => {
  type TranscriptFixture = {
    modelId: string;
    scenarioId: string | null;
    sampleIndex: number | null;
    deletedAt?: boolean;
  };

  type ConditionRunFixture = {
    id: string;
    definitionId: string;
    config: {
      jobChoiceValueFirst?: string;
      jobChoiceBatchGroupId?: string;
      samplesPerScenario?: number;
      models?: string[];
      isAggregate?: boolean;
    };
    transcripts: TranscriptFixture[];
    scenarioIds: string[];
    deletedAt?: boolean;
  };

  function buildConditionCoverage(runs: ReadonlyArray<ConditionRunFixture>, filterModelIds: string[] = []) {
    const batchCountByDefinitionId = new Map<string, number>();
    const directionalGroupsByDefinitionId = new Map<string, Map<string, Set<string>>>();
    const directionalSlotsByDefinitionId = new Map<string, Map<string, Set<string>>>();
    const directionalLeftoverSlotsByDefinitionId = new Map<string, Map<string, Set<string>>>();
    const incompleteBatchCountByDefinitionId = new Map<string, number>();

    for (const run of runs) {
      if (run.deletedAt === true) continue;

      if (run.config.isAggregate === true) {
        continue;
      }

      const matchesModelFilter = filterModelIds.length === 0
        || run.transcripts.some((transcript) => !transcript.deletedAt && filterModelIds.includes(transcript.modelId));
      if (!matchesModelFilter) continue;

      const validTranscripts = run.transcripts.filter(
        (transcript): transcript is { modelId: string; scenarioId: string; sampleIndex: number; deletedAt?: boolean } =>
          !transcript.deletedAt && transcript.scenarioId !== null && transcript.sampleIndex !== null,
      );

      const direction = getCoverageDirection(run.config);
      if (direction !== null && validTranscripts.length > 0) {
        const defMap = directionalSlotsByDefinitionId.get(run.definitionId) ?? new Map<string, Set<string>>();
        const slotSet = defMap.get(direction) ?? new Set<string>();
        for (const transcript of validTranscripts) {
          if (filterModelIds.length > 0 && !filterModelIds.includes(transcript.modelId)) continue;
          slotSet.add(`${transcript.scenarioId}|${transcript.modelId}|${transcript.sampleIndex}`);
        }
        defMap.set(direction, slotSet);
        directionalSlotsByDefinitionId.set(run.definitionId, defMap);
      }

      const complete = isRunComplete({
        scenarioIds: run.scenarioIds,
        models: Array.isArray(run.config.models) ? run.config.models : [],
        samplesPerScenario: run.config.samplesPerScenario,
        existingTranscripts: validTranscripts,
      });

      if (!complete) {
        incompleteBatchCountByDefinitionId.set(
          run.definitionId,
          (incompleteBatchCountByDefinitionId.get(run.definitionId) ?? 0) + 1,
        );
        if (direction !== null && validTranscripts.length > 0) {
          const defMap = directionalLeftoverSlotsByDefinitionId.get(run.definitionId) ?? new Map<string, Set<string>>();
          const slotSet = defMap.get(direction) ?? new Set<string>();
          for (const transcript of validTranscripts) {
            if (filterModelIds.length > 0 && !filterModelIds.includes(transcript.modelId)) continue;
            slotSet.add(`${transcript.scenarioId}|${transcript.modelId}|${transcript.sampleIndex}`);
          }
          defMap.set(direction, slotSet);
          directionalLeftoverSlotsByDefinitionId.set(run.definitionId, defMap);
        }
        continue;
      }

      batchCountByDefinitionId.set(
        run.definitionId,
        (batchCountByDefinitionId.get(run.definitionId) ?? 0) + 1,
      );

      if (direction !== null) {
        const launchGroupId = run.config.jobChoiceBatchGroupId;
        const groupKey = launchGroupId ?? `__ungrouped__:${run.id}`;
        const defMap = directionalGroupsByDefinitionId.get(run.definitionId) ?? new Map<string, Set<string>>();
        const dirSet = defMap.get(direction) ?? new Set<string>();
        dirSet.add(groupKey);
        defMap.set(direction, dirSet);
        directionalGroupsByDefinitionId.set(run.definitionId, defMap);
      }
    }

    return {
      batchCountByDefinitionId,
      directionalGroupsByDefinitionId,
      directionalSlotsByDefinitionId,
      directionalLeftoverSlotsByDefinitionId,
      incompleteBatchCountByDefinitionId,
    };
  }

  function makeRun(overrides: Partial<ConditionRunFixture> & Pick<ConditionRunFixture, 'id' | 'definitionId' | 'config' | 'transcripts' | 'scenarioIds'>): ConditionRunFixture {
    return {
      deletedAt: false,
      ...overrides,
    };
  }

  it('marks condition-level imbalance when one direction has extra leftover slots but batch counts match', () => {
    const runs = [
      makeRun({
        id: 'a1',
        definitionId: 'def-a',
        config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g1', samplesPerScenario: 1, models: ['m1'] },
        transcripts: [
          { modelId: 'm1', scenarioId: 's1', sampleIndex: 0 },
        ],
        scenarioIds: ['s1'],
      }),
      makeRun({
        id: 'b1',
        definitionId: 'def-b',
        config: { jobChoiceValueFirst: 'family', jobChoiceBatchGroupId: 'g1', samplesPerScenario: 1, models: ['m1'] },
        transcripts: [
          { modelId: 'm1', scenarioId: 's1', sampleIndex: 0 },
        ],
        scenarioIds: ['s1'],
      }),
      makeRun({
        id: 'b2',
        definitionId: 'def-b',
        config: { jobChoiceValueFirst: 'family', jobChoiceBatchGroupId: 'g2', samplesPerScenario: 1, models: ['m1'] },
        transcripts: [
          { modelId: 'm1', scenarioId: 's2', sampleIndex: 0 },
        ],
        scenarioIds: ['s1'],
      }),
    ];

    const state = buildConditionCoverage(runs);
    const batches = selectPrimaryDefinitionCounts(
      ['def-a', 'def-b'],
      state.batchCountByDefinitionId,
      state.directionalGroupsByDefinitionId,
      'vf-A',
      'vf-B',
    );
    const conditions = computeConditionCounts(['def-a', 'def-b'], state.directionalSlotsByDefinitionId);

    expect(batches.pairedBatchCount).toBe(1);
    expect(batches.orphanedBatchCount).toBe(0);
    expect(conditions.pairedConditionCount).toBe(1);
    expect(conditions.orphanedConditionCount).toBe(1);
    expect(state.directionalLeftoverSlotsByDefinitionId.get('def-b')?.get('Family')?.size).toBe(1);
  });

  it('keeps batch imbalance visible even when condition coverage is balanced', () => {
    const runs = [
      makeRun({
        id: 'a1',
        definitionId: 'def-a',
        config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g1', samplesPerScenario: 1, models: ['m1'] },
        transcripts: [
          { modelId: 'm1', scenarioId: 's1', sampleIndex: 0 },
          { modelId: 'm1', scenarioId: 's2', sampleIndex: 0 },
        ],
        scenarioIds: ['s1', 's2'],
      }),
      makeRun({
        id: 'a2',
        definitionId: 'def-a',
        config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g2', samplesPerScenario: 1, models: ['m1'] },
        transcripts: [
          { modelId: 'm1', scenarioId: 's1', sampleIndex: 0 },
          { modelId: 'm1', scenarioId: 's2', sampleIndex: 0 },
        ],
        scenarioIds: ['s1', 's2'],
      }),
      makeRun({
        id: 'b1',
        definitionId: 'def-b',
        config: { jobChoiceValueFirst: 'family', jobChoiceBatchGroupId: 'g1', samplesPerScenario: 1, models: ['m1'] },
        transcripts: [
          { modelId: 'm1', scenarioId: 's1', sampleIndex: 0 },
          { modelId: 'm1', scenarioId: 's2', sampleIndex: 0 },
        ],
        scenarioIds: ['s1', 's2'],
      }),
    ];

    const state = buildConditionCoverage(runs);
    const batches = selectPrimaryDefinitionCounts(
      ['def-a', 'def-b'],
      state.batchCountByDefinitionId,
      state.directionalGroupsByDefinitionId,
      'vf-A',
      'vf-B',
    );
    const conditions = computeConditionCounts(['def-a', 'def-b'], state.directionalSlotsByDefinitionId);

    expect(batches.pairedBatchCount).toBe(1);
    expect(batches.orphanedBatchCount).toBe(1);
    expect(conditions.pairedConditionCount).toBe(2);
    expect(conditions.orphanedConditionCount).toBe(0);
  });

  it('excludes null scenario/sample slots, deleted runs, deleted transcripts, and aggregate runs', () => {
    const runs = [
      makeRun({
        id: 'kept',
        definitionId: 'def-a',
        config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g1', samplesPerScenario: 1, models: ['m1'] },
        transcripts: [
          { modelId: 'm1', scenarioId: 's1', sampleIndex: 0 },
          { modelId: 'm1', scenarioId: null, sampleIndex: 0 },
          { modelId: 'm1', scenarioId: 's1', sampleIndex: null },
          { modelId: 'm1', scenarioId: 's2', sampleIndex: 0, deletedAt: true },
        ],
        scenarioIds: ['s1'],
      }),
      makeRun({
        id: 'aggregate',
        definitionId: 'def-a',
        config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g2', samplesPerScenario: 1, models: ['m1'], isAggregate: true },
        transcripts: [
          { modelId: 'm1', scenarioId: 's2', sampleIndex: 0 },
        ],
        scenarioIds: ['s1', 's2'],
      }),
      makeRun({
        id: 'deleted',
        definitionId: 'def-a',
        deletedAt: true,
        config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g3', samplesPerScenario: 1, models: ['m1'] },
        transcripts: [
          { modelId: 'm1', scenarioId: 's2', sampleIndex: 0 },
        ],
        scenarioIds: ['s1', 's2'],
      }),
    ];

    const state = buildConditionCoverage(runs);
    const conditions = computeConditionCounts(['def-a'], state.directionalSlotsByDefinitionId);

    expect(conditions.perDirection.get('Career')?.filledSlots).toBe(1);
    expect(state.incompleteBatchCountByDefinitionId.get('def-a')).toBeUndefined();
    expect(state.batchCountByDefinitionId.get('def-a')).toBe(1);
  });

  it('respects the filterModelIds gate when counting slots', () => {
    const runs = [
      makeRun({
        id: 'r1',
        definitionId: 'def-a',
        config: { jobChoiceValueFirst: 'career', jobChoiceBatchGroupId: 'g1', samplesPerScenario: 1, models: ['m1', 'm2'] },
        transcripts: [
          { modelId: 'm1', scenarioId: 's1', sampleIndex: 0 },
          { modelId: 'm2', scenarioId: 's1', sampleIndex: 0 },
        ],
        scenarioIds: ['s1'],
      }),
    ];

    const state = buildConditionCoverage(runs, ['m2']);
    const conditions = computeConditionCounts(['def-a'], state.directionalSlotsByDefinitionId);

    expect(conditions.perDirection.get('Career')?.filledSlots).toBe(1);
    expect(conditions.pairedConditionCount).toBe(0);
    expect(state.batchCountByDefinitionId.get('def-a')).toBe(1);
  });
});
