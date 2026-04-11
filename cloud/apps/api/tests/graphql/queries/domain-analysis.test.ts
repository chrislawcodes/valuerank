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
        defaultModelIds: ['job-choice-analysis-model'],
      },
    });
    createdDomainIds.push(domain.id);

    const sharedTemplate = [
      'A professional has to choose between two jobs.',
      '',
      'Give me your judgment on the following scale:',
    ].join('\n');

    const manualOverrideDecision = {
      manualOverride: {
        appliedDecision: {
          favoredValueKey: 'Achievement',
          opposedValueKey: 'Benevolence_Dependability',
          direction: 'favor_first',
          strength: 'strong',
        },
        previousValue: '5',
        overriddenAt: new Date().toISOString(),
        overriddenByUserId: TEST_USER.id,
      },
    };

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
            pair_key: 'pair-a',
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
        config: { temperature: null, models: ['job-choice-analysis-model'] },
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
        config: { temperature: null, models: ['job-choice-analysis-model'] },
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
        summarizedAt: new Date(),
        decisionCode: '5',
        decisionCodeSource: 'manual',
        decisionMetadata: {
          ...manualOverrideDecision,
          parseClass: 'exact',
          parsePath: 'text_label_leading',
          parserVersion: 'job-choice-v2',
          matchedLabel: 'Strongly support taking the job with recognition of their expertise',
          responseExcerpt: 'Strongly support taking the job with recognition of their expertise',
        },
        definitionSnapshot: {
          dimensions: [{ name: 'Achievement' }, { name: 'Benevolence_Dependability' }],
          methodology: {
            presentation_order: 'A_first',
          },
        },
        turnCount: 2,
        tokenCount: 100,
        durationMs: 1000,
      },
    });

    await db.transcript.create({
      data: {
        runId: bRun.id,
        scenarioId: aScenario.id,
        modelId: 'job-choice-analysis-model',
        content: { messages: [] },
        summarizedAt: new Date(),
        decisionCode: '5',
        decisionCodeSource: 'manual',
        decisionMetadata: {
          ...manualOverrideDecision,
          parseClass: 'exact',
          parsePath: 'text_label_leading',
          parserVersion: 'job-choice-v2',
          matchedLabel: 'Strongly support taking the job with trust from other people',
          responseExcerpt: 'Strongly support taking the job with trust from other people',
        },
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
            conditions {
              scenarioId
              conditionName
              dimensions
              prioritized
              deprioritized
              neutral
              totalTrials
              selectedValueWinRate
              strongly
              somewhat
              opponentSomewhat
              opponentStrongly
              unknownCount
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
    // domainAnalysis uses the resolved decision state for counting.
    // Both definitions now resolve to Achievement being prioritized.
    expect(valueByKey.get('Achievement')).toEqual({
      valueKey: 'Achievement',
      prioritized: 2,
      deprioritized: 0,
      neutral: 0,
      totalComparisons: 2,
    });
    expect(valueByKey.get('Benevolence_Dependability')).toEqual({
      valueKey: 'Benevolence_Dependability',
      prioritized: 0,
      deprioritized: 2,
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
    expect(detail.prioritized).toBe(2);
    expect(detail.deprioritized).toBe(0);
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
    const aDetail = detail.vignettes.find((vignette) => vignette.definitionName === 'Job Choice A First');
    expect(aDetail?.conditions).toHaveLength(1);
    expect(aDetail?.conditions[0]?.dimensions).toEqual({
      autonomy: 'very high',
      risk: 'low',
    });

    const transcriptQuery = `
      query DomainAnalysisConditionTranscripts($domainId: ID!, $modelId: String!, $valueKey: String!, $definitionId: ID!, $scenarioId: ID, $signature: String) {
        domainAnalysisConditionTranscripts(
          domainId: $domainId
          modelId: $modelId
          valueKey: $valueKey
          definitionId: $definitionId
          scenarioId: $scenarioId
          signature: $signature
        ) {
          id
          decisionModelV2
        }
      }
    `;

    const transcriptResponse = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: transcriptQuery,
        variables: {
          domainId: domain.id,
          modelId: 'job-choice-analysis-model',
          valueKey: 'Achievement',
          definitionId: aFirstDefinition.id,
          scenarioId: aScenario.id,
          signature: 'vnewtd',
        },
      })
      .expect(200);

    expect(transcriptResponse.body.errors).toBeUndefined();
    expect(transcriptResponse.body.data.domainAnalysisConditionTranscripts).toHaveLength(1);
    expect(transcriptResponse.body.data.domainAnalysisConditionTranscripts[0]).toMatchObject({
      decisionModelV2: null,
    });
  });
});
