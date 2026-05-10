import { describe, expect, it } from 'vitest';
import {
  computeConditionCounts,
  computePerModelTrialCounts,
  deduplicateRunsBySignaturePair,
  getCoverageDirection,
  selectPrimaryDefinitionCounts,
} from '../../../src/graphql/queries/domain-coverage-utils.js';

type RunFixture = {
  id: string;
  definitionId: string;
  config: {
    definitionSnapshot: {
      components: {
        value_first: { token: string };
        value_second: { token: string };
      };
    };
    samplesPerScenario?: number;
    models?: string[];
  };
  transcripts: Array<{ modelId: string; scenarioId: string | null; sampleIndex: number }>;
  scenarioIds: string[];
};

function canonicalValuePairKey(components: RunFixture['config']['definitionSnapshot']['components']): string {
  return [components.value_first.token, components.value_second.token].sort().join('::');
}

function makeConfig(valueFirst: string, valueSecond: string, extras: Partial<Omit<RunFixture['config'], 'definitionSnapshot'>> = {}): RunFixture['config'] {
  return {
    definitionSnapshot: {
      components: {
        value_first: { token: valueFirst },
        value_second: { token: valueSecond },
      },
    },
    ...extras,
  };
}

function buildDirectionalMap(runs: ReadonlyArray<RunFixture>): Map<string, Map<string, Set<string>>> {
  const out = new Map<string, Map<string, Set<string>>>();
  for (const run of runs) {
    const direction = getCoverageDirection(run.config);
    if (direction === null) continue;
    const pairKey = canonicalValuePairKey(run.config.definitionSnapshot.components);
    const defMap = out.get(run.definitionId) ?? new Map<string, Set<string>>();
    const dirSet = defMap.get(direction) ?? new Set<string>();
    dirSet.add(pairKey);
    defMap.set(direction, dirSet);
    out.set(run.definitionId, defMap);
  }
  return out;
}

function buildBatchCounts(runs: ReadonlyArray<RunFixture>): Map<string, number> {
  const out = new Map<string, number>();
  for (const run of runs) {
    out.set(run.definitionId, (out.get(run.definitionId) ?? 0) + 1);
  }
  return out;
}

describe('domain coverage integration', () => {
  it('deduplicates mirrored runs by signature and canonical pair', () => {
    const runs = [
      {
        id: 'r1',
        definitionId: 'def-a',
        config: makeConfig('career', 'family', { samplesPerScenario: 5, models: ['model-a'] }),
        transcripts: Array.from({ length: 5 }, () => ({ modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 })),
        scenarioIds: ['s1'],
      },
      {
        id: 'r2',
        definitionId: 'def-b',
        config: makeConfig('family', 'career', { samplesPerScenario: 5, models: ['model-a'] }),
        transcripts: Array.from({ length: 5 }, () => ({ modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 })),
        scenarioIds: ['s1'],
      },
      {
        id: 'r3',
        definitionId: 'def-c',
        config: makeConfig('career', 'security', { samplesPerScenario: 5, models: ['model-a'] }),
        transcripts: Array.from({ length: 5 }, () => ({ modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 })),
        scenarioIds: ['s1'],
      },
    ];

    const deduped = deduplicateRunsBySignaturePair(runs);
    expect(deduped).toHaveLength(2);
  });

  it('counts paired batches from mirrored definitions using canonical pair keys', () => {
    const runs = [
      {
        id: 'r1',
        definitionId: 'def-a',
        config: makeConfig('career', 'family', { samplesPerScenario: 1, models: ['model-a'] }),
        transcripts: [{ modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 }],
        scenarioIds: ['s1'],
      },
      {
        id: 'r2',
        definitionId: 'def-b',
        config: makeConfig('family', 'career', { samplesPerScenario: 1, models: ['model-a'] }),
        transcripts: [{ modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 }],
        scenarioIds: ['s1'],
      },
    ];

    const batches = buildBatchCounts(runs);
    const directions = buildDirectionalMap(runs);
    const result = selectPrimaryDefinitionCounts(['def-a', 'def-b'], batches, directions, 'vf-A', 'vf-B');

    expect(result.batchCount).toBe(2);
    expect(result.pairedBatchCount).toBe(1);
    expect(result.orphanedBatchCount).toBe(0);
  });

  it('keeps transcript counts aligned after deduping mirrored runs first', () => {
    const runs = [
      {
        id: 'r1',
        definitionId: 'def-a',
        config: makeConfig('career', 'family', { samplesPerScenario: 5, models: ['model-a'] }),
        transcripts: Array.from({ length: 5 }, () => ({ modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 })),
        scenarioIds: ['s1'],
      },
      {
        id: 'r2',
        definitionId: 'def-b',
        config: makeConfig('family', 'career', { samplesPerScenario: 5, models: ['model-a'] }),
        transcripts: Array.from({ length: 5 }, () => ({ modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 })),
        scenarioIds: ['s1'],
      },
      {
        id: 'r3',
        definitionId: 'def-c',
        config: makeConfig('career', 'security', { samplesPerScenario: 5, models: ['model-a'] }),
        transcripts: Array.from({ length: 5 }, () => ({ modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 })),
        scenarioIds: ['s1'],
      },
      {
        id: 'r4',
        definitionId: 'def-d',
        config: makeConfig('security', 'career', { samplesPerScenario: 5, models: ['model-a'] }),
        transcripts: Array.from({ length: 5 }, () => ({ modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 })),
        scenarioIds: ['s1'],
      },
    ];

    const labels = new Map([['model-a', 'Model A']]);
    const deduped = deduplicateRunsBySignaturePair(runs);
    const trialCounts = computePerModelTrialCounts(deduped, ['model-a'], labels);
    expect(trialCounts.minTrialCount).toBe(10);
  });

  it('keeps condition counts stable for mirrored paired runs', () => {
    const runs = [
      {
        id: 'r1',
        definitionId: 'def-a',
        config: makeConfig('career', 'family', { samplesPerScenario: 1, models: ['model-a'] }),
        transcripts: [{ modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 }],
        scenarioIds: ['s1'],
      },
      {
        id: 'r2',
        definitionId: 'def-b',
        config: makeConfig('family', 'career', { samplesPerScenario: 1, models: ['model-a'] }),
        transcripts: [{ modelId: 'model-a', scenarioId: 's1', sampleIndex: 0 }],
        scenarioIds: ['s1'],
      },
    ];

    const directions = buildDirectionalMap(runs);
    const counts = computeConditionCounts(['def-a', 'def-b'], directions);
    expect(counts.pairedConditionCount).toBe(1);
    expect(counts.orphanedConditionCount).toBe(0);
  });
});
