import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import { createServer } from '../../../src/server.js';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';

const app = createServer();

const CREATE_JOB_CHOICE_PAIR_MUTATION = `
  mutation CreateJobChoicePair($input: CreateJobChoicePairInput!) {
    createJobChoicePair(input: $input) {
      aFirst { id name }
      bFirst { id name }
    }
  }
`;

const UPDATE_JOB_CHOICE_PAIR_MUTATION = `
  mutation UpdateJobChoicePair($input: UpdateJobChoicePairInput!) {
    updateJobChoicePair(input: $input) {
      aFirst { id name }
      bFirst { id name }
    }
  }
`;

describe('GraphQL Job Choice Pair Mutations', () => {
  const createdDomainIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  const createdContextIds: string[] = [];
  const createdValueIds: string[] = [];
  const createdLevelPresetIds: string[] = [];
  const createdLevelPresetVersionIds: string[] = [];

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
  });

  afterEach(async () => {
    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
      createdDefinitionIds.length = 0;
    }
    if (createdContextIds.length > 0) {
      await db.domainContext.deleteMany({ where: { id: { in: createdContextIds } } });
      createdContextIds.length = 0;
    }
    if (createdValueIds.length > 0) {
      await db.valueStatement.deleteMany({ where: { id: { in: createdValueIds } } });
      createdValueIds.length = 0;
    }
    if (createdLevelPresetVersionIds.length > 0) {
      await db.levelPresetVersion.deleteMany({ where: { id: { in: createdLevelPresetVersionIds } } });
      createdLevelPresetVersionIds.length = 0;
    }
    if (createdLevelPresetIds.length > 0) {
      await db.levelPreset.deleteMany({ where: { id: { in: createdLevelPresetIds } } });
      createdLevelPresetIds.length = 0;
    }
    if (createdDomainIds.length > 0) {
      await db.domain.deleteMany({ where: { id: { in: createdDomainIds } } });
      createdDomainIds.length = 0;
    }
  });

  it('updates both members of an existing job-choice pair through the pair editor contract', async () => {
    const domain = await db.domain.create({
      data: { name: 'Job Choice Pair Domain', normalizedName: `job-choice-pair-domain-${Date.now()}` },
    });
    createdDomainIds.push(domain.id);

    const contextA = await db.domainContext.create({
      data: { domainId: domain.id, text: 'Choose between [value_first] and [value_second].' },
    });
    const contextB = await db.domainContext.create({
      data: { domainId: domain.id, text: 'Consider the tradeoff between [value_first] and [value_second].' },
    });
    createdContextIds.push(contextA.id, contextB.id);

    const care = await db.valueStatement.create({
      data: { domainId: domain.id, token: 'care', body: 'show [level] care' },
    });
    const freedom = await db.valueStatement.create({
      data: { domainId: domain.id, token: 'freedom', body: 'protect [level] freedom' },
    });
    const fairness = await db.valueStatement.create({
      data: { domainId: domain.id, token: 'fairness', body: 'promote [level] fairness' },
    });
    createdValueIds.push(care.id, freedom.id, fairness.id);

    const createResponse = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: CREATE_JOB_CHOICE_PAIR_MUTATION,
        variables: {
          input: {
            name: 'Care vs Freedom',
            domainId: domain.id,
            contextId: contextA.id,
            valueFirstId: care.id,
            valueSecondId: freedom.id,
          },
        },
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.errors).toBeUndefined();

    const aFirstId = createResponse.body.data.createJobChoicePair.aFirst.id as string;
    const bFirstId = createResponse.body.data.createJobChoicePair.bFirst.id as string;
    createdDefinitionIds.push(aFirstId, bFirstId);

    const updateResponse = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: UPDATE_JOB_CHOICE_PAIR_MUTATION,
        variables: {
          input: {
            definitionId: bFirstId,
            name: 'Care vs Fairness',
            contextId: contextB.id,
            valueFirstId: care.id,
            valueSecondId: fairness.id,
          },
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.errors).toBeUndefined();
    expect(updateResponse.body.data.updateJobChoicePair.aFirst.name).toBe('Care -> Fairness');
    expect(updateResponse.body.data.updateJobChoicePair.bFirst.name).toBe('Fairness -> Care');

    const definitions = await db.definition.findMany({
      where: { id: { in: [aFirstId, bFirstId] } },
      include: { scenarios: true },
      orderBy: { id: 'asc' },
    });

    expect(definitions).toHaveLength(2);
    expect(definitions.every((definition) => definition.domainContextId === contextB.id)).toBe(true);
    expect(definitions.every((definition) => definition.scenarios.length === 1)).toBe(true);

    const aFirst = definitions.find((definition) => definition.id === aFirstId)!;
    const bFirst = definitions.find((definition) => definition.id === bFirstId)!;
    const aContent = aFirst.content as Record<string, unknown>;
    const bContent = bFirst.content as Record<string, unknown>;

    expect(aContent.template).toContain('fairness');
    expect(bContent.template).toContain('fairness');
    expect(aContent.template).not.toContain('freedom');
    expect(bContent.template).not.toContain('freedom');
  });

  it('replaces existing scenarios when a pair is updated to use a level preset', async () => {
    const domain = await db.domain.create({
      data: { name: 'Scenario Replacement Domain', normalizedName: `scenario-replacement-domain-${Date.now()}` },
    });
    createdDomainIds.push(domain.id);

    const context = await db.domainContext.create({
      data: { domainId: domain.id, text: 'Choose between [value_first] and [value_second].' },
    });
    createdContextIds.push(context.id);

    const care = await db.valueStatement.create({
      data: { domainId: domain.id, token: 'care', body: 'show [level] care' },
    });
    const freedom = await db.valueStatement.create({
      data: { domainId: domain.id, token: 'freedom', body: 'protect [level] freedom' },
    });
    createdValueIds.push(care.id, freedom.id);

    const levelPreset = await db.levelPreset.create({
      data: { name: `Pair Levels ${Date.now()}` },
    });
    createdLevelPresetIds.push(levelPreset.id);

    const levelPresetVersion = await db.levelPresetVersion.create({
      data: {
        levelPresetId: levelPreset.id,
        version: 'v1',
        l1: 'very low',
        l2: 'low',
        l3: 'medium',
        l4: 'high',
        l5: 'very high',
      },
    });
    createdLevelPresetVersionIds.push(levelPresetVersion.id);

    const createResponse = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: CREATE_JOB_CHOICE_PAIR_MUTATION,
        variables: {
          input: {
            name: 'Care vs Freedom',
            domainId: domain.id,
            contextId: context.id,
            valueFirstId: care.id,
            valueSecondId: freedom.id,
          },
        },
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.errors).toBeUndefined();

    const aFirstId = createResponse.body.data.createJobChoicePair.aFirst.id as string;
    const bFirstId = createResponse.body.data.createJobChoicePair.bFirst.id as string;
    createdDefinitionIds.push(aFirstId, bFirstId);

    let definitions = await db.definition.findMany({
      where: { id: { in: [aFirstId, bFirstId] } },
      include: { scenarios: { orderBy: { name: 'asc' } } },
      orderBy: { id: 'asc' },
    });

    expect(definitions.every((definition) => definition.scenarios.length === 1)).toBe(true);

    const updateResponse = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: UPDATE_JOB_CHOICE_PAIR_MUTATION,
        variables: {
          input: {
            definitionId: aFirstId,
            name: 'Care vs Freedom',
            contextId: context.id,
            valueFirstId: care.id,
            valueSecondId: freedom.id,
            levelPresetVersionId: levelPresetVersion.id,
          },
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.errors).toBeUndefined();

    definitions = await db.definition.findMany({
      where: { id: { in: [aFirstId, bFirstId] } },
      include: { scenarios: { orderBy: { name: 'asc' } } },
      orderBy: { id: 'asc' },
    });

    expect(definitions.every((definition) => definition.scenarios.length === 25)).toBe(true);

    const updatedA = definitions.find((definition) => definition.id === aFirstId)!;
    const updatedB = definitions.find((definition) => definition.id === bFirstId)!;
    const firstScenarioA = updatedA.scenarios[0]!.content as Record<string, unknown>;
    const firstScenarioB = updatedB.scenarios[0]!.content as Record<string, unknown>;
    const updatedAContent = updatedA.content as {
      dimensions?: Array<{ name: string; levels?: Array<{ score: number; label: string }> }>;
    };

    expect(firstScenarioA.prompt).not.toContain('[level]');
    expect(firstScenarioB.prompt).not.toContain('[level]');
    expect(firstScenarioA.dimension_values).toMatchObject({
      care: expect.any(String),
      freedom: expect.any(String),
    });
    expect(firstScenarioB.dimension_values).toMatchObject({
      care: expect.any(String),
      freedom: expect.any(String),
    });
    expect(updatedAContent.dimensions?.[0]?.levels).toEqual([
      { score: 1, label: 'very low' },
      { score: 2, label: 'low' },
      { score: 3, label: 'medium' },
      { score: 4, label: 'high' },
      { score: 5, label: 'very high' },
    ]);
    expect(updatedAContent.dimensions?.[1]?.levels).toEqual([
      { score: 1, label: 'very low' },
      { score: 2, label: 'low' },
      { score: 3, label: 'medium' },
      { score: 4, label: 'high' },
      { score: 5, label: 'very high' },
    ]);
  });

  it('normalizes legacy DB value-statement bodies to canonical [level] narratives when creating a pair', async () => {
    const domain = await db.domain.create({
      data: { name: 'Legacy Narrative Domain', normalizedName: `legacy-narrative-domain-${Date.now()}` },
    });
    createdDomainIds.push(domain.id);

    const context = await db.domainContext.create({
      data: { domainId: domain.id, text: 'A mid-level professional has been offered two distinct roles.' },
    });
    createdContextIds.push(context.id);

    const dependability = await db.valueStatement.create({
      data: {
        domainId: domain.id,
        token: 'benevolence_dependability',
        body: 'trust from other people because of how it relates to being someone others can rely on to carry through on shared responsibilities',
      },
    });
    const achievement = await db.valueStatement.create({
      data: {
        domainId: domain.id,
        token: 'achievement',
        body: 'recognition of their expertise because of how it relates to success through strong performance',
      },
    });
    createdValueIds.push(dependability.id, achievement.id);

    const levelPreset = await db.levelPreset.create({
      data: { name: `Legacy Narrative Levels ${Date.now()}` },
    });
    createdLevelPresetIds.push(levelPreset.id);

    const levelPresetVersion = await db.levelPresetVersion.create({
      data: {
        levelPresetId: levelPreset.id,
        version: 'v1',
        l1: 'negligible',
        l2: 'low',
        l3: 'moderate',
        l4: 'high',
        l5: 'full',
      },
    });
    createdLevelPresetVersionIds.push(levelPresetVersion.id);

    const createResponse = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: CREATE_JOB_CHOICE_PAIR_MUTATION,
        variables: {
          input: {
            name: 'Dependability vs Achievement',
            domainId: domain.id,
            contextId: context.id,
            valueFirstId: dependability.id,
            valueSecondId: achievement.id,
            levelPresetVersionId: levelPresetVersion.id,
          },
        },
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.errors).toBeUndefined();

    const aFirstId = createResponse.body.data.createJobChoicePair.aFirst.id as string;
    const bFirstId = createResponse.body.data.createJobChoicePair.bFirst.id as string;
    createdDefinitionIds.push(aFirstId, bFirstId);

    const definitions = await db.definition.findMany({
      where: { id: { in: [aFirstId, bFirstId] } },
      include: { scenarios: { orderBy: { name: 'asc' } } },
      orderBy: { id: 'asc' },
    });

    const contentA = definitions[0]!.content as {
      template: string;
      components: {
        value_first: { body: string };
        value_second: { body: string };
      };
    };
    const scenarioA = definitions[0]!.scenarios[0]!.content as {
      prompt: string;
      dimension_values: Record<string, string>;
    };

    expect(contentA.template).toContain('[level] trust from other people');
    expect(contentA.template).toContain('[level] recognition of their expertise');
    expect(contentA.components.value_first.body).toContain('[level] trust from other people');
    expect(contentA.components.value_second.body).toContain('[level] recognition of their expertise');
    expect(scenarioA.prompt).not.toContain('[level]');
    expect(scenarioA.prompt).toContain(String(scenarioA.dimension_values.benevolence_dependability));
    expect(scenarioA.prompt).toContain(String(scenarioA.dimension_values.achievement));
  });
});
