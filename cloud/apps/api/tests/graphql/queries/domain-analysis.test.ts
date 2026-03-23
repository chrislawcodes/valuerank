import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import { createServer } from '../../../src/server.js';
import { TEST_USER, getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('GraphQL domain analysis value detail', () => {
  const createdDomainIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdScenarioIds: string[] = [];

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

  afterAll(async () => {
    if (createdRunIds.length > 0) {
      await db.transcript.deleteMany({ where: { runId: { in: createdRunIds } } });
      await db.run.deleteMany({ where: { id: { in: createdRunIds } } });
      createdRunIds.length = 0;
    }
    if (createdScenarioIds.length > 0) {
      await db.scenario.deleteMany({ where: { id: { in: createdScenarioIds } } });
      createdScenarioIds.length = 0;
    }
    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
      createdDefinitionIds.length = 0;
    }
    if (createdDomainIds.length > 0) {
      await db.domain.deleteMany({ where: { id: { in: createdDomainIds } } });
      createdDomainIds.length = 0;
    }
    await db.user.deleteMany({ where: { id: TEST_USER.id } });
  });

  it('keeps scenario dimensions for job-choice value detail matrices', async () => {
    const domain = await db.domain.create({
      data: {
        name: `Job Choice Detail Matrix ${Date.now()}`,
        normalizedName: `job-choice-detail-matrix-${Date.now()}`,
      },
    });
    createdDomainIds.push(domain.id);

    const sharedTemplate = [
      'A professional has to choose between two jobs.',
      '',
      'Give me your judgment on the following scale:',
    ].join('\n');

    const aFirstDefinition = await db.definition.create({
      data: {
        name: 'Job Choice A First',
        domainId: domain.id,
        version: 1,
        createdByUserId: TEST_USER.id,
        content: {
          schema_version: 1,
          template: sharedTemplate,
          methodology: {
            family: 'job-choice',
            response_scale: 'option_text',
            presentation_order: 'A_first',
            pair_key: 'pair-a',
          },
          dimensions: [
            { name: 'Achievement' },
            { name: 'Benevolence_Dependability' },
          ],
        },
      },
    });
    createdDefinitionIds.push(aFirstDefinition.id);

    const bFirstDefinition = await db.definition.create({
      data: {
        name: 'Job Choice B First',
        domainId: domain.id,
        version: 1,
        createdByUserId: TEST_USER.id,
        content: {
          schema_version: 1,
          template: sharedTemplate,
          methodology: {
            family: 'job-choice',
            response_scale: 'option_text',
            presentation_order: 'B_first',
            pair_key: 'pair-b',
          },
          dimensions: [
            { name: 'Achievement' },
            { name: 'Benevolence_Dependability' },
          ],
        },
      },
    });
    createdDefinitionIds.push(bFirstDefinition.id);

    const aRun = await db.run.create({
      data: {
        definitionId: aFirstDefinition.id,
        status: 'COMPLETED',
        config: { temperature: null },
        progress: { completed: 1, total: 1 },
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    createdRunIds.push(aRun.id);

    const aScenario = await db.scenario.create({
      data: {
        definitionId: aFirstDefinition.id,
        name: 'High Autonomy / Low Risk',
        content: {
          schema_version: 1,
          prompt: 'A professional has to choose between two jobs.',
          dimension_values: {
            autonomy: 'very high',
            risk: 'low',
          },
        },
      },
    });
    createdScenarioIds.push(aScenario.id);

    await db.transcript.create({
      data: {
        runId: aRun.id,
        scenarioId: aScenario.id,
        modelId: 'job-choice-detail-model',
        content: { messages: [] },
        decisionCode: '5',
        decisionCodeSource: 'manual',
        turnCount: 2,
        tokenCount: 100,
        durationMs: 1000,
      },
    });

    await db.run.create({
      data: {
        definitionId: bFirstDefinition.id,
        status: 'COMPLETED',
        config: { temperature: null },
        progress: { completed: 1, total: 1 },
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const query = `
      query JobChoiceValueDetail($domainId: ID!, $signature: String!, $modelId: String!, $valueKey: String!, $scoreMethod: String!) {
        detail: domainAnalysisValueDetail(domainId: $domainId, modelId: $modelId, valueKey: $valueKey, scoreMethod: $scoreMethod, signature: $signature) {
          targetedDefinitions
          coveredDefinitions
          vignettes {
            definitionName
            conditions {
              scenarioId
              conditionName
              dimensions
            }
          }
        }
      }
    `;

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query,
        variables: {
          domainId: domain.id,
          signature: 'vnewtd',
          modelId: 'job-choice-detail-model',
          valueKey: 'Achievement',
          scoreMethod: 'FULL_BT',
        },
      })
      .expect(200);

    expect(response.body.errors).toBeUndefined();

    const detail = response.body.data.detail as {
      targetedDefinitions: number;
      coveredDefinitions: number;
      vignettes: Array<{
        definitionName: string;
        conditions: Array<{
          scenarioId: string | null;
          conditionName: string;
          dimensions: Record<string, string | number> | null;
        }>;
      }>;
    };

    expect(detail.targetedDefinitions).toBe(2);
    expect(detail.coveredDefinitions).toBe(2);

    const aDetail = detail.vignettes.find((vignette) => vignette.definitionName === 'Job Choice A First');
    expect(aDetail?.conditions).toHaveLength(1);
    expect(aDetail?.conditions[0]?.dimensions).toEqual({
      autonomy: 'very high',
      risk: 'low',
    });
  });
});
