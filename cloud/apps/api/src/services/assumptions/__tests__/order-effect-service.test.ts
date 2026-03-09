import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@valuerank/shared', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

vi.mock('@valuerank/db', () => ({
  db: {
    $transaction: vi.fn(),
    $queryRawUnsafe: vi.fn(),
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

const mockDb = db as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  $queryRawUnsafe: ReturnType<typeof vi.fn>;
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
    mockDb.$queryRawUnsafe.mockResolvedValue([]);
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
});
