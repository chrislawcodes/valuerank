import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import type { Definition, Run, AnalysisResult } from '@valuerank/db';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../../../src/auth/api-keys.js';

const app = createServer();

describe('AnalysisResult preference and reliability summaries', () => {
  const testPrefix = `analysis-query-${Date.now()}`;
  let testUser: { id: string };
  let apiKey: string;
  let testDefinition: Definition;
  let runWithSummaries: Run;
  let legacyRun: Run;
  let analysisWithSummaries: AnalysisResult;
  let legacyAnalysis: AnalysisResult;

  beforeAll(async () => {
    testUser = await db.user.create({
      data: {
        email: `${testPrefix}@example.com`,
        passwordHash: 'test-hash',
      },
    });

    apiKey = generateApiKey();
    await db.apiKey.create({
      data: {
        userId: testUser.id,
        name: 'Test Key',
        keyHash: hashApiKey(apiKey),
        keyPrefix: getKeyPrefix(apiKey),
      },
    });

    testDefinition = await db.definition.create({
      data: {
        name: `${testPrefix} Definition`,
        content: { schema_version: 1, preamble: 'Test' },
      },
    });

    runWithSummaries = await db.run.create({
      data: {
        definitionId: testDefinition.id,
        status: 'COMPLETED',
        config: { models: ['gpt-4'] },
        progress: { completed: 2, total: 2 },
      },
    });

    legacyRun = await db.run.create({
      data: {
        definitionId: testDefinition.id,
        status: 'COMPLETED',
        config: { models: ['claude-3'] },
        progress: { completed: 2, total: 2 },
      },
    });

    analysisWithSummaries = await db.analysisResult.create({
      data: {
        runId: runWithSummaries.id,
        analysisType: 'basic',
        status: 'CURRENT',
        inputHash: 'test-hash-new',
        codeVersion: '1.1.0',
        output: {
          perModel: {},
          modelAgreement: {},
          mostContestedScenarios: [],
          methodsUsed: {},
          warnings: [],
          computedAt: '2026-03-10T00:00:00.000Z',
          durationMs: 1,
          preferenceSummary: {
            perModel: {
              'gpt-4': {
                preferenceDirection: {
                  byValue: {},
                  overallLean: 'A',
                  overallSignedCenter: 1.5,
                },
                preferenceStrength: 1.5,
              },
            },
          },
          reliabilitySummary: {
            perModel: {
              'gpt-4': {
                baselineNoise: 0.5,
                baselineReliability: 0.9,
                directionalAgreement: 0.8,
                neutralShare: 0.2,
                coverageCount: 3,
                uniqueScenarios: 5,
              },
            },
          },
        },
      },
    });

    legacyAnalysis = await db.analysisResult.create({
      data: {
        runId: legacyRun.id,
        analysisType: 'basic',
        status: 'CURRENT',
        inputHash: 'test-hash-legacy',
        codeVersion: '1.0.0',
        output: {
          perModel: {},
          modelAgreement: {},
          mostContestedScenarios: [],
          methodsUsed: {},
          warnings: [],
          computedAt: '2026-03-10T00:00:00.000Z',
          durationMs: 1,
        },
      },
    });
  });

  afterAll(async () => {
    await db.analysisResult.deleteMany({
      where: { id: { in: [analysisWithSummaries.id, legacyAnalysis.id] } },
    });
    await db.run.deleteMany({
      where: { id: { in: [runWithSummaries.id, legacyRun.id] } },
    });
    await db.definition.deleteMany({ where: { id: testDefinition.id } });
    await db.apiKey.deleteMany({ where: { userId: testUser.id } });
    await db.user.delete({ where: { id: testUser.id } });
  });

  it('returns preferenceSummary and reliabilitySummary for new analysis rows', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('X-API-Key', apiKey)
      .send({
        query: `
          query GetAnalysis($runId: ID!) {
            analysis(runId: $runId) {
              runId
              preferenceSummary {
                perModel
              }
              reliabilitySummary {
                perModel
              }
            }
          }
        `,
        variables: { runId: runWithSummaries.id },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();

    expect(response.body.data.analysis.runId).toBe(runWithSummaries.id);
    expect(response.body.data.analysis.preferenceSummary).toEqual({
      perModel: {
        'gpt-4': {
          preferenceDirection: {
            byValue: {},
            overallLean: 'A',
            overallSignedCenter: 1.5,
          },
          preferenceStrength: 1.5,
        },
      },
    });
    expect(response.body.data.analysis.reliabilitySummary).toEqual({
      perModel: {
        'gpt-4': {
          baselineNoise: 0.5,
          baselineReliability: 0.9,
          directionalAgreement: 0.8,
          neutralShare: 0.2,
          coverageCount: 3,
          uniqueScenarios: 5,
        },
      },
    });
  });

  it('returns null summary fields for legacy analysis rows', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('X-API-Key', apiKey)
      .send({
        query: `
          query GetLegacyAnalysis($runId: ID!) {
            analysis(runId: $runId) {
              runId
              preferenceSummary {
                perModel
              }
              reliabilitySummary {
                perModel
              }
            }
          }
        `,
        variables: { runId: legacyRun.id },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();

    expect(response.body.data.analysis.runId).toBe(legacyRun.id);
    expect(response.body.data.analysis.preferenceSummary).toBeNull();
    expect(response.body.data.analysis.reliabilitySummary).toBeNull();
  });
});
