import { describe, expect, it } from 'vitest';
import {
  buildOrderEffectCachePayload,
  buildOrderEffectSnapshotConfig,
  computeOrderEffectConfigSignature,
  computeOrderEffectInputHash,
} from '../order-effect-cache.js';

function buildPayload(overrides: Partial<Parameters<typeof buildOrderEffectCachePayload>[0]> = {}) {
  return buildOrderEffectCachePayload({
    trimOutliers: true,
    directionOnly: true,
    requiredTrialCount: 5,
    lockedVignetteIds: ['v2', 'v1'],
    approvedPairIds: ['p2', 'p1'],
    snapshotModelIds: ['m2', 'm1'],
    candidateTranscriptIds: ['t2', 't1'],
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
      candidateTranscriptIds: ['t1', 't2'],
    }));

    expect(left).toBe(right);
  });

  it('changes the hash when one transcript id changes', () => {
    const baseline = computeOrderEffectInputHash(buildPayload());
    const changed = computeOrderEffectInputHash(buildPayload({
      candidateTranscriptIds: ['t1', 't3'],
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
});
