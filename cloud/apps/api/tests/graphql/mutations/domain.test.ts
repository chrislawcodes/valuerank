import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import { createServer } from '../../../src/server.js';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';
import { startRun } from '../../../src/services/run/index.js';

const bossSendMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/run/index.js', () => ({
  startRun: vi.fn(),
}));

vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: bossSendMock,
  })),
  createBoss: vi.fn(() => ({
    send: bossSendMock,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  startBoss: vi.fn().mockResolvedValue(undefined),
  stopBoss: vi.fn().mockResolvedValue(undefined),
  isBossRunning: vi.fn().mockReturnValue(false),
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

const BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION = `
  mutation BackfillDomainEvaluationModels(
    $domainEvaluationId: ID!
    $modelIds: [String!]!
    $definitionIds: [ID!]
    $targetBatchCount: Int
  ) {
    backfillDomainEvaluationModels(
      domainEvaluationId: $domainEvaluationId
      modelIds: $modelIds
      definitionIds: $definitionIds
      targetBatchCount: $targetBatchCount
    ) {
      domainEvaluationId
      scopeCategory
      success
      targetedDefinitions
      startedRuns
      failedDefinitions
      runs {
        definitionId
        runId
        modelIds
      }
    }
  }
`;

const RETRY_DOMAIN_TRIAL_CELL_MUTATION = `
  mutation RetryDomainTrialCell(
    $domainId: ID!
    $definitionId: ID!
    $modelId: String!
    $temperature: Float
    $scopeCategory: String
  ) {
    retryDomainTrialCell(
      domainId: $domainId
      definitionId: $definitionId
      modelId: $modelId
      temperature: $temperature
      scopeCategory: $scopeCategory
    ) {
      success
      definitionId
      modelId
      runId
      message
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
    await db.llmModel.upsert({
      where: { providerId_modelId: { providerId: provider.id, modelId: 'test-domain-model-2' } },
      create: {
        providerId: provider.id,
        modelId: 'test-domain-model-2',
        displayName: 'Test Domain Model 2',
        status: 'ACTIVE',
        isDefault: false,
        costInputPerMillion: 1,
        costOutputPerMillion: 1,
      },
      update: { status: 'ACTIVE', isDefault: false },
    });

    bossSendMock.mockResolvedValue('mock-job-id');

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
            ...(input.configExtras as Record<string, unknown> | undefined ?? {}),
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

  async function seedEvaluationMembers(params: {
    domainEvaluationId: string;
    domainId: string;
    entries: Array<{
      definitionId: string;
      models: string[];
      runCategory?: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION' | 'UNKNOWN_LEGACY';
    }>;
  }): Promise<string[]> {
    const runIds: string[] = [];
    const evaluation = await db.domainEvaluation.findUnique({
      where: { id: params.domainEvaluationId },
      select: { configSnapshot: true },
    });
    const existingSnapshot =
      evaluation?.configSnapshot != null && typeof evaluation.configSnapshot === 'object' && !Array.isArray(evaluation.configSnapshot)
        ? evaluation.configSnapshot as Record<string, unknown>
        : {};

    for (const entry of params.entries) {
      const run = await db.run.create({
        data: {
          definitionId: entry.definitionId,
          status: 'RUNNING',
          runCategory: entry.runCategory ?? 'PRODUCTION',
          config: {
            models: entry.models,
            temperature: null,
            samplePercentage: 100,
            samplesPerScenario: 1,
          },
          progress: { total: 1, completed: 0, failed: 0 },
          createdByUserId: TEST_USER.id,
        },
      });
      runIds.push(run.id);

      const definition = await db.definition.findUnique({
        where: { id: entry.definitionId },
        select: { name: true },
      });

      await db.domainEvaluationRun.create({
        data: {
          domainEvaluationId: params.domainEvaluationId,
          runId: run.id,
          definitionIdAtLaunch: entry.definitionId,
          definitionNameAtLaunch: definition?.name ?? 'Untitled vignette',
          domainIdAtLaunch: params.domainId,
        },
      });
    }

    await db.domainEvaluation.update({
      where: { id: params.domainEvaluationId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        configSnapshot: {
          ...existingSnapshot,
          startedRuns: params.entries.length,
          failedDefinitions: 0,
        },
      },
    });

    return runIds;
  }

  function expectDomainLaunchQueued(domainEvaluationId: string): void {
    expect(bossSendMock).toHaveBeenCalledWith(
      'start_domain_launch',
      { domainEvaluationId },
      expect.objectContaining({
        singletonKey: domainEvaluationId,
      }),
    );
  }

  afterEach(async () => {
    startRunMock.mockClear();
    bossSendMock.mockClear();
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
    expect(response.body.data.runTrialsForDomain.startedRuns).toBe(0);
    expect(startRunMock).not.toHaveBeenCalled();

    const domainEvaluationId = response.body.data.runTrialsForDomain.domainEvaluationId as string;
    expectDomainLaunchQueued(domainEvaluationId);
    const evaluation = await db.domainEvaluation.findUnique({
      where: { id: domainEvaluationId },
      include: { members: true },
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation?.domainId).toBe(domain.id);
    expect(evaluation?.scopeCategory).toBe('PRODUCTION');
    expect(evaluation?.members).toHaveLength(0);
    expect((evaluation?.configSnapshot as { launchableDefinitionIds?: string[] } | null)?.launchableDefinitionIds?.sort()).toEqual(
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
    expect(response.body.data.runTrialsForDomain.startedRuns).toBe(0);
    expect(startRunMock).not.toHaveBeenCalled();

    const domainEvaluationId = response.body.data.runTrialsForDomain.domainEvaluationId as string;
    expectDomainLaunchQueued(domainEvaluationId);
    const evaluation = await db.domainEvaluation.findUnique({
      where: { id: domainEvaluationId },
      include: { members: true },
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation?.createdByUserId).toBe(TEST_USER.id);
    expect(evaluation?.members).toHaveLength(0);
    expect((evaluation?.configSnapshot as { launchableDefinitionIds?: string[] } | null)?.launchableDefinitionIds).toEqual([foreignDefinition.id]);
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
    expect(response.body.data.startDomainEvaluation.startedRuns).toBe(0);
    expect(startRunMock).not.toHaveBeenCalled();

    const domainEvaluationId = response.body.data.startDomainEvaluation.domainEvaluationId as string;
    expectDomainLaunchQueued(domainEvaluationId);
    const evaluation = await db.domainEvaluation.findUnique({
      where: { id: domainEvaluationId },
      include: { members: { include: { run: true } } },
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation?.scopeCategory).toBe('PILOT');
    expect(evaluation?.members).toHaveLength(0);
    expect(evaluation?.configSnapshot).toMatchObject({
      samplePercentage: 50,
      samplesPerScenario: 2,
      runCategory: 'PILOT',
      models: ['test-domain-model'],
    });
  });

  it('does not let an active production run block a pilot launch for the same vignette set', async () => {
    const domain = await db.domain.create({
      data: { name: 'Domain Scope Dedupe', normalizedName: `domain-scope-dedupe-${Date.now()}` },
    });
    createdDomainIds.push(domain.id);

    const definition = await db.definition.create({
      data: {
        name: 'Scope Sensitive Definition',
        domainId: domain.id,
        version: 1,
        content: { schema_version: 1, preamble: 'pilot' },
        createdByUserId: TEST_USER.id,
      },
    });
    createdDefinitionIds.push(definition.id);

    await db.run.create({
      data: {
        definitionId: definition.id,
        status: 'RUNNING',
        runCategory: 'PRODUCTION',
        config: {
          models: ['test-domain-model'],
          temperature: null,
          samplePercentage: 100,
          samplesPerScenario: 1,
        },
        progress: { total: 1, completed: 0, failed: 0 },
        createdByUserId: TEST_USER.id,
      },
    });

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
          samplePercentage: 100,
          samplesPerScenario: 1,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.startDomainEvaluation.startedRuns).toBe(0);
    expect(startRunMock).not.toHaveBeenCalled();
    expectDomainLaunchQueued(response.body.data.startDomainEvaluation.domainEvaluationId as string);
  });

  it('preserves the selected scope category when retrying a domain trial cell', async () => {
    const domain = await db.domain.create({
      data: { name: 'Domain Retry Scope', normalizedName: `domain-retry-scope-${Date.now()}` },
    });
    createdDomainIds.push(domain.id);

    const definition = await db.definition.create({
      data: {
        name: 'Retry Scope Definition',
        domainId: domain.id,
        version: 1,
        content: { schema_version: 1, preamble: 'retry' },
        createdByUserId: TEST_USER.id,
      },
    });
    createdDefinitionIds.push(definition.id);

    await db.run.create({
      data: {
        definitionId: definition.id,
        status: 'RUNNING',
        runCategory: 'PRODUCTION',
        config: {
          models: ['test-domain-model'],
          temperature: 0.4,
        },
        progress: { total: 1, completed: 0, failed: 0 },
        createdByUserId: TEST_USER.id,
      },
    });

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: RETRY_DOMAIN_TRIAL_CELL_MUTATION,
        variables: {
          domainId: domain.id,
          definitionId: definition.id,
          modelId: 'test-domain-model',
          temperature: 0.4,
          scopeCategory: 'VALIDATION',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.retryDomainTrialCell.success).toBe(true);
    expect(startRunMock).toHaveBeenCalledTimes(1);
    expect(startRunMock.mock.calls[0]?.[0]?.runCategory).toBe('VALIDATION');
  });

  describe('Paired Job Choice Domain Evaluation', () => {
    it('launches two paired definitions as a single paired batch with a shared batchGroupId', async () => {
      const domain = await db.domain.create({
        data: { name: 'Paired Batch Test', normalizedName: `paired-batch-test-${Date.now()}` },
      });
      createdDomainIds.push(domain.id);

      const defA = await db.definition.create({
        data: {
          name: 'Job A',
          domainId: domain.id,
          version: 1,
          content: {
            methodology: { family: 'job-choice', pair_key: 'pair1' },
            components: { value_first: { token: 'career' }, value_second: { token: 'family' } },
          },
          createdByUserId: TEST_USER.id,
        },
      });
      const defB = await db.definition.create({
        data: {
          name: 'Job B',
          domainId: domain.id,
          version: 1,
          content: {
            methodology: { family: 'job-choice', pair_key: 'pair1' },
            components: { value_first: { token: 'family' }, value_second: { token: 'career' } },
          },
          createdByUserId: TEST_USER.id,
        },
      });
      createdDefinitionIds.push(defA.id, defB.id);

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: START_DOMAIN_EVALUATION_MUTATION, variables: { domainId: domain.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.startDomainEvaluation.startedRuns).toBe(0);
      expect(startRunMock).not.toHaveBeenCalled();

      const domainEvaluationId = response.body.data.startDomainEvaluation.domainEvaluationId as string;
      expectDomainLaunchQueued(domainEvaluationId);
      const evaluation = await db.domainEvaluation.findUnique({
        where: { id: domainEvaluationId },
        select: { configSnapshot: true },
      });
      expect((evaluation?.configSnapshot as { launchableDefinitionIds?: string[] } | null)?.launchableDefinitionIds?.sort()).toEqual(
        [defA.id, defB.id].sort(),
      );
    });

    it('launches two distinct pairs as two independent batches', async () => {
      const domain = await db.domain.create({
        data: { name: 'Multi-Paired Test', normalizedName: `multi-paired-test-${Date.now()}` },
      });
      createdDomainIds.push(domain.id);

      const [p1a, p1b, p2a, p2b] = await Promise.all([
        db.definition.create({ data: { name: 'Pair1 A', domainId: domain.id, version: 1, content: { methodology: { family: 'job-choice', pair_key: 'p1', presentation_order: 'A_first' }, components: { value_first: { token: 'career' }, value_second: { token: 'family' } } }, createdByUserId: TEST_USER.id } }),
        db.definition.create({ data: { name: 'Pair1 B', domainId: domain.id, version: 1, content: { methodology: { family: 'job-choice', pair_key: 'p1', presentation_order: 'B_first' }, components: { value_first: { token: 'family' }, value_second: { token: 'career' } } }, createdByUserId: TEST_USER.id } }),
        db.definition.create({ data: { name: 'Pair2 A', domainId: domain.id, version: 1, content: { methodology: { family: 'job-choice', pair_key: 'p2', presentation_order: 'A_first' }, components: { value_first: { token: 'freedom' }, value_second: { token: 'safety' } } }, createdByUserId: TEST_USER.id } }),
        db.definition.create({ data: { name: 'Pair2 B', domainId: domain.id, version: 1, content: { methodology: { family: 'job-choice', pair_key: 'p2', presentation_order: 'B_first' }, components: { value_first: { token: 'safety' }, value_second: { token: 'freedom' } } }, createdByUserId: TEST_USER.id } }),
      ]);
      createdDefinitionIds.push(p1a.id, p1b.id, p2a.id, p2b.id);

      await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: START_DOMAIN_EVALUATION_MUTATION, variables: { domainId: domain.id } });

      expect(startRunMock).not.toHaveBeenCalled();
      expect(bossSendMock).toHaveBeenCalledTimes(1);

      const domainEvaluationId = bossSendMock.mock.calls[0]?.[1]?.domainEvaluationId as string;
      const evaluation = await db.domainEvaluation.findUnique({
        where: { id: domainEvaluationId },
        select: { configSnapshot: true },
      });
      expect((evaluation?.configSnapshot as { launchableDefinitionIds?: string[] } | null)?.launchableDefinitionIds?.sort()).toEqual(
        [p1a.id, p1b.id, p2a.id, p2b.id].sort(),
      );
    });

    it('launches a non-paired definition as an individual run with no batch configExtras', async () => {
      const domain = await db.domain.create({
        data: { name: 'Single Def Test', normalizedName: `single-def-test-${Date.now()}` },
      });
      createdDomainIds.push(domain.id);
      const def = await db.definition.create({
        data: { name: 'Single', domainId: domain.id, version: 1, content: { preamble: 'test' }, createdByUserId: TEST_USER.id },
      });
      createdDefinitionIds.push(def.id);

      await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: START_DOMAIN_EVALUATION_MUTATION, variables: { domainId: domain.id } });

      expect(startRunMock).not.toHaveBeenCalled();
      expect(bossSendMock).toHaveBeenCalledTimes(1);

      const domainEvaluationId = bossSendMock.mock.calls[0]?.[1]?.domainEvaluationId as string;
      const evaluation = await db.domainEvaluation.findUnique({
        where: { id: domainEvaluationId },
        select: { configSnapshot: true },
      });
      expect((evaluation?.configSnapshot as { launchableDefinitionIds?: string[] } | null)?.launchableDefinitionIds).toEqual([def.id]);
    });

    it('launches an incomplete pair as an individual run with no batch configExtras', async () => {
      const domain = await db.domain.create({
        data: { name: 'Incomplete Pair Test', normalizedName: `incomplete-pair-test-${Date.now()}` },
      });
      createdDomainIds.push(domain.id);
      const def = await db.definition.create({
        data: {
          name: 'Orphan A',
          domainId: domain.id,
          version: 1,
          content: { methodology: { family: 'job-choice', pair_key: 'orphan', presentation_order: 'A_first' } },
          createdByUserId: TEST_USER.id,
        },
      });
      createdDefinitionIds.push(def.id);

      await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: START_DOMAIN_EVALUATION_MUTATION, variables: { domainId: domain.id } });

      expect(startRunMock).not.toHaveBeenCalled();
      expect(bossSendMock).toHaveBeenCalledTimes(1);

      const domainEvaluationId = bossSendMock.mock.calls[0]?.[1]?.domainEvaluationId as string;
      const evaluation = await db.domainEvaluation.findUnique({
        where: { id: domainEvaluationId },
        select: { configSnapshot: true },
      });
      expect((evaluation?.configSnapshot as { launchableDefinitionIds?: string[] } | null)?.launchableDefinitionIds).toEqual([def.id]);
    });

    it('attaches missing model backfill runs to the existing evaluation', async () => {
      const domain = await db.domain.create({
        data: { name: 'Backfill Existing Evaluation', normalizedName: `backfill-existing-evaluation-${Date.now()}` },
      });
      createdDomainIds.push(domain.id);

      const defA = await db.definition.create({
        data: {
          name: 'Backfill Job A',
          domainId: domain.id,
          version: 1,
          content: {
            methodology: { family: 'job-choice', pair_key: 'backfill-pair-1', presentation_order: 'A_first' },
            components: { value_first: { token: 'career' }, value_second: { token: 'family' } },
          },
          createdByUserId: TEST_USER.id,
        },
      });
      const defB = await db.definition.create({
        data: {
          name: 'Backfill Job B',
          domainId: domain.id,
          version: 1,
          content: {
            methodology: { family: 'job-choice', pair_key: 'backfill-pair-1', presentation_order: 'B_first' },
            components: { value_first: { token: 'family' }, value_second: { token: 'career' } },
          },
          createdByUserId: TEST_USER.id,
        },
      });
      createdDefinitionIds.push(defA.id, defB.id);

      startRunMock.mockClear();
      const launchResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: START_DOMAIN_EVALUATION_MUTATION,
          variables: {
            domainId: domain.id,
            modelIds: ['test-domain-model', 'test-domain-model-2'],
          },
        });

      expect(launchResponse.status).toBe(200);
      expect(launchResponse.body.errors).toBeUndefined();
      const domainEvaluationId = launchResponse.body.data.startDomainEvaluation.domainEvaluationId as string;
      expect(startRunMock).not.toHaveBeenCalled();
      expectDomainLaunchQueued(domainEvaluationId);
      await seedEvaluationMembers({
        domainEvaluationId,
        domainId: domain.id,
        entries: [
          { definitionId: defA.id, models: ['test-domain-model'] },
          { definitionId: defB.id, models: ['test-domain-model'] },
        ],
      });

      startRunMock.mockClear();
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION,
          variables: {
            domainEvaluationId,
            modelIds: ['test-domain-model-2'],
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.backfillDomainEvaluationModels.success).toBe(true);
      expect(response.body.data.backfillDomainEvaluationModels.domainEvaluationId).toBe(domainEvaluationId);
      expect(response.body.data.backfillDomainEvaluationModels.startedRuns).toBe(2);
      expect(startRunMock).toHaveBeenCalledTimes(2);
      expect(startRunMock.mock.calls.map((call) => call[0]?.models)).toEqual([
        ['test-domain-model-2'],
        ['test-domain-model-2'],
      ]);

      // After Wave 5, configExtras is no longer written.
      expect(startRunMock.mock.calls.map((call) => call[0]?.configExtras)).toEqual([
        undefined,
        undefined,
      ]);

      const evaluation = await db.domainEvaluation.findUnique({
        where: { id: domainEvaluationId },
        include: { members: true },
      });

      expect(evaluation?.members).toHaveLength(4);
      expect(evaluation?.members.filter((member) => member.definitionIdAtLaunch === defA.id)).toHaveLength(2);
      expect(evaluation?.members.filter((member) => member.definitionIdAtLaunch === defB.id)).toHaveLength(2);
    });

    it('tops up a partial pair so both paired vignettes stay aligned', async () => {
      const domain = await db.domain.create({
        data: { name: 'Backfill Partial Pair', normalizedName: `backfill-partial-pair-${Date.now()}` },
      });
      createdDomainIds.push(domain.id);

      const defA = await db.definition.create({
        data: {
          name: 'Partial Pair Job A',
          domainId: domain.id,
          version: 1,
          content: {
            methodology: { family: 'job-choice', pair_key: 'backfill-pair-2', presentation_order: 'A_first' },
            components: { value_first: { token: 'career' }, value_second: { token: 'family' } },
          },
          createdByUserId: TEST_USER.id,
        },
      });
      const defB = await db.definition.create({
        data: {
          name: 'Partial Pair Job B',
          domainId: domain.id,
          version: 1,
          content: {
            methodology: { family: 'job-choice', pair_key: 'backfill-pair-2', presentation_order: 'B_first' },
            components: { value_first: { token: 'family' }, value_second: { token: 'career' } },
          },
          createdByUserId: TEST_USER.id,
        },
      });
      createdDefinitionIds.push(defA.id, defB.id);

      startRunMock.mockClear();
      const launchResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: START_DOMAIN_EVALUATION_MUTATION,
          variables: {
            domainId: domain.id,
            modelIds: ['test-domain-model', 'test-domain-model-2'],
          },
        });

      expect(launchResponse.status).toBe(200);
      expect(launchResponse.body.errors).toBeUndefined();
      const domainEvaluationId = launchResponse.body.data.startDomainEvaluation.domainEvaluationId as string;
      expect(startRunMock).not.toHaveBeenCalled();
      expectDomainLaunchQueued(domainEvaluationId);
      await seedEvaluationMembers({
        domainEvaluationId,
        domainId: domain.id,
        entries: [
          { definitionId: defA.id, models: ['test-domain-model', 'test-domain-model-2'] },
          { definitionId: defB.id, models: ['test-domain-model'] },
        ],
      });

      startRunMock.mockClear();
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION,
          variables: {
            domainEvaluationId,
            modelIds: ['test-domain-model-2'],
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      // Wave 4: backfill is no longer pair-aware. Each definition is treated
      // independently. defA already has model2 covered (its run config
      // includes both models), so only defB needs the backfill.
      expect(response.body.data.backfillDomainEvaluationModels.startedRuns).toBe(1);
      expect(startRunMock).toHaveBeenCalledTimes(1);
      expect(startRunMock.mock.calls[0]?.[0]?.definitionId).toBe(defB.id);
    });

    it('rejects backfill models that were not part of the original evaluation', async () => {
      const domain = await db.domain.create({
        data: { name: 'Backfill Invalid Model', normalizedName: `backfill-invalid-model-${Date.now()}` },
      });
      createdDomainIds.push(domain.id);

      const defA = await db.definition.create({
        data: {
          name: 'Invalid Model Job A',
          domainId: domain.id,
          version: 1,
          content: {
            methodology: { family: 'job-choice', pair_key: 'backfill-pair-3', presentation_order: 'A_first' },
            components: { value_first: { token: 'career' }, value_second: { token: 'family' } },
          },
          createdByUserId: TEST_USER.id,
        },
      });
      const defB = await db.definition.create({
        data: {
          name: 'Invalid Model Job B',
          domainId: domain.id,
          version: 1,
          content: {
            methodology: { family: 'job-choice', pair_key: 'backfill-pair-3', presentation_order: 'B_first' },
            components: { value_first: { token: 'family' }, value_second: { token: 'career' } },
          },
          createdByUserId: TEST_USER.id,
        },
      });
      createdDefinitionIds.push(defA.id, defB.id);

      startRunMock.mockClear();
      const launchResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: START_DOMAIN_EVALUATION_MUTATION,
          variables: {
            domainId: domain.id,
            modelIds: ['test-domain-model'],
          },
        });

      expect(launchResponse.status).toBe(200);
      expect(launchResponse.body.errors).toBeUndefined();
      const domainEvaluationId = launchResponse.body.data.startDomainEvaluation.domainEvaluationId as string;
      expect(startRunMock).not.toHaveBeenCalled();
      expectDomainLaunchQueued(domainEvaluationId);

      startRunMock.mockClear();
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION,
          variables: {
            domainEvaluationId,
            modelIds: ['test-domain-model-2'],
          },
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();
      expect(response.body.errors?.[0]?.message).toContain('Selected models are not part of this evaluation');
      expect(startRunMock).not.toHaveBeenCalled();
    });
  });
});
