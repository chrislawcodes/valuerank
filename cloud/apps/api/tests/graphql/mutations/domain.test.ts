import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import { createServer } from '../../../src/server.js';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';
import { startRun } from '../../../src/services/run/index.js';

vi.mock('../../../src/services/run/index.js', () => ({
  startRun: vi.fn(),
}));

const app = createServer();

const RUN_TRIALS_FOR_DOMAIN_MUTATION = `
  mutation RunTrialsForDomain($domainId: ID!) {
    runTrialsForDomain(domainId: $domainId) {
      domainEvaluationId
      scopeCategory
      success
      totalDefinitions
      targetedDefinitions
      startedRuns
      failedDefinitions
    }
  }
`;

const START_DOMAIN_EVALUATION_MUTATION = `
  mutation StartDomainEvaluation(
    $domainId: ID!
    $scopeCategory: String
    $definitionIds: [ID!]
    $modelIds: [String!]
    $samplePercentage: Int
    $samplesPerScenario: Int
  ) {
    startDomainEvaluation(
      domainId: $domainId
      scopeCategory: $scopeCategory
      definitionIds: $definitionIds
      modelIds: $modelIds
      samplePercentage: $samplePercentage
      samplesPerScenario: $samplesPerScenario
    ) {
      domainEvaluationId
      scopeCategory
      success
      targetedDefinitions
      startedRuns
      runs {
        definitionId
        runId
        modelIds
      }
    }
  }
`;

describe('GraphQL Domain Mutations', () => {
  const createdDomainIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  const createdUserIds: string[] = [];
  const startRunMock = vi.mocked(startRun);

  beforeAll(async () => {
    await db.user.upsert({
      where: { id: TEST_USER.id },
      create: {
        id: TEST_USER.id,
        email: TEST_USER.email,
        passwordHash: 'test-hash',
      },
      update: {},
    });

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

    startRunMock.mockImplementation(async (input) => {
      const run = await db.run.create({
        data: {
          definitionId: input.definitionId,
          status: 'PENDING',
          runCategory: input.runCategory ?? 'UNKNOWN_LEGACY',
          config: {
            models: input.models,
            temperature: input.temperature ?? null,
            samplePercentage: input.samplePercentage ?? null,
            samplesPerScenario: input.samplesPerScenario ?? null,
          },
          progress: {
            total: 1,
            completed: 0,
            failed: 0,
          },
          createdByUserId: input.userId ?? TEST_USER.id,
        },
      });

      return {
        run: {
          id: run.id,
          status: run.status,
          definitionId: run.definitionId,
          experimentId: run.experimentId,
          config: run.config,
          progress: { total: 1, completed: 0, failed: 0 },
          createdAt: run.createdAt,
        },
        jobCount: 1,
        estimatedCosts: {
          total: 0,
          byModel: {},
          grandTotal: 0,
          warnings: [],
        },
      };
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
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
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
    expect(response.body.data.runTrialsForDomain.domainEvaluationId).toBeTruthy();
    expect(response.body.data.runTrialsForDomain.scopeCategory).toBe('PRODUCTION');
    expect(response.body.data.runTrialsForDomain.targetedDefinitions).toBe(2);
    expect(response.body.data.runTrialsForDomain.startedRuns).toBe(2);
    expect(startRunMock).toHaveBeenCalledTimes(2);

    const startedDefinitionIds = startRunMock.mock.calls.map((call) => call[0]?.definitionId);
    expect(startedDefinitionIds).toContain(latest.id);
    expect(startedDefinitionIds).toContain(secondLineage.id);
    expect(startedDefinitionIds).not.toContain(root.id);
    expect(startedDefinitionIds).not.toContain(mid.id);

    const domainEvaluationId = response.body.data.runTrialsForDomain.domainEvaluationId as string;
    const evaluation = await db.domainEvaluation.findUnique({
      where: { id: domainEvaluationId },
      include: { members: true },
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation?.domainId).toBe(domain.id);
    expect(evaluation?.scopeCategory).toBe('PRODUCTION');
    expect(evaluation?.members).toHaveLength(2);
    expect(evaluation?.members.map((member) => member.definitionIdAtLaunch).sort()).toEqual(
      [latest.id, secondLineage.id].sort(),
    );
  });

  it('allows domain trial execution when domain definitions are owned by another user', async () => {
    const domain = await db.domain.create({
      data: { name: 'Domain Unauthorized', normalizedName: `domain-unauthorized-${Date.now()}` },
    });
    createdDomainIds.push(domain.id);

    const foreignUser = await db.user.create({
      data: {
        id: `other-user-id-${Date.now()}`,
        email: `other-user-${Date.now()}@example.com`,
        passwordHash: 'test-hash',
      },
    });
    createdUserIds.push(foreignUser.id);

    const foreignDefinition = await db.definition.create({
      data: {
        name: 'Foreign Definition',
        domainId: domain.id,
        version: 1,
        content: { schema_version: 1, preamble: 'foreign' },
        createdByUserId: foreignUser.id,
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

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.runTrialsForDomain.domainEvaluationId).toBeTruthy();
    expect(response.body.data.runTrialsForDomain.scopeCategory).toBe('PRODUCTION');
    expect(response.body.data.runTrialsForDomain.targetedDefinitions).toBe(1);
    expect(response.body.data.runTrialsForDomain.startedRuns).toBe(1);
    expect(startRunMock).toHaveBeenCalledTimes(1);
    expect(startRunMock.mock.calls[0]?.[0]?.definitionId).toBe(foreignDefinition.id);

    const domainEvaluationId = response.body.data.runTrialsForDomain.domainEvaluationId as string;
    const evaluation = await db.domainEvaluation.findUnique({
      where: { id: domainEvaluationId },
      include: { members: true },
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation?.createdByUserId).toBe(TEST_USER.id);
    expect(evaluation?.members).toHaveLength(1);
    expect(evaluation?.members[0]?.definitionIdAtLaunch).toBe(foreignDefinition.id);
  });

  it('starts a scoped domain evaluation with explicit run parameters', async () => {
    const domain = await db.domain.create({
      data: { name: 'Domain Pilot Launch', normalizedName: `domain-pilot-launch-${Date.now()}` },
    });
    createdDomainIds.push(domain.id);

    const definition = await db.definition.create({
      data: {
        name: 'Pilot Definition',
        domainId: domain.id,
        version: 1,
        content: { schema_version: 1, preamble: 'pilot' },
        createdByUserId: TEST_USER.id,
      },
    });
    createdDefinitionIds.push(definition.id);

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: START_DOMAIN_EVALUATION_MUTATION,
        variables: {
          domainId: domain.id,
          scopeCategory: 'PILOT',
          definitionIds: [definition.id],
          modelIds: ['test-domain-model'],
          samplePercentage: 50,
          samplesPerScenario: 2,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.startDomainEvaluation.domainEvaluationId).toBeTruthy();
    expect(response.body.data.startDomainEvaluation.scopeCategory).toBe('PILOT');
    expect(response.body.data.startDomainEvaluation.targetedDefinitions).toBe(1);
    expect(response.body.data.startDomainEvaluation.startedRuns).toBe(1);
    expect(startRunMock).toHaveBeenCalledTimes(1);

    const startArgs = startRunMock.mock.calls[0]?.[0];
    expect(startArgs?.runCategory).toBe('PILOT');
    expect(startArgs?.models).toEqual(['test-domain-model']);
    expect(startArgs?.samplePercentage).toBe(50);
    expect(startArgs?.samplesPerScenario).toBe(2);

    const domainEvaluationId = response.body.data.startDomainEvaluation.domainEvaluationId as string;
    const evaluation = await db.domainEvaluation.findUnique({
      where: { id: domainEvaluationId },
      include: { members: { include: { run: true } } },
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation?.scopeCategory).toBe('PILOT');
    expect(evaluation?.members).toHaveLength(1);
    expect(evaluation?.members[0]?.run.runCategory).toBe('PILOT');
    expect(evaluation?.configSnapshot).toMatchObject({
      samplePercentage: 50,
      samplesPerScenario: 2,
      runCategory: 'PILOT',
      models: ['test-domain-model'],
    });
  });
});
