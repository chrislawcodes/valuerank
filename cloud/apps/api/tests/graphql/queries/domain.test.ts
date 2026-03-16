import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import { createServer } from '../../../src/server.js';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';

const app = createServer();

describe('GraphQL Domain Query Registration', () => {
  const createdDomainIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  const createdProviderIds: string[] = [];
  const createdModelIds: string[] = [];
  const createdStatsIds: string[] = [];

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
    if (createdStatsIds.length > 0) {
      await db.modelTokenStatistics.deleteMany({ where: { id: { in: createdStatsIds } } });
      createdStatsIds.length = 0;
    }
    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
      createdDefinitionIds.length = 0;
    }
    if (createdDomainIds.length > 0) {
      await db.domain.deleteMany({ where: { id: { in: createdDomainIds } } });
      createdDomainIds.length = 0;
    }
    if (createdModelIds.length > 0) {
      await db.llmModel.deleteMany({ where: { id: { in: createdModelIds } } });
      createdModelIds.length = 0;
    }
    if (createdProviderIds.length > 0) {
      await db.llmProvider.deleteMany({ where: { id: { in: createdProviderIds } } });
      createdProviderIds.length = 0;
    }
  });

  it('registers the expected domain query fields', async () => {
    const query = `
      query DomainQueryFields {
        __type(name: "Query") {
          fields {
            name
          }
        }
      }
    `;

    const response = await request(app)
      .post('/graphql')
      .send({ query })
      .expect(200);

    expect(response.body.errors).toBeUndefined();

    const fieldNames = new Set<string>(
      (response.body.data.__type.fields as Array<{ name: string }>).map((field) => field.name),
    );

    expect(fieldNames.has('domains')).toBe(true);
    expect(fieldNames.has('domain')).toBe(true);
    expect(fieldNames.has('domainTrialsPlan')).toBe(true);
    expect(fieldNames.has('estimateDomainEvaluationCost')).toBe(true);
    expect(fieldNames.has('domainTrialRunsStatus')).toBe(true);
    expect(fieldNames.has('domainEvaluations')).toBe(true);
    expect(fieldNames.has('domainEvaluation')).toBe(true);
    expect(fieldNames.has('domainEvaluationMembers')).toBe(true);
    expect(fieldNames.has('domainEvaluationStatus')).toBe(true);
    expect(fieldNames.has('domainRunSummary')).toBe(true);
    expect(fieldNames.has('domainFindingsEligibility')).toBe(true);
    expect(fieldNames.has('domainAvailableSignatures')).toBe(true);
    expect(fieldNames.has('domainAnalysis')).toBe(true);
    expect(fieldNames.has('domainAnalysisValueDetail')).toBe(true);
    expect(fieldNames.has('domainAnalysisConditionTranscripts')).toBe(true);
  });

  it('registers the domain analysis result types', async () => {
    const query = `
      query DomainTypeFields {
        result: __type(name: "DomainAnalysisResult") {
          fields {
            name
          }
        }
        cluster: __type(name: "ClusterAnalysis") {
          fields {
            name
          }
        }
      }
    `;

    const response = await request(app)
      .post('/graphql')
      .send({ query })
      .expect(200);

    expect(response.body.errors).toBeUndefined();

    const resultFields = new Set<string>(
      (response.body.data.result.fields as Array<{ name: string }>).map((field) => field.name),
    );
    const clusterFields = new Set<string>(
      (response.body.data.cluster.fields as Array<{ name: string }>).map((field) => field.name),
    );

    expect(resultFields.has('models')).toBe(true);
    expect(resultFields.has('rankingShapeBenchmarks')).toBe(true);
    expect(resultFields.has('clusterAnalysis')).toBe(true);
    expect(clusterFields.has('clusters')).toBe(true);
    expect(clusterFields.has('faultLinesByPair')).toBe(true);
    expect(clusterFields.has('defaultPair')).toBe(true);
  });

  it('returns domain evaluation history, detail, and derived status', async () => {
    const domain = await db.domain.create({
      data: {
        name: 'Domain Evaluation Query Test',
        normalizedName: `domain-evaluation-query-${Date.now()}`,
      },
    });
    createdDomainIds.push(domain.id);

    const definition = await db.definition.create({
      data: {
        name: 'Evaluation Vignette',
        domainId: domain.id,
        version: 1,
        content: { schema_version: 1, preamble: 'eval' },
        createdByUserId: TEST_USER.id,
      },
    });
    createdDefinitionIds.push(definition.id);

    const run = await db.run.create({
      data: {
        definitionId: definition.id,
        status: 'RUNNING',
        runCategory: 'PRODUCTION',
        config: { models: ['test-domain-model'], temperature: null },
        progress: { total: 1, completed: 0, failed: 0 },
        createdByUserId: TEST_USER.id,
        startedAt: new Date(),
      },
    });

    const completedRun = await db.run.create({
      data: {
        definitionId: definition.id,
        status: 'COMPLETED',
        runCategory: 'VALIDATION',
        config: { models: ['test-validation-model'], temperature: 0 },
        progress: { total: 1, completed: 1, failed: 0 },
        createdByUserId: TEST_USER.id,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const evaluation = await db.domainEvaluation.create({
      data: {
        domainId: domain.id,
        domainNameAtLaunch: domain.name,
        scopeCategory: 'PRODUCTION',
        status: 'RUNNING',
        configSnapshot: {
          models: ['test-domain-model'],
          projectedCostUsd: 1.23,
          startedRuns: 1,
          skippedForBudget: 0,
        },
        createdByUserId: TEST_USER.id,
        startedAt: new Date(),
      },
    });

    const validationEvaluation = await db.domainEvaluation.create({
      data: {
        domainId: domain.id,
        domainNameAtLaunch: domain.name,
        scopeCategory: 'VALIDATION',
        status: 'COMPLETED',
        configSnapshot: {
          models: ['test-validation-model'],
          projectedCostUsd: 0.45,
          startedRuns: 1,
          skippedForBudget: 0,
        },
        createdByUserId: TEST_USER.id,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await db.domainEvaluationRun.create({
      data: {
        domainEvaluationId: evaluation.id,
        runId: run.id,
        definitionIdAtLaunch: definition.id,
        definitionNameAtLaunch: definition.name,
        domainIdAtLaunch: domain.id,
      },
    });

    await db.domainEvaluationRun.create({
      data: {
        domainEvaluationId: validationEvaluation.id,
        runId: completedRun.id,
        definitionIdAtLaunch: definition.id,
        definitionNameAtLaunch: definition.name,
        domainIdAtLaunch: domain.id,
      },
    });

    const query = `
      query DomainEvaluations($domainId: ID!, $evaluationId: ID!) {
        domainEvaluations(domainId: $domainId) {
          id
          domainId
          domainNameAtLaunch
          scopeCategory
          status
          memberCount
          members {
            runId
            definitionIdAtLaunch
            runStatus
            runCategory
          }
        }
        domainEvaluation(id: $evaluationId) {
          id
          domainId
          domainNameAtLaunch
          scopeCategory
          projectedCostUsd
          models
          members {
            definitionNameAtLaunch
            runStatus
          }
        }
        domainEvaluationMembers(id: $evaluationId) {
          runId
          definitionIdAtLaunch
          definitionNameAtLaunch
          runStatus
          runCategory
        }
        domainEvaluationStatus(id: $evaluationId) {
          id
          status
          totalRuns
          pendingRuns
          runningRuns
          completedRuns
          failedRuns
          cancelledRuns
        }
        domainRunSummary(domainId: $domainId) {
          domainId
          totalEvaluations
          runningEvaluations
          completedEvaluations
          totalMemberRuns
          runningMemberRuns
          completedMemberRuns
          productionEvaluations
          validationEvaluations
          latestEvaluationId
          latestEvaluationStatus
          latestScopeCategory
        }
        validationSummary: domainRunSummary(domainId: $domainId, scopeCategory: "VALIDATION") {
          domainId
          scopeCategory
          totalEvaluations
          completedEvaluations
          validationEvaluations
          totalMemberRuns
          completedMemberRuns
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
          evaluationId: evaluation.id,
        },
      })
      .expect(200);

    expect(response.body.errors).toBeUndefined();

    const listedEvaluations = response.body.data.domainEvaluations as Array<Record<string, unknown>>;
    expect(listedEvaluations).toHaveLength(2);
    expect(listedEvaluations[0]?.id).toBe(validationEvaluation.id);
    expect(listedEvaluations[0]?.status).toBe('COMPLETED');
    expect(listedEvaluations[0]?.memberCount).toBe(1);
    expect(listedEvaluations[1]?.id).toBe(evaluation.id);
    expect(listedEvaluations[1]?.status).toBe('RUNNING');
    expect(listedEvaluations[1]?.memberCount).toBe(1);

    const detailedEvaluation = response.body.data.domainEvaluation as Record<string, unknown>;
    expect(detailedEvaluation.id).toBe(evaluation.id);
    expect(detailedEvaluation.scopeCategory).toBe('PRODUCTION');
    expect(detailedEvaluation.projectedCostUsd).toBe(1.23);
    expect(detailedEvaluation.models).toEqual(['test-domain-model']);

    expect(response.body.data.domainEvaluationMembers).toEqual([
      expect.objectContaining({
        runId: run.id,
        definitionIdAtLaunch: definition.id,
        definitionNameAtLaunch: definition.name,
        runStatus: 'RUNNING',
        runCategory: 'PRODUCTION',
      }),
    ]);

    const status = response.body.data.domainEvaluationStatus as Record<string, unknown>;
    expect(status.id).toBe(evaluation.id);
    expect(status.status).toBe('RUNNING');
    expect(status.totalRuns).toBe(1);
    expect(status.pendingRuns).toBe(0);
    expect(status.runningRuns).toBe(1);
    expect(status.completedRuns).toBe(0);
    expect(status.failedRuns).toBe(0);
    expect(status.cancelledRuns).toBe(0);

    const summary = response.body.data.domainRunSummary as Record<string, unknown>;
    expect(summary.domainId).toBe(domain.id);
    expect(summary.totalEvaluations).toBe(2);
    expect(summary.runningEvaluations).toBe(1);
    expect(summary.completedEvaluations).toBe(1);
    expect(summary.totalMemberRuns).toBe(2);
    expect(summary.runningMemberRuns).toBe(1);
    expect(summary.completedMemberRuns).toBe(1);
    expect(summary.productionEvaluations).toBe(1);
    expect(summary.validationEvaluations).toBe(1);
    expect(summary.latestEvaluationId).toBe(validationEvaluation.id);
    expect(summary.latestEvaluationStatus).toBe('COMPLETED');
    expect(summary.latestScopeCategory).toBe('VALIDATION');

    const validationSummary = response.body.data.validationSummary as Record<string, unknown>;
    expect(validationSummary.domainId).toBe(domain.id);
    expect(validationSummary.scopeCategory).toBe('VALIDATION');
    expect(validationSummary.totalEvaluations).toBe(1);
    expect(validationSummary.completedEvaluations).toBe(1);
    expect(validationSummary.validationEvaluations).toBe(1);
    expect(validationSummary.totalMemberRuns).toBe(1);
    expect(validationSummary.completedMemberRuns).toBe(1);
  });

  it('returns a conservative findings-eligibility result for domain findings', async () => {
    const domain = await db.domain.create({
      data: {
        name: 'Domain Findings Eligibility Test',
        normalizedName: `domain-findings-eligibility-${Date.now()}`,
      },
    });
    createdDomainIds.push(domain.id);

    const definition = await db.definition.create({
      data: {
        name: 'Findings Vignette',
        domainId: domain.id,
        version: 1,
        content: { schema_version: 1, preamble: 'findings' },
        createdByUserId: TEST_USER.id,
      },
    });
    createdDefinitionIds.push(definition.id);

    const run = await db.run.create({
      data: {
        definitionId: definition.id,
        status: 'COMPLETED',
        runCategory: 'PRODUCTION',
        config: {
          models: ['test-domain-model'],
          definitionSnapshot: {
            _meta: {
              definitionVersion: 1,
            },
          },
        },
        progress: { total: 1, completed: 1, failed: 0 },
        createdByUserId: TEST_USER.id,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const evaluation = await db.domainEvaluation.create({
      data: {
        domainId: domain.id,
        domainNameAtLaunch: domain.name,
        scopeCategory: 'PRODUCTION',
        status: 'COMPLETED',
        configSnapshot: {
          models: ['test-domain-model'],
          startedRuns: 1,
          skippedForBudget: 0,
        },
        createdByUserId: TEST_USER.id,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await db.domainEvaluationRun.create({
      data: {
        domainEvaluationId: evaluation.id,
        runId: run.id,
        definitionIdAtLaunch: definition.id,
        definitionNameAtLaunch: definition.name,
        domainIdAtLaunch: domain.id,
      },
    });

    const query = `
      query DomainFindingsEligibility($domainId: ID!) {
        domainFindingsEligibility(domainId: $domainId) {
          domainId
          eligible
          status
          summary
          reasons
          recommendedActions
          consideredScopeCategories
          completedEligibleEvaluationCount
          latestEligibleEvaluationId
          latestEligibleScopeCategory
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
        },
      })
      .expect(200);

    expect(response.body.errors).toBeUndefined();

    const eligibility = response.body.data.domainFindingsEligibility as Record<string, unknown>;
    expect(eligibility.domainId).toBe(domain.id);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.status).toBe('DIAGNOSTIC_ONLY');
    expect(eligibility.completedEligibleEvaluationCount).toBe(1);
    expect(eligibility.latestEligibleEvaluationId).toBe(evaluation.id);
    expect(eligibility.latestEligibleScopeCategory).toBe('PRODUCTION');
    expect(eligibility.consideredScopeCategories).toEqual(['PRODUCTION', 'REPLICATION']);
    expect(eligibility.summary).toMatch(/diagnostic signals/i);
    expect(eligibility.reasons).toContain(
      'Launch snapshot boundary is not complete for auditable findings yet, so this domain remains diagnostic-only.',
    );
  });

  it('returns a domain evaluation cost estimate with fallback metadata and confidence', async () => {
    const provider = await db.llmProvider.create({
      data: {
        name: `domain-estimate-provider-${Date.now()}`,
        displayName: 'Domain Estimate Provider',
      },
    });
    createdProviderIds.push(provider.id);

    const model = await db.llmModel.create({
      data: {
        providerId: provider.id,
        modelId: `domain-estimate-model-${Date.now()}`,
        displayName: 'Domain Estimate Model',
        status: 'ACTIVE',
        isDefault: true,
        costInputPerMillion: 10,
        costOutputPerMillion: 20,
      },
    });
    createdModelIds.push(model.id);

    const stats = await db.modelTokenStatistics.create({
      data: {
        modelId: model.id,
        definitionId: null,
        avgInputTokens: 100,
        avgOutputTokens: 200,
        sampleCount: 75,
      },
    });
    createdStatsIds.push(stats.id);

    const domain = await db.domain.create({
      data: {
        name: 'Domain Estimate Query Test',
        normalizedName: `domain-estimate-query-${Date.now()}`,
      },
    });
    createdDomainIds.push(domain.id);

    const definition = await db.definition.create({
      data: {
        name: 'Estimate Vignette',
        domainId: domain.id,
        version: 1,
        content: { schema_version: 1, preamble: 'estimate' },
        createdByUserId: TEST_USER.id,
        scenarios: {
          create: [
            { name: 'Scenario 1', content: { body: 'one', dimensionValues: {} } },
            { name: 'Scenario 2', content: { body: 'two', dimensionValues: {} } },
            { name: 'Scenario 3', content: { body: 'three', dimensionValues: {} } },
          ],
        },
      },
    });
    createdDefinitionIds.push(definition.id);

    const query = `
      query EstimateDomainEvaluationCost($domainId: ID!, $definitionIds: [ID!], $modelIds: [String!], $scopeCategory: String) {
        estimateDomainEvaluationCost(
          domainId: $domainId
          definitionIds: $definitionIds
          modelIds: $modelIds
          scopeCategory: $scopeCategory
        ) {
          domainId
          domainName
          scopeCategory
          targetedDefinitions
          totalScenarioCount
          totalEstimatedCost
          basedOnSampleCount
          isUsingFallback
          fallbackReason
          estimateConfidence
          knownExclusions
          models {
            modelId
            label
            estimatedCost
            basedOnSampleCount
            isUsingFallback
          }
          definitions {
            definitionId
            definitionName
            scenarioCount
            estimatedCost
            basedOnSampleCount
            isUsingFallback
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
          definitionIds: [definition.id],
          modelIds: [model.modelId],
          scopeCategory: 'PRODUCTION',
        },
      })
      .expect(200);

    expect(response.body.errors).toBeUndefined();

    const estimate = response.body.data.estimateDomainEvaluationCost as Record<string, unknown>;
    expect(estimate.domainId).toBe(domain.id);
    expect(estimate.domainName).toBe(domain.name);
    expect(estimate.scopeCategory).toBe('PRODUCTION');
    expect(estimate.targetedDefinitions).toBe(1);
    expect(estimate.totalScenarioCount).toBe(3);
    expect(estimate.isUsingFallback).toBe(false);
    expect(estimate.fallbackReason).toBeNull();
    expect(estimate.basedOnSampleCount).toBe(75);
    expect(estimate.estimateConfidence).toBe('HIGH');
    expect(estimate.totalEstimatedCost).toBeCloseTo(0.015, 5);
    expect(estimate.knownExclusions).toContain(
      'Judge/evaluator and summarization passes are not included in this estimate yet.',
    );

    const [modelEstimate] = estimate.models as Array<Record<string, unknown>>;
    expect(modelEstimate.modelId).toBe(model.modelId);
    expect(modelEstimate.label).toBe('Domain Estimate Model');
    expect(modelEstimate.estimatedCost).toBeCloseTo(0.015, 5);
    expect(modelEstimate.basedOnSampleCount).toBe(75);
    expect(modelEstimate.isUsingFallback).toBe(false);

    const [definitionEstimate] = estimate.definitions as Array<Record<string, unknown>>;
    expect(definitionEstimate.definitionId).toBe(definition.id);
    expect(definitionEstimate.definitionName).toBe('Estimate Vignette');
    expect(definitionEstimate.scenarioCount).toBe(3);
    expect(definitionEstimate.estimatedCost).toBeCloseTo(0.015, 5);
    expect(definitionEstimate.basedOnSampleCount).toBe(75);
    expect(definitionEstimate.isUsingFallback).toBe(false);
  });

  it('marks findings eligible when a completed production evaluation has auditable launch snapshots', async () => {
    const domain = await db.domain.create({
      data: {
        name: 'Eligible Findings Domain',
        normalizedName: `eligible-findings-domain-${Date.now()}`,
      },
    });
    createdDomainIds.push(domain.id);

    const definition = await db.definition.create({
      data: {
        name: 'Eligible Findings Vignette',
        domainId: domain.id,
        version: 1,
        content: { schema_version: 1, preamble: 'eligible' },
        createdByUserId: TEST_USER.id,
      },
    });
    createdDefinitionIds.push(definition.id);

    const run = await db.run.create({
      data: {
        definitionId: definition.id,
        status: 'COMPLETED',
        runCategory: 'PRODUCTION',
        config: {
          models: ['test-domain-model'],
          findingsSnapshotVersion: 'v1',
          resolvedContext: { id: 'ctx-1', text: 'Context text', version: 1 },
          resolvedValueStatements: [
            { token: 'autonomy', body: '[level] autonomy' },
            { token: 'money', body: '[level] money' },
          ],
          resolvedLevelWords: { words: ['l1', 'l2', 'l3', 'l4', 'l5'] },
          evaluatorConfig: { modelId: 'judge-model', providerName: 'test-provider' },
        },
        progress: { total: 1, completed: 1, failed: 0 },
        createdByUserId: TEST_USER.id,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const evaluation = await db.domainEvaluation.create({
      data: {
        domainId: domain.id,
        domainNameAtLaunch: domain.name,
        scopeCategory: 'PRODUCTION',
        status: 'COMPLETED',
        configSnapshot: {
          models: ['test-domain-model'],
          startedRuns: 1,
          skippedForBudget: 0,
        },
        createdByUserId: TEST_USER.id,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await db.domainEvaluationRun.create({
      data: {
        domainEvaluationId: evaluation.id,
        runId: run.id,
        definitionIdAtLaunch: definition.id,
        definitionNameAtLaunch: definition.name,
        domainIdAtLaunch: domain.id,
      },
    });

    const query = `
      query DomainFindingsEligibility($domainId: ID!) {
        domainFindingsEligibility(domainId: $domainId) {
          domainId
          eligible
          status
          summary
          reasons
          completedEligibleEvaluationCount
          latestEligibleEvaluationId
          latestEligibleScopeCategory
        }
      }
    `;

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query,
        variables: { domainId: domain.id },
      })
      .expect(200);

    expect(response.body.errors).toBeUndefined();

    const eligibility = response.body.data.domainFindingsEligibility as Record<string, unknown>;
    expect(eligibility.domainId).toBe(domain.id);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.status).toBe('ELIGIBLE');
    expect(eligibility.summary).toMatch(/auditable launch snapshots/i);
    expect(eligibility.reasons).toEqual([]);
    expect(eligibility.completedEligibleEvaluationCount).toBe(1);
    expect(eligibility.latestEligibleEvaluationId).toBe(evaluation.id);
    expect(eligibility.latestEligibleScopeCategory).toBe('PRODUCTION');
  });
});
