import type { PrismaClient } from '@valuerank/db';
import { describe, expect, it, vi } from 'vitest';
import { buildModelAgreementSnapshot } from '../../../../src/services/analysis/model-agreement-snapshot/snapshot-builder.js';

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

describe('buildModelAgreementSnapshot', () => {
  it('normalizes the key inputs and includes fingerprint fields in the row', async () => {
    mocks.computeModelAgreement.mockResolvedValue({
      pending: false,
      buildProgress: null,
      models: [{ modelId: 'model-a', label: 'Model A' }],
      unavailableModels: [],
      excludedNonBinaryCells: 0,
      tiedCells: 0,
      pairwiseAgreementMatrix: [],
      trialConsistency: [],
    });
    mocks.computeInputFingerprint.mockResolvedValue({
      sourceRunCount: 12,
      sourceRunUpdatedAtSum: 345n,
    });

    const row = await buildModelAgreementSnapshot({} as PrismaClient, {
      scope: 'DOMAIN_SET',
      signature: 'vnewtd',
      domainId: 'domain-a',
      domainIds: ['domain-b', 'domain-a', 'domain-a'],
      modelIds: ['model-b', 'model-a', 'model-b'],
    });

    expect(mocks.computeModelAgreement).toHaveBeenCalledWith(
      {},
      {
        scope: 'DOMAIN_SET',
        signature: 'vnewtd',
        domainId: 'domain-a',
        domainIds: ['domain-a', 'domain-b'],
        modelIds: ['model-a', 'model-b'],
      },
      expect.objectContaining({
        queueDomainAnalysisRefresh: expect.any(Function),
      }),
    );
    expect(mocks.computeInputFingerprint).toHaveBeenCalledWith(
      {},
      {
        scope: 'DOMAIN_SET',
        signature: 'vnewtd',
        domainId: 'domain-a',
        domainIds: ['domain-a', 'domain-b'],
        modelIds: ['model-a', 'model-b'],
      },
    );

    expect(row).toMatchObject({
      scope: 'DOMAIN_SET',
      signature: 'vnewtd',
      domainIds: ['domain-a', 'domain-b'],
      modelIds: ['model-a', 'model-b'],
      sourceRunCount: 12,
      sourceRunUpdatedAtSum: 345n,
      algorithmVersion: 1,
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
    });
    expect(row.domainIdsHash).toMatch(/^[0-9a-f]{32}$/);
    expect(row.modelIdsHash).toMatch(/^[0-9a-f]{32}$/);
    expect(row.computedAt).toBeInstanceOf(Date);
  });
});
