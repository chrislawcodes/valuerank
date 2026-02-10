/**
 * Integration tests for AnalysisResult actualCost field.
 *
 * Tests that actualCost is correctly computed from run transcripts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import type { Definition, Run, AnalysisResult, LlmProvider, LlmModel } from '@valuerank/db';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../../../src/auth/api-keys.js';

const app = createServer();

describe('AnalysisResult actualCost', () => {
  const testPrefix = `analysis-cost-${Date.now()}`;
  let testUser: { id: string };
  let apiKey: string;
  let testDefinition: Definition;
  let testRun: Run;
  let testProvider: LlmProvider;
  let testModel1: LlmModel;
  let testModel2: LlmModel;
  let testAnalysis: AnalysisResult;

  beforeAll(async () => {
    // Create test user
    testUser = await db.user.create({
      data: {
        email: `${testPrefix}@example.com`,
        passwordHash: 'test-hash',
      },
    });

    // Create API key for authentication
    apiKey = generateApiKey();
    await db.apiKey.create({
      data: {
        userId: testUser.id,
        name: 'Test Key',
        keyHash: hashApiKey(apiKey),
        keyPrefix: getKeyPrefix(apiKey),
      },
    });

    // Create test provider and models
    testProvider = await db.llmProvider.create({
      data: {
        name: `${testPrefix}-provider`,
        displayName: 'Test Provider',
      },
    });

    testModel1 = await db.llmModel.create({
      data: {
        providerId: testProvider.id,
        modelId: `${testPrefix}-model-1`,
        displayName: 'Test Model 1',
        costInputPerMillion: 10.0,
        costOutputPerMillion: 30.0,
      },
    });

    testModel2 = await db.llmModel.create({
      data: {
        providerId: testProvider.id,
        modelId: `${testPrefix}-model-2`,
        displayName: 'Test Model 2',
        costInputPerMillion: 5.0,
        costOutputPerMillion: 15.0,
      },
    });

    // Create test definition
    testDefinition = await db.definition.create({
      data: {
        name: `${testPrefix} Definition`,
        content: { schema_version: 1, preamble: 'Test' },
      },
    });

    // Create test run
    testRun = await db.run.create({
      data: {
        definitionId: testDefinition.id,
        status: 'COMPLETED',
        config: { models: [testModel1.modelId, testModel2.modelId] },
        progress: { completed: 4, total: 4 },
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    // Create transcripts with cost data
    await db.transcript.createMany({
      data: [
        {
          runId: testRun.id,
          modelId: testModel1.modelId,
          content: {
            messages: [],
            costSnapshot: {
              estimatedCost: 0.05,
              inputTokens: 500,
              outputTokens: 1000,
            },
          },
          turnCount: 2,
          tokenCount: 1500,
          durationMs: 1000,
        },
        {
          runId: testRun.id,
          modelId: testModel1.modelId,
          content: {
            messages: [],
            costSnapshot: {
              estimatedCost: 0.08,
              inputTokens: 800,
              outputTokens: 1200,
            },
          },
          turnCount: 2,
          tokenCount: 2000,
          durationMs: 1200,
        },
        {
          runId: testRun.id,
          modelId: testModel2.modelId,
          content: {
            messages: [],
            costSnapshot: {
              estimatedCost: 0.03,
              inputTokens: 400,
              outputTokens: 800,
            },
          },
          turnCount: 2,
          tokenCount: 1200,
          durationMs: 800,
        },
        {
          runId: testRun.id,
          modelId: testModel2.modelId,
          content: {
            messages: [],
            costSnapshot: {
              estimatedCost: 0.04,
              inputTokens: 500,
              outputTokens: 900,
            },
          },
          turnCount: 2,
          tokenCount: 1400,
          durationMs: 900,
        },
      ],
    });

    // Create analysis result
    testAnalysis = await db.analysisResult.create({
      data: {
        runId: testRun.id,
        analysisType: 'basic',
        status: 'CURRENT',
        inputHash: 'test-hash',
        codeVersion: '1.0.0',
        output: {},
      },
    });
  });

  afterAll(async () => {
    // Clean up in reverse order of dependencies
    await db.analysisResult.deleteMany({ where: { runId: testRun.id } });
    await db.transcript.deleteMany({ where: { runId: testRun.id } });
    await db.run.deleteMany({ where: { id: testRun.id } });
    await db.definition.deleteMany({ where: { id: testDefinition.id } });
    await db.llmModel.deleteMany({ where: { providerId: testProvider.id } });
    await db.llmProvider.deleteMany({ where: { id: testProvider.id } });
    await db.apiKey.deleteMany({ where: { userId: testUser.id } });
    await db.user.delete({ where: { id: testUser.id } });
  });

  it('returns actualCost computed from transcripts', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('X-API-Key', apiKey)
      .send({
        query: `
          query GetAnalysis($runId: ID!) {
            analysis(runId: $runId) {
              id
              runId
              actualCost {
                total
                perModel {
                  modelId
                  inputTokens
                  outputTokens
                  cost
                  probeCount
                }
              }
            }
          }
        `,
        variables: { runId: testRun.id },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();

    const analysis = response.body.data.analysis;
    expect(analysis).not.toBeNull();
    expect(analysis.runId).toBe(testRun.id);

    // Check actualCost
    const actualCost = analysis.actualCost;
    expect(actualCost).not.toBeNull();

    // Total cost: 0.05 + 0.08 + 0.03 + 0.04 = 0.20
    expect(actualCost.total).toBeCloseTo(0.20, 4);

    // Should have 2 model entries
    expect(actualCost.perModel).toHaveLength(2);

    // Find model entries by modelId
    const model1Cost = actualCost.perModel.find(
      (m: { modelId: string }) => m.modelId === testModel1.modelId
    );
    const model2Cost = actualCost.perModel.find(
      (m: { modelId: string }) => m.modelId === testModel2.modelId
    );

    expect(model1Cost).toBeDefined();
    expect(model2Cost).toBeDefined();

    // Model 1: 0.05 + 0.08 = 0.13, 2 probes
    expect(model1Cost.cost).toBeCloseTo(0.13, 4);
    expect(model1Cost.probeCount).toBe(2);
    expect(model1Cost.inputTokens).toBe(1300); // 500 + 800
    expect(model1Cost.outputTokens).toBe(2200); // 1000 + 1200

    // Model 2: 0.03 + 0.04 = 0.07, 2 probes
    expect(model2Cost.cost).toBeCloseTo(0.07, 4);
    expect(model2Cost.probeCount).toBe(2);
    expect(model2Cost.inputTokens).toBe(900); // 400 + 500
    expect(model2Cost.outputTokens).toBe(1700); // 800 + 900
  });

  it('returns null actualCost when no transcripts exist', async () => {
    // Create a run with no transcripts
    const emptyRun = await db.run.create({
      data: {
        definitionId: testDefinition.id,
        status: 'COMPLETED',
        config: { models: ['test-model'] },
        progress: { completed: 0, total: 0 },
      },
    });

    const emptyAnalysis = await db.analysisResult.create({
      data: {
        runId: emptyRun.id,
        analysisType: 'basic',
        status: 'CURRENT',
        inputHash: 'empty-hash',
        codeVersion: '1.0.0',
        output: {},
      },
    });

    try {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetAnalysis($runId: ID!) {
              analysis(runId: $runId) {
                id
                actualCost {
                  total
                  perModel {
                    modelId
                  }
                }
              }
            }
          `,
          variables: { runId: emptyRun.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.analysis.actualCost).toBeNull();
    } finally {
      // Clean up
      await db.analysisResult.delete({ where: { id: emptyAnalysis.id } });
      await db.run.delete({ where: { id: emptyRun.id } });
    }
  });

  it('backfills visualizationData.scenarioDimensions for older analysis outputs', async () => {
    // Create a scenario with dimensions
    const scenario = await db.scenario.create({
      data: {
        definitionId: testDefinition.id,
        name: 'Dimension Scenario',
        content: { dimensions: { power: '2', conformity: '1' } },
      },
    });

    const run = await db.run.create({
      data: {
        definitionId: testDefinition.id,
        status: 'COMPLETED',
        config: { models: ['test-model'] },
        progress: { completed: 1, total: 1 },
      },
    });

    const analysis = await db.analysisResult.create({
      data: {
        runId: run.id,
        analysisType: 'basic',
        status: 'CURRENT',
        inputHash: 'test-hash-viz',
        codeVersion: '1.0.0',
        output: {
          visualizationData: {
            decisionDistribution: {},
            modelScenarioMatrix: {},
          },
        },
      },
    });

    const response = await request(app)
      .post('/graphql')
      .set('X-API-Key', apiKey)
      .send({
        query: `
          query GetAnalysisViz($runId: ID!) {
            analysis(runId: $runId) {
              id
              visualizationData
            }
          }
        `,
        variables: { runId: run.id },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();

    expect(response.body.data.analysis.id).toBe(analysis.id);
    expect(response.body.data.analysis.visualizationData).toBeDefined();
    expect(response.body.data.analysis.visualizationData.scenarioDimensions).toBeDefined();
    expect(response.body.data.analysis.visualizationData.scenarioDimensions[scenario.id]).toEqual({
      power: '2',
      conformity: '1',
    });

    await db.analysisResult.deleteMany({ where: { runId: run.id } });
    await db.transcript.deleteMany({ where: { runId: run.id } });
    await db.run.deleteMany({ where: { id: run.id } });
    await db.scenario.deleteMany({ where: { id: scenario.id } });
  });

  it('handles transcripts without costSnapshot', async () => {
    // Create a run with transcripts that have no costSnapshot
    const noCostRun = await db.run.create({
      data: {
        definitionId: testDefinition.id,
        status: 'COMPLETED',
        config: { models: [testModel1.modelId] },
        progress: { completed: 1, total: 1 },
      },
    });

    await db.transcript.create({
      data: {
        runId: noCostRun.id,
        modelId: testModel1.modelId,
        content: { messages: [] }, // No costSnapshot
        turnCount: 2,
        tokenCount: 1000,
        durationMs: 500,
      },
    });

    const noCostAnalysis = await db.analysisResult.create({
      data: {
        runId: noCostRun.id,
        analysisType: 'basic',
        status: 'CURRENT',
        inputHash: 'no-cost-hash',
        codeVersion: '1.0.0',
        output: {},
      },
    });

    try {
      const response = await request(app)
        .post('/graphql')
        .set('X-API-Key', apiKey)
        .send({
          query: `
            query GetAnalysis($runId: ID!) {
              analysis(runId: $runId) {
                id
                actualCost {
                  total
                  perModel {
                    modelId
                    cost
                    probeCount
                  }
                }
              }
            }
          `,
          variables: { runId: noCostRun.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const actualCost = response.body.data.analysis.actualCost;
      expect(actualCost).not.toBeNull();
      expect(actualCost.total).toBe(0);
      expect(actualCost.perModel).toHaveLength(1);
      expect(actualCost.perModel[0].cost).toBe(0);
      expect(actualCost.perModel[0].probeCount).toBe(1);
    } finally {
      // Clean up
      await db.transcript.deleteMany({ where: { runId: noCostRun.id } });
      await db.analysisResult.delete({ where: { id: noCostAnalysis.id } });
      await db.run.delete({ where: { id: noCostRun.id } });
    }
  });
});
