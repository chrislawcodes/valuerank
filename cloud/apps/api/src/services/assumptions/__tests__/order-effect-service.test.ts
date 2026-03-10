import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger, MockAppError } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  MockAppError: class MockAppError extends Error {
    constructor(
      message: string,
      public code: string,
      public statusCode: number = 500,
      public context?: Record<string, unknown>
    ) {
      super(message);
      this.name = 'AppError';
    }
  },
}));

vi.mock('@valuerank/shared', () => ({
  createLogger: vi.fn(() => mockLogger),
  AppError: MockAppError,
}));

vi.mock('@valuerank/db', () => ({
  db: {
    $transaction: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    assumptionScenarioPair: {
      findMany: vi.fn(),
    },
    llmModel: {
      findMany: vi.fn(),
    },
    transcript: {
      findMany: vi.fn(),
    },
    assumptionAnalysisSnapshot: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { db } from '@valuerank/db';
import { getOrderInvarianceAnalysisResult } from '../order-effect-service.js';
import { buildOrderEffectCachePayload, buildOrderEffectSnapshotConfig } from '../order-effect-cache.js';

const mockDb = db as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  $executeRawUnsafe: ReturnType<typeof vi.fn>;
  assumptionScenarioPair: {
    findMany: ReturnType<typeof vi.fn>;
  };
  llmModel: {
    findMany: ReturnType<typeof vi.fn>;
  };
  transcript: {
    findMany: ReturnType<typeof vi.fn>;
  };
  assumptionAnalysisSnapshot: {
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

const LOCKED_VIGNETTE_ID = 'cmlsmyn9l0j3rxeiricruouia';

function buildPair(id: string, variantType: string | null, sourceScenarioId: string, variantScenarioId: string) {
  return {
    id,
    variantType,
    sourceScenario: {
      id: sourceScenarioId,
      name: 'sentinel_4 / compare_2',
      definitionId: LOCKED_VIGNETTE_ID,
      orientationFlipped: false,
    },
    variantScenario: {
      id: variantScenarioId,
      name: 'sentinel_4 / compare_2',
      definitionId: LOCKED_VIGNETTE_ID,
      orientationFlipped: variantType === 'presentation_flipped' || variantType === 'fully_flipped',
    },
  };
}

function buildTranscript(args: {
  id: string;
  scenarioId: string;
  decisionCode: string;
  createdAt: string;
  assumptionKey: string;
  modelVersion?: string | null;
}) {
  return {
    id: args.id,
    scenarioId: args.scenarioId,
    modelId: 'model-a',
    modelVersion: args.modelVersion ?? 'v1',
    decisionCode: args.decisionCode,
    createdAt: new Date(args.createdAt),
    run: {
      deletedAt: null,
      config: {
        temperature: 0,
        assumptionKey: args.assumptionKey,
      },
      tags: [{ tag: { name: 'assumption-run' } }],
    },
  };
}

function buildFullyFlippedDataset(variantDecisionCode: string) {
  return [
    buildTranscript({ id: 'b1', scenarioId: 'scenario-baseline', decisionCode: '4', createdAt: '2026-03-01T10:00:00Z', assumptionKey: 'temp_zero_determinism' }),
    buildTranscript({ id: 'b2', scenarioId: 'scenario-baseline', decisionCode: '4', createdAt: '2026-03-01T09:00:00Z', assumptionKey: 'temp_zero_determinism' }),
    buildTranscript({ id: 'b3', scenarioId: 'scenario-baseline', decisionCode: '4', createdAt: '2026-03-01T08:00:00Z', assumptionKey: 'temp_zero_determinism' }),
    buildTranscript({ id: 'b4', scenarioId: 'scenario-baseline', decisionCode: '4', createdAt: '2026-03-01T07:00:00Z', assumptionKey: 'temp_zero_determinism' }),
    buildTranscript({ id: 'b5', scenarioId: 'scenario-baseline', decisionCode: '4', createdAt: '2026-03-01T06:00:00Z', assumptionKey: 'temp_zero_determinism' }),
    buildTranscript({ id: 'f1', scenarioId: 'scenario-fully', decisionCode: variantDecisionCode, createdAt: '2026-03-01T10:00:00Z', assumptionKey: 'order_invariance' }),
    buildTranscript({ id: 'f2', scenarioId: 'scenario-fully', decisionCode: variantDecisionCode, createdAt: '2026-03-01T09:00:00Z', assumptionKey: 'order_invariance' }),
    buildTranscript({ id: 'f3', scenarioId: 'scenario-fully', decisionCode: variantDecisionCode, createdAt: '2026-03-01T08:00:00Z', assumptionKey: 'order_invariance' }),
    buildTranscript({ id: 'f4', scenarioId: 'scenario-fully', decisionCode: variantDecisionCode, createdAt: '2026-03-01T07:00:00Z', assumptionKey: 'order_invariance' }),
    buildTranscript({ id: 'f5', scenarioId: 'scenario-fully', decisionCode: variantDecisionCode, createdAt: '2026-03-01T06:00:00Z', assumptionKey: 'order_invariance' }),
  ];
}

describe('order-effect service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.$executeRawUnsafe.mockResolvedValue(1);
    mockDb.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) => (
      Promise.resolve(callback(db))
    ));
    mockDb.llmModel.findMany.mockResolvedValue([
      { modelId: 'model-a', displayName: 'Model A' },
    ]);
    mockDb.assumptionScenarioPair.findMany.mockResolvedValue([
      buildPair('pair-f', 'fully_flipped', 'scenario-baseline', 'scenario-fully'),
    ]);
  });

  it('skips unknown variant metadata without crashing the analysis result', async () => {
    mockDb.assumptionScenarioPair.findMany.mockResolvedValue([
      buildPair('pair-x', 'future_variant', 'scenario-baseline', 'scenario-future'),
    ]);
    mockDb.transcript.findMany.mockResolvedValue([
      ...buildFullyFlippedDataset('2').filter((record) => record.scenarioId === 'scenario-baseline'),
      ...buildFullyFlippedDataset('2')
        .filter((record) => record.scenarioId === 'scenario-fully')
        .map((record) => ({ ...record, scenarioId: 'scenario-future', id: record.id.replace(/^f/, 'x') })),
    ]);
    mockDb.assumptionAnalysisSnapshot.findMany.mockResolvedValue([]);
    mockDb.assumptionAnalysisSnapshot.updateMany.mockResolvedValue({ count: 0 });
    mockDb.assumptionAnalysisSnapshot.create.mockImplementation((args?: { data?: Record<string, unknown> }) => Promise.resolve({
      id: 'snapshot-1',
      createdAt: new Date('2026-03-01T00:00:00Z'),
      deletedAt: null,
      ...(args?.data ?? {}),
    }));

    const result = await getOrderInvarianceAnalysisResult({
      directionOnly: true,
      trimOutliers: true,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.variantType).toBe('future_variant');
    expect(result.summary.matchRate).toBeNull();
    expect(result.modelMetrics[0]?.matchEligibleCount).toBe(0);
  });

  it('misses and supersedes the cache when selected transcript state changes in place', async () => {
    let transcriptRecords = buildFullyFlippedDataset('2');
    const snapshots: Array<Record<string, unknown>> = [];
    let snapshotCounter = 0;

    mockDb.transcript.findMany.mockImplementation(() => Promise.resolve(transcriptRecords));
    mockDb.assumptionAnalysisSnapshot.findMany.mockImplementation((args?: { where?: { inputHash?: string; status?: string }; take?: number }) => Promise.resolve(
      snapshots
        .filter((snapshot) => (
          snapshot.inputHash === args?.where?.inputHash
          && snapshot.status === args?.where?.status
          && snapshot.deletedAt == null
        ))
        .slice(0, args?.take ?? snapshots.length)
    ));
    mockDb.assumptionAnalysisSnapshot.updateMany.mockImplementation((args?: {
      where?: { configSignature?: string; status?: string };
      data?: { status?: string };
    }) => {
      let count = 0;
      for (const snapshot of snapshots) {
        if (
          snapshot.configSignature === args?.where?.configSignature
          && snapshot.status === args?.where?.status
          && snapshot.deletedAt == null
        ) {
          snapshot.status = args?.data?.status;
          count += 1;
        }
      }
      return Promise.resolve({ count });
    });
    mockDb.assumptionAnalysisSnapshot.create.mockImplementation((args?: { data?: Record<string, unknown> }) => {
      const created = {
        id: `snapshot-${++snapshotCounter}`,
        createdAt: new Date(`2026-03-01T00:00:0${snapshotCounter}Z`),
        deletedAt: null,
        ...(args?.data ?? {}),
      };
      snapshots.push(created);
      return Promise.resolve(created);
    });

    const initialResult = await getOrderInvarianceAnalysisResult({
      directionOnly: false,
      trimOutliers: true,
    });
    const initialHash = mockDb.assumptionAnalysisSnapshot.create.mock.calls[0]?.[0]?.data?.inputHash;

    transcriptRecords = buildFullyFlippedDataset('4');

    const changedResult = await getOrderInvarianceAnalysisResult({
      directionOnly: false,
      trimOutliers: true,
    });
    const changedHash = mockDb.assumptionAnalysisSnapshot.create.mock.calls[1]?.[0]?.data?.inputHash;

    expect(initialResult.summary.matchRate).toBe(1);
    expect(changedResult.summary.matchRate).toBe(0);
    expect(initialHash).not.toBe(changedHash);
    expect(mockDb.assumptionAnalysisSnapshot.create).toHaveBeenCalledTimes(2);
    expect(mockDb.assumptionAnalysisSnapshot.updateMany).toHaveBeenCalledTimes(2);
    expect(snapshots.filter((snapshot) => snapshot.status === 'CURRENT')).toHaveLength(1);
  });

  it('recomputes and repairs the cache when a matching CURRENT snapshot payload is malformed', async () => {
    const transcriptRecords = buildFullyFlippedDataset('2');
    const snapshots: Array<Record<string, unknown>> = [];
    let snapshotCounter = 0;

    mockDb.transcript.findMany.mockImplementation(() => Promise.resolve(transcriptRecords));
    mockDb.assumptionAnalysisSnapshot.findMany.mockImplementation((args?: { where?: { inputHash?: string; status?: string }; take?: number }) => Promise.resolve(
      snapshots
        .filter((snapshot) => (
          snapshot.inputHash === args?.where?.inputHash
          && snapshot.status === args?.where?.status
          && snapshot.deletedAt == null
        ))
        .slice(0, args?.take ?? snapshots.length)
    ));
    mockDb.assumptionAnalysisSnapshot.updateMany.mockImplementation((args?: {
      where?: { configSignature?: string; status?: string };
      data?: { status?: string };
    }) => {
      let count = 0;
      for (const snapshot of snapshots) {
        if (
          snapshot.configSignature === args?.where?.configSignature
          && snapshot.status === args?.where?.status
          && snapshot.deletedAt == null
        ) {
          snapshot.status = args?.data?.status;
          count += 1;
        }
      }
      return Promise.resolve({ count });
    });
    mockDb.assumptionAnalysisSnapshot.create.mockImplementation((args?: { data?: Record<string, unknown> }) => {
      const created = {
        id: `snapshot-${++snapshotCounter}`,
        createdAt: new Date(`2026-03-01T00:00:1${snapshotCounter}Z`),
        deletedAt: null,
        ...(args?.data ?? {}),
      };
      snapshots.push(created);
      return Promise.resolve(created);
    });

    const initialResult = await getOrderInvarianceAnalysisResult({
      directionOnly: false,
      trimOutliers: true,
    });

    expect(initialResult.summary.matchRate).toBe(1);
    expect(snapshots).toHaveLength(1);

    const firstSnapshot = snapshots[0];
    expect(firstSnapshot).toBeDefined();
    snapshots[0] = {
      ...firstSnapshot,
      output: {
        summary: firstSnapshot?.output != null && typeof firstSnapshot.output === 'object'
          ? (firstSnapshot.output as Record<string, unknown>).summary
          : {},
        modelMetrics: 'corrupt',
        rows: [],
      },
    };

    const repairedResult = await getOrderInvarianceAnalysisResult({
      directionOnly: false,
      trimOutliers: true,
    });

    expect(repairedResult.summary.matchRate).toBe(1);
    expect(mockDb.assumptionAnalysisSnapshot.create).toHaveBeenCalledTimes(2);
    expect(snapshots.filter((snapshot) => snapshot.status === 'CURRENT')).toHaveLength(1);
    const currentSnapshot = snapshots.find((snapshot) => snapshot.status === 'CURRENT');
    expect(currentSnapshot?.output).toMatchObject({
      modelMetrics: expect.any(Array),
      rows: expect.any(Array),
    });
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('repairs duplicate CURRENT snapshots and returns the newest readable snapshot', async () => {
    const transcriptRecords = buildFullyFlippedDataset('2');
    const payload = buildOrderEffectCachePayload({
      trimOutliers: true,
      directionOnly: true,
      requiredTrialCount: 5,
      lockedVignetteIds: [LOCKED_VIGNETTE_ID],
      approvedPairIds: ['pair-f'],
      snapshotModelIds: ['model-a'],
      selectionFingerprints: ['baseline', 'variant'],
    });
    const cachedOutput = {
      schemaVersion: 1,
      summary: {
        status: 'COMPUTED',
        matchRate: 1,
        exactMatchRate: 1,
        presentationEffectMAD: null,
        scaleEffectMAD: null,
        totalCandidatePairs: 1,
        qualifyingPairs: 1,
        missingPairs: 0,
        comparablePairs: 1,
        matchComparablePairs: 1,
        presentationComparablePairs: 0,
        scaleComparablePairs: 0,
        presentationMissingPairs: 0,
        scaleMissingPairs: 0,
        sensitiveModelCount: 0,
        sensitiveVignetteCount: 0,
        excludedPairs: [],
      },
      modelMetrics: [{
        modelId: 'model-a',
        modelLabel: 'Model A',
        matchRate: 1,
        matchCount: 1,
        matchEligibleCount: 1,
        valueOrderReversalRate: null,
        valueOrderEligibleCount: 0,
        valueOrderExcludedCount: 0,
        valueOrderPull: 'no clear pull',
        scaleOrderReversalRate: null,
        scaleOrderEligibleCount: 0,
        scaleOrderExcludedCount: 0,
        scaleOrderPull: 'no clear pull',
        withinCellDisagreementRate: 0,
        pairLevelMarginSummary: null,
      }],
      rows: [{
        modelId: 'model-a',
        modelLabel: 'Model A',
        vignetteId: LOCKED_VIGNETTE_ID,
        vignetteTitle: 'Cached',
        conditionKey: '4x2',
        variantType: 'fully_flipped',
        majorityVoteBaseline: 4,
        majorityVoteFlipped: 2,
        rawScore: 2,
        mismatchType: null,
        ordinalDistance: 2,
        isMatch: true,
      }],
    };

    mockDb.transcript.findMany.mockResolvedValue(transcriptRecords);
    mockDb.assumptionAnalysisSnapshot.findMany
      .mockResolvedValueOnce([
        {
          id: 'snapshot-new',
          createdAt: new Date('2026-03-01T01:00:00Z'),
          configSignature: payload.configSignature,
          codeVersion: payload.codeVersion,
          config: buildOrderEffectSnapshotConfig(payload),
          output: cachedOutput,
        },
        {
          id: 'snapshot-old',
          createdAt: new Date('2026-03-01T00:00:00Z'),
          configSignature: payload.configSignature,
          codeVersion: payload.codeVersion,
          config: buildOrderEffectSnapshotConfig(payload),
          output: cachedOutput,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'snapshot-new',
          createdAt: new Date('2026-03-01T01:00:00Z'),
          configSignature: payload.configSignature,
          codeVersion: payload.codeVersion,
          config: buildOrderEffectSnapshotConfig(payload),
          output: cachedOutput,
        },
        {
          id: 'snapshot-old',
          createdAt: new Date('2026-03-01T00:00:00Z'),
          configSignature: payload.configSignature,
          codeVersion: payload.codeVersion,
          config: buildOrderEffectSnapshotConfig(payload),
          output: cachedOutput,
        },
      ]);
    mockDb.assumptionAnalysisSnapshot.updateMany.mockResolvedValue({ count: 1 });

    const result = await getOrderInvarianceAnalysisResult({
      directionOnly: true,
      trimOutliers: true,
    });

    expect(result.summary.matchRate).toBe(1);
    expect(mockDb.assumptionAnalysisSnapshot.create).not.toHaveBeenCalled();
    expect(mockDb.assumptionAnalysisSnapshot.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['snapshot-old'] },
        status: 'CURRENT',
        deletedAt: null,
      },
      data: {
        status: 'SUPERSEDED',
      },
    });
    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('fails explicitly when duplicate CURRENT snapshots are ambiguous during cache repair', async () => {
    const transcriptRecords = buildFullyFlippedDataset('2');
    mockDb.assumptionAnalysisSnapshot.findMany.mockReset();
    mockDb.assumptionAnalysisSnapshot.updateMany.mockReset();
    mockDb.assumptionAnalysisSnapshot.create.mockReset();
    mockDb.transcript.findMany.mockResolvedValue(transcriptRecords);
    mockDb.assumptionAnalysisSnapshot.findMany
      .mockResolvedValueOnce([
        {
          id: 'snapshot-new',
          createdAt: new Date('2026-03-01T01:00:00Z'),
          configSignature: 'config-current',
          codeVersion: 'reversal_metrics_v1',
          config: { directionOnly: true },
          output: { summary: { status: 'COMPUTED' }, modelMetrics: [], rows: [] },
        },
        {
          id: 'snapshot-old',
          createdAt: new Date('2026-03-01T00:00:00Z'),
          configSignature: 'config-other',
          codeVersion: 'reversal_metrics_v1',
          config: { directionOnly: false },
          output: { summary: { status: 'INSUFFICIENT_DATA' }, modelMetrics: [], rows: [] },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'snapshot-new',
          createdAt: new Date('2026-03-01T01:00:00Z'),
          configSignature: 'config-current',
          codeVersion: 'reversal_metrics_v1',
          config: { directionOnly: true },
          output: { summary: { status: 'COMPUTED' }, modelMetrics: [], rows: [] },
        },
        {
          id: 'snapshot-old',
          createdAt: new Date('2026-03-01T00:00:00Z'),
          configSignature: 'config-other',
          codeVersion: 'reversal_metrics_v1',
          config: { directionOnly: false },
          output: { summary: { status: 'INSUFFICIENT_DATA' }, modelMetrics: [], rows: [] },
        },
      ]);

    await expect(getOrderInvarianceAnalysisResult({
      directionOnly: true,
      trimOutliers: true,
    })).rejects.toMatchObject({
      message: 'Assumptions analysis cache invariant failed. Duplicate CURRENT snapshots require manual repair.',
      code: 'ASSUMPTION_ANALYSIS_CACHE_INVARIANT',
    });

    expect(mockDb.assumptionAnalysisSnapshot.updateMany).not.toHaveBeenCalled();
    expect(mockDb.assumptionAnalysisSnapshot.create).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'cache_repair',
        snapshotIds: ['snapshot-new', 'snapshot-old'],
      }),
      'Order-effect cache repair failed: duplicate CURRENT snapshots were not provably equivalent'
    );
  });

  it('fails explicitly when duplicate CURRENT snapshots are discovered during snapshot write', async () => {
    const transcriptRecords = buildFullyFlippedDataset('2');
    mockDb.assumptionAnalysisSnapshot.findMany.mockReset();
    mockDb.assumptionAnalysisSnapshot.updateMany.mockReset();
    mockDb.assumptionAnalysisSnapshot.create.mockReset();
    mockDb.transcript.findMany.mockResolvedValue(transcriptRecords);
    mockDb.assumptionAnalysisSnapshot.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'snapshot-new',
          createdAt: new Date('2026-03-01T01:00:00Z'),
          configSignature: 'config-current',
          codeVersion: 'reversal_metrics_v1',
          config: { directionOnly: true },
          output: { summary: { status: 'COMPUTED' }, modelMetrics: [], rows: [] },
        },
        {
          id: 'snapshot-old',
          createdAt: new Date('2026-03-01T00:00:00Z'),
          configSignature: 'config-other',
          codeVersion: 'reversal_metrics_v1',
          config: { directionOnly: false },
          output: { summary: { status: 'INSUFFICIENT_DATA' }, modelMetrics: [], rows: [] },
        },
      ]);

    await expect(getOrderInvarianceAnalysisResult({
      directionOnly: true,
      trimOutliers: true,
    })).rejects.toMatchObject({
      message: 'Assumptions analysis cache invariant failed. Duplicate CURRENT snapshots require manual repair.',
      code: 'ASSUMPTION_ANALYSIS_CACHE_INVARIANT',
    });

    expect(mockDb.assumptionAnalysisSnapshot.create).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'cache_write',
        snapshotIds: ['snapshot-new', 'snapshot-old'],
      }),
      'Order-effect snapshot write failed because duplicate CURRENT snapshots require manual repair'
    );
  });
});
