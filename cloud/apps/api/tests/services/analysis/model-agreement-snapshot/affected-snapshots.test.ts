import type { PrismaClient } from '@valuerank/db';
import { describe, expect, it, vi } from 'vitest';
import { getAffectedCanonicalKeys } from '../../../../src/services/analysis/model-agreement-snapshot/affected-snapshots.js';

const mocks = vi.hoisted(() => ({
  getModelsFromDatabase: vi.fn(),
}));

vi.mock('../../../../src/config/models.js', () => ({
  getModelsFromDatabase: mocks.getModelsFromDatabase,
}));

function createPrismaMock(domainSetRows: Array<{ domainIds: string[] }>): PrismaClient {
  return {
    modelAgreementSnapshot: {
      findMany: vi.fn().mockResolvedValue(domainSetRows),
    },
  } as unknown as PrismaClient;
}

describe('getAffectedCanonicalKeys', () => {
  it('returns the single-domain, all-domains, and matching domain-set keys', async () => {
    mocks.getModelsFromDatabase.mockResolvedValue([
      { modelId: 'model-a', isDefault: true },
      { modelId: 'model-b', isDefault: true },
      { modelId: 'model-c', isDefault: false },
    ]);

    const prisma = createPrismaMock([
      { domainIds: ['domain-b', 'domain-a'] },
      { domainIds: ['domain-c', 'domain-a'] },
    ]);

    const keys = await getAffectedCanonicalKeys(prisma, {
      signature: 'vnewtd',
      domainId: 'domain-a',
    });

    expect(keys).toEqual([
      {
        scope: 'DOMAIN',
        signature: 'vnewtd',
        domainId: 'domain-a',
        domainIds: ['domain-a'],
        modelIds: ['model-a', 'model-b'],
      },
      {
        scope: 'ALL_DOMAINS',
        signature: 'vnewtd',
        domainId: null,
        domainIds: [],
        modelIds: ['model-a', 'model-b'],
      },
      {
        scope: 'DOMAIN_SET',
        signature: 'vnewtd',
        domainId: null,
        domainIds: ['domain-a', 'domain-b'],
        modelIds: ['model-a', 'model-b'],
      },
      {
        scope: 'DOMAIN_SET',
        signature: 'vnewtd',
        domainId: null,
        domainIds: ['domain-a', 'domain-c'],
        modelIds: ['model-a', 'model-b'],
      },
    ]);
  });

  it('returns only the single-domain and all-domains keys when there are no domain-set snapshots', async () => {
    mocks.getModelsFromDatabase.mockResolvedValue([
      { modelId: 'model-a', isDefault: true },
      { modelId: 'model-b', isDefault: true },
    ]);

    const prisma = createPrismaMock([]);

    const keys = await getAffectedCanonicalKeys(prisma, {
      signature: 'vnewtd',
      domainId: 'domain-a',
    });

    expect(keys).toEqual([
      {
        scope: 'DOMAIN',
        signature: 'vnewtd',
        domainId: 'domain-a',
        domainIds: ['domain-a'],
        modelIds: ['model-a', 'model-b'],
      },
      {
        scope: 'ALL_DOMAINS',
        signature: 'vnewtd',
        domainId: null,
        domainIds: [],
        modelIds: ['model-a', 'model-b'],
      },
    ]);
  });
});
