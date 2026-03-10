import { describe, expect, it, vi } from 'vitest';
import {
  buildOrderEffectCachePayload,
  buildOrderEffectSnapshotConfig,
  DuplicateCurrentOrderEffectSnapshotError,
  computeOrderEffectConfigSignature,
  computeOrderEffectInputHash,
  getCurrentOrderEffectSnapshot,
  repairDuplicateCurrentOrderEffectSnapshots,
  writeCurrentOrderEffectSnapshot,
} from '../order-effect-cache.js';

function buildPayload(overrides: Partial<Parameters<typeof buildOrderEffectCachePayload>[0]> = {}) {
  return buildOrderEffectCachePayload({
    trimOutliers: true,
    directionOnly: true,
    requiredTrialCount: 5,
    lockedVignetteIds: ['v2', 'v1'],
    approvedPairIds: ['p2', 'p1'],
    snapshotModelIds: ['m2', 'm1'],
    selectionFingerprints: ['t2:state', 't1:state'],
    ...overrides,
  });
}

describe('order-effect-cache helpers', () => {
  it('generates a deterministic hash for identical inputs', () => {
    const left = computeOrderEffectInputHash(buildPayload());
    const right = computeOrderEffectInputHash(buildPayload());
    expect(left).toBe(right);
  });

  it('sorts ids before hashing so input order alone does not change the hash', () => {
    const left = computeOrderEffectInputHash(buildPayload());
    const right = computeOrderEffectInputHash(buildPayload({
      lockedVignetteIds: ['v1', 'v2'],
      approvedPairIds: ['p1', 'p2'],
      snapshotModelIds: ['m1', 'm2'],
      selectionFingerprints: ['t1:state', 't2:state'],
    }));

    expect(left).toBe(right);
  });

  it('changes the hash when one selected transcript fingerprint changes', () => {
    const baseline = computeOrderEffectInputHash(buildPayload());
    const changed = computeOrderEffectInputHash(buildPayload({
      selectionFingerprints: ['t1:state', 't3:changed'],
    }));

    expect(changed).not.toBe(baseline);
  });

  it('changes the hash when the config-significant transcript state changes in place', () => {
    const baseline = computeOrderEffectInputHash(buildPayload());
    const changed = computeOrderEffectInputHash(buildPayload({
      selectionFingerprints: ['t1:decision-4', 't2:state'],
    }));

    expect(changed).not.toBe(baseline);
  });

  it('changes the hash when trimOutliers changes', () => {
    const baseline = computeOrderEffectInputHash(buildPayload());
    const changed = computeOrderEffectInputHash(buildPayload({ trimOutliers: false }));

    expect(changed).not.toBe(baseline);
  });

  it('changes the hash when directionOnly changes', () => {
    const baseline = computeOrderEffectInputHash(buildPayload());
    const changed = computeOrderEffectInputHash(buildPayload({ directionOnly: false }));

    expect(changed).not.toBe(baseline);
  });

  it('changes the hash when codeVersion changes', () => {
    const baseline = computeOrderEffectInputHash(buildPayload());
    const changed = computeOrderEffectInputHash(buildPayload({ codeVersion: 'reversal_metrics_v2' }));

    expect(changed).not.toBe(baseline);
  });

  it('does not change config signature if UI model filter changes but snapshot model ids do not', () => {
    const config = buildOrderEffectSnapshotConfig(buildPayload());
    const sameConfig = buildOrderEffectSnapshotConfig(buildPayload());

    expect(computeOrderEffectConfigSignature(config)).toBe(
      computeOrderEffectConfigSignature(sameConfig)
    );
  });

  it('changes config signature when the snapshot model set changes', () => {
    const config = buildOrderEffectSnapshotConfig(buildPayload());
    const changed = buildOrderEffectSnapshotConfig(buildPayload({
      snapshotModelIds: ['m1', 'm3'],
    }));

    expect(computeOrderEffectConfigSignature(changed)).not.toBe(
      computeOrderEffectConfigSignature(config)
    );
  });

  it('queries CURRENT snapshots with the exact cache-hit predicate', async () => {
    const findMany = vi.fn(async () => []);
    const client = {
      assumptionAnalysisSnapshot: {
        findMany,
      },
    };

    await getCurrentOrderEffectSnapshot(client as never, { inputHash: 'abc123' });

    expect(client.assumptionAnalysisSnapshot.findMany).toHaveBeenCalledWith({
      where: {
        assumptionKey: 'order_invariance',
        analysisType: 'reversal_metrics_v1',
        inputHash: 'abc123',
        status: 'CURRENT',
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 2,
    });
  });

  it('throws when duplicate CURRENT snapshots match one input hash', async () => {
    const client = {
      assumptionAnalysisSnapshot: {
        findMany: vi.fn(async () => ([
          { id: 'snapshot-1' },
          { id: 'snapshot-2' },
        ])),
      },
    };

    await expect(
      getCurrentOrderEffectSnapshot(client as never, { inputHash: 'dup-hash' })
    ).rejects.toBeInstanceOf(DuplicateCurrentOrderEffectSnapshotError);
  });

  it('repairs duplicate CURRENT snapshots by superseding older matches', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const client = {
      assumptionAnalysisSnapshot: {
        findMany: vi.fn(async () => ([
          { id: 'snapshot-new', createdAt: new Date('2026-03-01T01:00:00Z') },
          { id: 'snapshot-old', createdAt: new Date('2026-03-01T00:00:00Z') },
        ])),
        updateMany,
      },
    };

    const keptSnapshot = await repairDuplicateCurrentOrderEffectSnapshots(client as never, { inputHash: 'dup-hash' });

    expect(keptSnapshot?.id).toBe('snapshot-new');
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['snapshot-old'] },
        status: 'CURRENT',
        deletedAt: null,
      },
      data: {
        status: 'SUPERSEDED',
      },
    });
  });

  it('supersedes only CURRENT snapshots with the same config signature before creating a replacement', async () => {
    const payload = buildPayload();
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'snapshot-new', ...data }));
    const client = {
      assumptionAnalysisSnapshot: {
        findMany: vi.fn(async () => []),
        updateMany,
        create,
      },
    };

    await writeCurrentOrderEffectSnapshot({
      client: client as never,
      payload,
      output: { summary: {}, modelMetrics: [], rows: [] } as never,
      allowReuseCurrent: false,
    });

    expect(client.assumptionAnalysisSnapshot.updateMany).toHaveBeenCalledWith({
      where: {
        assumptionKey: payload.assumptionKey,
        analysisType: payload.analysisType,
        configSignature: payload.configSignature,
        status: 'CURRENT',
        deletedAt: null,
      },
      data: {
        status: 'SUPERSEDED',
      },
    });
    expect(client.assumptionAnalysisSnapshot.create).toHaveBeenCalledWith({
      data: {
        assumptionKey: payload.assumptionKey,
        analysisType: payload.analysisType,
        inputHash: payload.inputHash,
        codeVersion: payload.codeVersion,
        configSignature: payload.configSignature,
        config: buildOrderEffectSnapshotConfig(payload),
        output: { summary: {}, modelMetrics: [], rows: [] },
        status: 'CURRENT',
      },
    });
  });
});
