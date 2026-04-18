import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUnresolvableCount } from '../../src/services/unresolvable-count.js';

const mockFindMany = vi.hoisted(() => vi.fn());

vi.mock('@valuerank/db', () => ({
  db: {
    transcript: {
      findMany: mockFindMany,
    },
  },
}));

const SNAPSHOT_WITH_PAIR = {
  dimensions: [{ name: 'Self_Direction_Action' }, { name: 'Stimulation' }],
};

const STALE_UNKNOWN_CACHE = {
  summaryCache: {
    summary: {
      canonicalDecision: {
        cacheVersion: 1,
        decisionState: 'unknown',
        favoredValueKey: null,
        strength: 'none',
      },
    },
  },
};

describe('getUnresolvableCount', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
  });

  it('does not count a transcript where the stale cache says unknown but raw evidence is resolvable', async () => {
    // This is the core invariant: the function must use the live resolver, not the
    // stale summaryCache. The cache stored 'unknown' but the parsePath encodes a
    // clear favor_first outcome — the resolver recovers it.
    mockFindMany.mockResolvedValue([{
      modelId: 'claude-sonnet-4-5',
      decisionCode: null,
      decisionMetadata: {
        parsePath: 'exact.favor_first.strong',
        parseClass: 'exact',
        parserVersion: 'parser-1',
        matchedText: 'Self_Direction_Action',
        matchedLabel: 'Self_Direction_Action',
        ...STALE_UNKNOWN_CACHE,
      },
      definitionSnapshot: SNAPSHOT_WITH_PAIR,
      scenario: { orientationFlipped: false },
    }]);

    const result = await getUnresolvableCount('run-1');

    expect(result.total).toBe(0);
    expect(result.byModel).toEqual([]);
  });

  it('counts a transcript where the live resolver genuinely cannot resolve', async () => {
    mockFindMany.mockResolvedValue([{
      modelId: 'model-a',
      decisionCode: null,
      decisionMetadata: null,
      definitionSnapshot: SNAPSHOT_WITH_PAIR,
      scenario: { orientationFlipped: false },
    }]);

    const result = await getUnresolvableCount('run-1');

    expect(result.total).toBe(1);
    expect(result.byModel).toEqual([{ modelId: 'model-a', count: 1 }]);
  });

  it('groups unresolvable counts by model', async () => {
    mockFindMany.mockResolvedValue([
      { modelId: 'model-a', decisionCode: null, decisionMetadata: null, definitionSnapshot: SNAPSHOT_WITH_PAIR, scenario: null },
      { modelId: 'model-a', decisionCode: null, decisionMetadata: null, definitionSnapshot: SNAPSHOT_WITH_PAIR, scenario: null },
      { modelId: 'model-b', decisionCode: null, decisionMetadata: null, definitionSnapshot: SNAPSHOT_WITH_PAIR, scenario: null },
    ]);

    const result = await getUnresolvableCount('run-1');

    expect(result.total).toBe(3);
    expect(result.byModel).toContainEqual({ modelId: 'model-a', count: 2 });
    expect(result.byModel).toContainEqual({ modelId: 'model-b', count: 1 });
  });

  it('queries only summarized non-manual transcripts', async () => {
    mockFindMany.mockResolvedValue([]);

    await getUnresolvableCount('run-abc');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          runId: 'run-abc',
          summarizedAt: { not: null },
          decisionCodeSource: { not: 'manual' },
        }),
      })
    );
  });
});
