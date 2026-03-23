import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import { createServer } from '../../../src/server.js';
import { TEST_USER, getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('GraphQL domain analysis', () => {
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

  it('analyzes lowercase job-choice pairs for both orientations', async () => {
    const domain = await db.domain.create({
      data: {
        name: `Job Choice Analysis Fix ${Date.now()}`,
        normalizedName: `job-choice-analysis-fix-${Date.now()}`,
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
            { name: 'achievement' },
            { name: 'benevolence_dependability' },
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
            { name: 'achievement' },
            { name: 'benevolence_dependability' },
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

    const bRun = await db.run.create({
      data: {
        definitionId: bFirstDefinition.id,
        status: 'COMPLETED',
        config: { temperature: null },
        progress: { completed: 1, total: 1 },
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    createdRunIds.push(bRun.id);

    await db.transcript.create({
      data: {
        runId: aRun.id,
        scenarioId: aScenario.id,
        modelId: 'job-choice-analysis-model',
        content: { messages: [] },
        decisionCode: '5',
        decisionCodeSource: 'manual',
        turnCount: 2,
        tokenCount: 100,
        durationMs: 1000,
      },
    });

    await db.transcript.create({
      data: {
        runId: bRun.id,
        modelId: 'job-choice-analysis-model',
        content: { messages: [] },
        decisionCode: '5',
        decisionCodeSource: 'manual',
        turnCount: 2,
        tokenCount: 100,
        durationMs: 1000,
      },
    });

    const query = `
      query JobChoiceDomainAnalysis($domainId: ID!, $signature: String!, $modelId: String!, $valueKey: String!) {
        analysis: domainAnalysis(domainId: $domainId, signature: $signature) {
          models {
            model
            values {
              valueKey
              prioritized
              deprioritized
              neutral
              totalComparisons
            }
          }
        }
        detail: domainAnalysisValueDetail(domainId: $domainId, modelId: $modelId, valueKey: $valueKey, signature: $signature) {
          targetedDefinitions
          coveredDefinitions
          prioritized
          deprioritized
          neutral
          totalTrials
          vignettes {
            definitionName
            otherValueKey
            prioritized
            deprioritized
            neutral
            totalTrials
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
          modelId: 'job-choice-analysis-model',
          valueKey: 'Achievement',
        },
      })
      .expect(200);

    expect(response.body.errors).toBeUndefined();

    const analysis = response.body.data.analysis as {
      models: Array<{
        model: string;
        values: Array<{
          valueKey: string;
          prioritized: number;
          deprioritized: number;
          neutral: number;
          totalComparisons: number;
        }>;
      }>;
    };
    const model = analysis.models.find((entry) => entry.model === 'job-choice-analysis-model');
    expect(model).toBeDefined();

    const valueByKey = new Map(model?.values.map((value) => [value.valueKey, value]) ?? []);
    expect(valueByKey.get('Achievement')).toEqual({
      valueKey: 'Achievement',
      prioritized: 1,
      deprioritized: 1,
      neutral: 0,
      totalComparisons: 2,
    });
    expect(valueByKey.get('Benevolence_Dependability')).toEqual({
      valueKey: 'Benevolence_Dependability',
      prioritized: 1,
      deprioritized: 1,
      neutral: 0,
      totalComparisons: 2,
    });

    const detail = response.body.data.detail as {
      targetedDefinitions: number;
      coveredDefinitions: number;
      prioritized: number;
      deprioritized: number;
      neutral: number;
      totalTrials: number;
      vignettes: Array<{
        definitionName: string;
        otherValueKey: string;
        prioritized: number;
        deprioritized: number;
        neutral: number;
        totalTrials: number;
      }>;
    };

    expect(detail.targetedDefinitions).toBe(2);
    expect(detail.coveredDefinitions).toBe(2);
    expect(detail.prioritized).toBe(1);
    expect(detail.deprioritized).toBe(1);
    expect(detail.neutral).toBe(0);
    expect(detail.totalTrials).toBe(2);
    expect(detail.vignettes).toHaveLength(2);
    expect(detail.vignettes.map((vignette) => vignette.definitionName).sort()).toEqual([
      'Job Choice A First',
      'Job Choice B First',
    ]);
    expect(detail.vignettes.map((vignette) => vignette.otherValueKey)).toEqual([
      'Benevolence_Dependability',
      'Benevolence_Dependability',
    ]);
  });
});
