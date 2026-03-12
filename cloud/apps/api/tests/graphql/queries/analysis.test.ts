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
  let aggregateRun: Run;
  let analysisWithSummaries: AnalysisResult;
  let legacyAnalysis: AnalysisResult;
  let aggregateAnalysis: AnalysisResult;

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

    aggregateRun = await db.run.create({
      data: {
        definitionId: testDefinition.id,
        status: 'COMPLETED',
        config: { models: ['gpt-4'], isAggregate: true },
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

    aggregateAnalysis = await db.analysisResult.create({
      data: {
        runId: aggregateRun.id,
        analysisType: 'AGGREGATE',
        status: 'CURRENT',
        inputHash: 'test-hash-aggregate',
        codeVersion: '1.2.0',
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
                  overallSignedCenter: 0.5,
                },
                preferenceStrength: 0.8,
              },
            },
          },
          reliabilitySummary: {
            perModel: {
              'gpt-4': {
                baselineNoise: 0.4,
                baselineReliability: 0.7,
                directionalAgreement: 0.75,
                neutralShare: 0.1,
                coverageCount: 3,
                uniqueScenarios: 5,
              },
            },
          },
          aggregateMetadata: {
            aggregateEligibility: 'eligible_same_signature_baseline',
            aggregateIneligibilityReason: null,
            sourceRunCount: 2,
            sourceRunIds: ['run-a', 'run-b'],
            conditionCoverage: {
              plannedConditionCount: 5,
              observedConditionCount: 5,
              complete: true,
            },
            perModelRepeatCoverage: {
              'gpt-4': {
                repeatCoverageCount: 3,
                repeatCoverageShare: 0.6,
                contributingRunCount: 2,
              },
            },
            perModelDrift: {
              'gpt-4': {
                weightedOverallSignedCenterSd: 0.31,
                exceedsWarningThreshold: true,
              },
            },
          },
        },
      },
    });
  });

  afterAll(async () => {
    await db.analysisResult.deleteMany({
      where: { id: { in: [analysisWithSummaries.id, legacyAnalysis.id, aggregateAnalysis.id] } },
    });
    await db.run.deleteMany({
      where: { id: { in: [runWithSummaries.id, legacyRun.id, aggregateRun.id] } },
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
              aggregateMetadata {
                aggregateEligibility
                sourceRunCount
                sourceRunIds
                conditionCoverage
                perModelRepeatCoverage
                perModelDrift
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
    expect(response.body.data.analysis.aggregateMetadata).toBeNull();
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
              aggregateMetadata {
                aggregateEligibility
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
    expect(response.body.data.analysis.aggregateMetadata).toBeNull();
  });

  it('returns aggregateMetadata for eligible aggregate rows', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('X-API-Key', apiKey)
      .send({
        query: `
          query GetAggregateAnalysis($runId: ID!) {
            analysis(runId: $runId) {
              runId
              analysisType
              aggregateMetadata {
                aggregateEligibility
                aggregateIneligibilityReason
                sourceRunCount
                sourceRunIds
                conditionCoverage
                perModelRepeatCoverage
                perModelDrift
              }
            }
          }
        `,
        variables: { runId: aggregateRun.id },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.analysis.runId).toBe(aggregateRun.id);
    expect(response.body.data.analysis.analysisType).toBe('AGGREGATE');
    expect(response.body.data.analysis.aggregateMetadata).toEqual({
      aggregateEligibility: 'eligible_same_signature_baseline',
      aggregateIneligibilityReason: null,
      sourceRunCount: 2,
      sourceRunIds: ['run-a', 'run-b'],
      conditionCoverage: {
        plannedConditionCount: 5,
        observedConditionCount: 5,
        complete: true,
      },
      perModelRepeatCoverage: {
        'gpt-4': {
          repeatCoverageCount: 3,
          repeatCoverageShare: 0.6,
          contributingRunCount: 2,
        },
      },
      perModelDrift: {
        'gpt-4': {
          weightedOverallSignedCenterSd: 0.31,
          exceedsWarningThreshold: true,
        },
      },
    });
  });
});
