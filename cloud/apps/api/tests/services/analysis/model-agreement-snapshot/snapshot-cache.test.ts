import type { PrismaClient } from '@valuerank/db';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { canonicalKey } from '../../../../src/services/analysis/model-agreement-snapshot/canonical-key.js';
import {
  getModelAgreementSnapshot,
  queueModelAgreementSnapshotRefresh,
} from '../../../../src/services/analysis/model-agreement-snapshot/snapshot-cache.js';

const mocks = vi.hoisted(() => ({
  computeInputFingerprint: vi.fn(),
}));

vi.mock('../../../../src/services/analysis/model-agreement-snapshot/fingerprint.js', () => ({
  computeInputFingerprint: mocks.computeInputFingerprint,
}));

function createPrismaMock(snapshot: unknown | null): PrismaClient {
  return {
    modelAgreementSnapshot: {
      findFirst: vi.fn().mockResolvedValue(snapshot),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaClient;
}

function createSnapshotRow(params: {
  scope: 'DOMAIN' | 'ALL_DOMAINS' | 'DOMAIN_SET';
  signature: string;
  domainIds: string[];
  modelIds: string[];
  sourceRunCount: number;
  sourceRunUpdatedAtSum: bigint;
  algorithmVersion: number;
}): Record<string, unknown> {
  const { domainIdsHash, modelIdsHash } = canonicalKey(params);
  return {
    scope: params.scope,
    signature: params.signature,
    domainIdsHash,
    modelIdsHash,
    domainIds: params.domainIds,
    modelIds: params.modelIds,
    agreementResultJson: {
      pending: false,
      buildProgress: null,
      models: [{ modelId: 'model-a', label: 'Model A' }],
      unavailableModels: [],
      excludedNonBinaryCells: 0,
      tiedCells: 0,
      pairwiseAgreementMatrix: [],
      trialConsistency: [],
    },
    sourceRunCount: params.sourceRunCount,
    sourceRunUpdatedAtSum: params.sourceRunUpdatedAtSum,
    algorithmVersion: params.algorithmVersion,
    computedAt: new Date('2026-05-01T12:00:00.000Z'),
  };
}

describe('model-agreement snapshot cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.computeInputFingerprint.mockResolvedValue({
      sourceRunCount: 2,
      sourceRunUpdatedAtSum: 100n,
    });
  });

  it('returns a fresh cache hit with the snapshot computed-at timestamp', async () => {
    const snapshot = createSnapshotRow({
      scope: 'DOMAIN',
      signature: 'vnewtd',
      domainIds: ['domain-a'],
      modelIds: ['model-a', 'model-b'],
      sourceRunCount: 2,
      sourceRunUpdatedAtSum: 100n,
      algorithmVersion: 1,
    });
    const prisma = createPrismaMock(snapshot);
    const queue = { send: vi.fn() };

    const result = await getModelAgreementSnapshot(
      prisma,
      queue,
      {
        scope: 'DOMAIN',
        signature: 'vnewtd',
        domainId: 'domain-a',
        domainIds: ['domain-a'],
        modelIds: ['model-b', 'model-a'],
        isCanonical: true,
      },
    );

    expect(result).toEqual({
      payload: snapshot.agreementResultJson,
      source: 'CACHE_HIT',
      snapshotComputedAt: new Date('2026-05-01T12:00:00.000Z'),
    });
    expect(queue.send).not.toHaveBeenCalled();
  });

  it('returns a stale cache hit and queues a refresh when the fingerprint changes', async () => {
    const snapshot = createSnapshotRow({
      scope: 'DOMAIN',
      signature: 'vnewtd',
      domainIds: ['domain-a'],
      modelIds: ['model-a', 'model-b'],
      sourceRunCount: 2,
      sourceRunUpdatedAtSum: 100n,
      algorithmVersion: 1,
    });
    const prisma = createPrismaMock(snapshot);
    const queue = { send: vi.fn().mockResolvedValue(undefined) };
    mocks.computeInputFingerprint.mockResolvedValue({
      sourceRunCount: 3,
      sourceRunUpdatedAtSum: 100n,
    });

    const result = await getModelAgreementSnapshot(
      prisma,
      queue,
      {
        scope: 'DOMAIN',
        signature: 'vnewtd',
        domainId: 'domain-a',
        domainIds: ['domain-a'],
        modelIds: ['model-a', 'model-b'],
        isCanonical: true,
      },
    );

    expect(result).toEqual({
      payload: snapshot.agreementResultJson,
      source: 'CACHE_HIT_STALE',
      snapshotComputedAt: new Date('2026-05-01T12:00:00.000Z'),
    });
    expect(queue.send).toHaveBeenCalledTimes(1);
  });

  it('returns BUILDING and queues a refresh on a canonical miss', async () => {
    const prisma = createPrismaMock(null);
    const queue = { send: vi.fn().mockResolvedValue(undefined) };

    const result = await getModelAgreementSnapshot(
      prisma,
      queue,
      {
        scope: 'DOMAIN',
        signature: 'vnewtd',
        domainId: 'domain-a',
        domainIds: ['domain-a'],
        modelIds: ['model-a', 'model-b'],
        isCanonical: true,
      },
    );

    expect(result).toEqual({
      payload: null,
      source: 'BUILDING',
      snapshotComputedAt: null,
    });
    expect(queue.send).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent canonical misses so only one refresh job is queued', async () => {
    const prisma = createPrismaMock(null);
    const queue = { send: vi.fn().mockResolvedValue(undefined) };

    await Promise.all(
      Array.from({ length: 10 }).map(() =>
        getModelAgreementSnapshot(
          prisma,
          queue,
          {
            scope: 'DOMAIN',
            signature: 'vnewtd',
            domainId: 'domain-a',
            domainIds: ['domain-a'],
            modelIds: ['model-a', 'model-b'],
            isCanonical: true,
          },
        )
      ),
    );

    expect(queue.send).toHaveBeenCalledTimes(1);
  });

  it('returns null for non-canonical selections without queueing', async () => {
    const prisma = createPrismaMock(null);
    const queue = { send: vi.fn() };

    const result = await getModelAgreementSnapshot(
      prisma,
      queue,
      {
        scope: 'DOMAIN',
        signature: 'vnewtd',
        domainId: 'domain-a',
        domainIds: ['domain-a'],
        modelIds: ['model-a', 'model-b'],
        isCanonical: false,
      },
    );

    expect(result).toBeNull();
    expect(queue.send).not.toHaveBeenCalled();
  });

  it('treats an algorithm version mismatch as stale', async () => {
    const snapshot = createSnapshotRow({
      scope: 'DOMAIN',
      signature: 'vnewtd',
      domainIds: ['domain-a'],
      modelIds: ['model-a', 'model-b'],
      sourceRunCount: 2,
      sourceRunUpdatedAtSum: 100n,
      algorithmVersion: 0,
    });
    const prisma = createPrismaMock(snapshot);
    const queue = { send: vi.fn().mockResolvedValue(undefined) };

    const result = await getModelAgreementSnapshot(
      prisma,
      queue,
      {
        scope: 'DOMAIN',
        signature: 'vnewtd',
        domainId: 'domain-a',
        domainIds: ['domain-a'],
        modelIds: ['model-a', 'model-b'],
        isCanonical: true,
      },
    );

    expect(result?.source).toBe('CACHE_HIT_STALE');
    expect(queue.send).toHaveBeenCalledTimes(1);
  });
});
