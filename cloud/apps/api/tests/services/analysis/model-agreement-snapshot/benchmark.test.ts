import { performance } from 'node:perf_hooks';
import type { PrismaClient } from '@valuerank/db';
import { describe, expect, it, vi } from 'vitest';
import { buildModelAgreementSnapshot } from '../../../../src/services/analysis/model-agreement-snapshot/snapshot-builder.js';

const shouldRun = process.env.RUN_AGREEMENT_BENCHMARK === '1';

const mocks = vi.hoisted(() => ({
  computeModelAgreement: vi.fn(),
  computeInputFingerprint: vi.fn(),
}));

vi.mock('../../../../src/services/model-agreement/compute.js', () => ({
  computeModelAgreement: mocks.computeModelAgreement,
}));

vi.mock('../../../../src/services/analysis/model-agreement-snapshot/fingerprint.js', () => ({
  computeInputFingerprint: mocks.computeInputFingerprint,
}));

describe.skipIf(!shouldRun)('model-agreement snapshot benchmark', () => {
  it('builds a canonical snapshot within the queue timeout', async () => {
    mocks.computeModelAgreement.mockResolvedValue({
      pending: false,
      buildProgress: null,
      models: Array.from({ length: 8 }).map((_, index) => ({
        modelId: `model-${index + 1}`,
        label: `Model ${index + 1}`,
      })),
      unavailableModels: [],
      excludedNonBinaryCells: 0,
      tiedCells: 0,
      pairwiseAgreementMatrix: Array.from({ length: 28 }).map((_, index) => ({
        modelAId: `model-${(index % 8) + 1}`,
        modelALabel: `Model ${(index % 8) + 1}`,
        modelBId: `model-${((index + 1) % 8) + 1}`,
        modelBLabel: `Model ${((index + 1) % 8) + 1}`,
        totalCells: 1000,
        percentAgreement: 0.5,
        cohensKappa: 0.1,
        kappaInterpretation: 'Slight',
        meanAbsoluteDivergence: 0.25,
        cohensKappaConfidenceLow: 0.05,
        cohensKappaConfidenceHigh: 0.15,
        cohensKappaConfidenceIsSymmetric: true,
      })),
      trialConsistency: [],
    });
    mocks.computeInputFingerprint.mockResolvedValue({
      sourceRunCount: 1000,
      sourceRunUpdatedAtSum: 1n,
    });

    const start = performance.now();
    await buildModelAgreementSnapshot({} as PrismaClient, {
      scope: 'ALL_DOMAINS',
      signature: 'vnewtd',
      domainId: null,
      domainIds: [],
      modelIds: Array.from({ length: 8 }).map((_, index) => `model-${index + 1}`),
    });
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(600_000);
  });
});
