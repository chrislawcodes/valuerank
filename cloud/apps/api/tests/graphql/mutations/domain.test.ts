import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import { createServer } from '../../../src/server.js';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';
import { startRun } from '../../../src/services/run/index.js';

vi.mock('../../../src/services/run/index.js', () => ({
  startRun: vi.fn().mockResolvedValue({ run: { id: 'mock-run-id' }, jobCount: 1 }),
}));

const app = createServer();

const RUN_TRIALS_FOR_DOMAIN_MUTATION = `
  mutation RunTrialsForDomain($domainId: ID!) {
    runTrialsForDomain(domainId: $domainId) {
      success
      totalDefinitions
      targetedDefinitions
      startedRuns
      failedDefinitions
    }
  }
`;

describe('GraphQL Domain Mutations', () => {
  const createdDomainIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  const startRunMock = vi.mocked(startRun);

  beforeAll(async () => {
    const provider = await db.llmProvider.upsert({
      where: { name: 'test-provider-domain-mutation' },
      create: { name: 'test-provider-domain-mutation', displayName: 'Test Provider Domain' },
      update: {},
    });
    await db.llmModel.upsert({
      where: { providerId_modelId: { providerId: provider.id, modelId: 'test-domain-model' } },
      create: {
        providerId: provider.id,
        modelId: 'test-domain-model',
        displayName: 'Test Domain Model',
        status: 'ACTIVE',
        isDefault: true,
        costInputPerMillion: 1,
        costOutputPerMillion: 1,
      },
      update: { status: 'ACTIVE', isDefault: true },
    });
  });

  afterEach(async () => {
    startRunMock.mockClear();
    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
      createdDefinitionIds.length = 0;
    }
    if (createdDomainIds.length > 0) {
      await db.domain.deleteMany({ where: { id: { in: createdDomainIds } } });
      createdDomainIds.length = 0;
    }
  });

  it('runs only latest definition per lineage when triggering domain trials', async () => {
    const domain = await db.domain.create({
      data: { name: 'Domain Test Latest', normalizedName: `domain-test-latest-${Date.now()}` },
    });
    createdDomainIds.push(domain.id);

    const root = await db.definition.create({
      data: {
        name: 'Lineage Root',
        domainId: domain.id,
        version: 1,
        content: { schema_version: 1, preamble: 'root' },
        createdByUserId: TEST_USER.id,
      },
    });
    createdDefinitionIds.push(root.id);

    const mid = await db.definition.create({
      data: {
        name: 'Lineage Mid',
        domainId: domain.id,
        parentId: root.id,
        version: 2,
        content: { schema_version: 1, preamble: 'mid' },
        createdByUserId: TEST_USER.id,
      },
    });
    createdDefinitionIds.push(mid.id);

    const latest = await db.definition.create({
      data: {
        name: 'Lineage Latest',
        domainId: domain.id,
        parentId: mid.id,
        version: 3,
        content: { schema_version: 1, preamble: 'latest' },
        createdByUserId: TEST_USER.id,
      },
    });
    createdDefinitionIds.push(latest.id);

    const secondLineage = await db.definition.create({
      data: {
        name: 'Second Lineage Root',
        domainId: domain.id,
        version: 1,
        content: { schema_version: 1, preamble: 'second' },
        createdByUserId: TEST_USER.id,
      },
    });
    createdDefinitionIds.push(secondLineage.id);

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: RUN_TRIALS_FOR_DOMAIN_MUTATION,
        variables: { domainId: domain.id },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.runTrialsForDomain.targetedDefinitions).toBe(2);
    expect(response.body.data.runTrialsForDomain.startedRuns).toBe(2);
    expect(startRunMock).toHaveBeenCalledTimes(2);

    const startedDefinitionIds = startRunMock.mock.calls.map((call) => call[0]?.definitionId);
    expect(startedDefinitionIds).toContain(latest.id);
    expect(startedDefinitionIds).toContain(secondLineage.id);
    expect(startedDefinitionIds).not.toContain(root.id);
    expect(startedDefinitionIds).not.toContain(mid.id);
  });

  it('rejects domain trial execution when user does not own domain definitions', async () => {
    const domain = await db.domain.create({
      data: { name: 'Domain Unauthorized', normalizedName: `domain-unauthorized-${Date.now()}` },
    });
    createdDomainIds.push(domain.id);

    const foreignDefinition = await db.definition.create({
      data: {
        name: 'Foreign Definition',
        domainId: domain.id,
        version: 1,
        content: { schema_version: 1, preamble: 'foreign' },
        createdByUserId: 'other-user-id',
      },
    });
    createdDefinitionIds.push(foreignDefinition.id);

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: RUN_TRIALS_FOR_DOMAIN_MUTATION,
        variables: { domainId: domain.id },
      });

    expect([200, 401]).toContain(response.status);
    const message = response.body?.errors?.[0]?.message ?? response.body?.error ?? '';
    expect(String(message)).toContain('Not authorized to run trials for this domain');
    expect(startRunMock).not.toHaveBeenCalled();
  });
});

