import express from 'express';
import request from 'supertest';
import { createLogger } from '@valuerank/shared';
import type { PrismaClient } from '@valuerank/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { yoga } from '../../../src/graphql/index.js';
import type { DatabaseModel } from '../../../src/config/models.js';
import { computeModelAgreement } from '../../../src/services/model-agreement/compute.js';
import {
  resolveDomainAnalysisScopeDefinitions,
} from '../../../src/services/analysis/domain-analysis-scope-loader.js';
import { resolveSignatureRuns } from '../../../src/graphql/queries/domain/shared.js';

type CellOutcome = {
  aChoices: number;
  bChoices: number;
  neutrals: number;
};

const mocks = vi.hoisted(() => ({
  getModelsFromDatabase: vi.fn(),
  resolveDomainAnalysisScopeDefinitions: vi.fn(),
  resolveSignatureRuns: vi.fn(),
  getModelAgreementSnapshot: vi.fn(),
  readModelAgreementSnapshotStateFromSnapshot: vi.fn(),
  queueDomainAnalysisRefresh: vi.fn(),
  getBoss: vi.fn(),
  queueSend: vi.fn(),
}));

vi.mock('../../../src/config/models.js', () => ({
  getModelsFromDatabase: mocks.getModelsFromDatabase,
}));

vi.mock('../../../src/services/analysis/domain-analysis-scope-loader.js', () => ({
  resolveDomainAnalysisScopeDefinitions: mocks.resolveDomainAnalysisScopeDefinitions,
}));

vi.mock('../../../src/graphql/queries/domain/shared.js', () => ({
  resolveSignatureRuns: mocks.resolveSignatureRuns,
}));

vi.mock('../../../src/services/analysis/model-agreement-snapshot/snapshot-cache.js', () => ({
  getModelAgreementSnapshot: mocks.getModelAgreementSnapshot,
}));

vi.mock('../../../src/services/analysis/domain-analysis-cache.js', () => ({
  queueDomainAnalysisRefresh: mocks.queueDomainAnalysisRefresh,
}));

vi.mock('../../../src/services/analysis/domain-analysis-snapshot-readers.js', () => ({
  readModelAgreementSnapshotStateFromSnapshot: mocks.readModelAgreementSnapshotStateFromSnapshot,
}));

vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: mocks.getBoss,
}));

const log = createLogger('test:model-agreement');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.log = log;
  req.requestId = 'test-request-id';
  req.user = null;
  req.authMethod = null;
  next();
});
app.use('/graphql', yoga);

function model(modelId: string, displayName: string): DatabaseModel {
  return {
    id: `${modelId}-id`,
    modelId,
    providerId: 'provider-id',
    providerName: 'Provider',
    displayName,
    costInputPerMillion: 1,
    costOutputPerMillion: 1,
    status: 'ACTIVE',
    isDefault: modelId === 'model-a' || modelId === 'model-b',
    isAvailable: true,
  };
}

function scopeData(): Awaited<ReturnType<typeof resolveDomainAnalysisScopeDefinitions>> {
  return {
    scope: 'ALL_DOMAINS',
    domain: {
      id: 'domain-aggregate',
      name: 'All domains',
      defaultModelIds: ['model-a', 'model-b', 'model-c'],
    },
    domains: [
      {
        id: 'domain-1',
        name: 'Domain 1',
        defaultModelIds: ['model-a', 'model-b', 'model-c'],
      },
    ],
    definitions: [
      {
        id: 'def-1',
        domainId: 'domain-1',
        name: 'Definition 1',
        parentId: null,
        version: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'def-2',
        domainId: 'domain-1',
        name: 'Definition 2',
        parentId: null,
        version: 1,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ],
    latestDefinitions: [
      {
        id: 'def-1',
        domainId: 'domain-1',
        name: 'Definition 1',
        parentId: null,
        version: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'def-2',
        domainId: 'domain-1',
        name: 'Definition 2',
        parentId: null,
        version: 1,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ],
    latestDefinitionIds: ['def-1', 'def-2'],
    definitionNameById: new Map([
      ['def-1', 'Definition 1'],
      ['def-2', 'Definition 2'],
    ]),
    definitionDomainIdById: new Map([
      ['def-1', 'domain-1'],
      ['def-2', 'domain-1'],
    ]),
  };
}

function signatureRuns(): Awaited<ReturnType<typeof resolveSignatureRuns>> {
  return {
    selectedSignature: 'sig-1',
    filteredSourceRunIds: ['run-1', 'run-2'],
    filteredSourceRunDefinitionById: new Map([
      ['run-1', 'def-1'],
      ['run-2', 'def-2'],
    ]),
    coveredDefinitionIds: new Set(['def-1', 'def-2']),
    missingReasonByDefinitionId: new Map(),
  };
}

function snapshot(entries: Record<string, CellOutcome>): Record<string, CellOutcome> {
  return entries;
}

const CACHE_TIMESTAMP = new Date('2026-05-01T12:00:00.000Z');

async function buildCacheHitAgreement(args: {
  modelIds: ReadonlyArray<string | number>;
  domainId?: string | number | null;
  domainIds?: ReadonlyArray<string | number> | null;
  scope: string;
  signature: string;
}) {
  const result = await computeModelAgreement(
    {} as PrismaClient,
    args,
    {
      getModelsFromDatabase: mocks.getModelsFromDatabase,
      resolveDomainAnalysisScopeDefinitions: mocks.resolveDomainAnalysisScopeDefinitions,
      resolveSignatureRuns: mocks.resolveSignatureRuns,
      readModelAgreementSnapshotStateFromSnapshot: mocks.readModelAgreementSnapshotStateFromSnapshot,
      queueDomainAnalysisRefresh: async () => false,
      log,
    },
  );

  return {
    payload: result,
    source: 'CACHE_HIT' as const,
    snapshotComputedAt: CACHE_TIMESTAMP,
  };
}

async function graphqlRequest(query: string, variables: Record<string, unknown>) {
  return request(app)
    .post('/graphql')
    .send({ query, variables })
    .expect('Content-Type', /json/)
    .expect(200);
}

const agreementQuery = `
  query ModelAgreement($modelIds: [ID!]!, $scope: String!, $signature: String!, $domainId: ID) {
    modelAgreementOnTradeoffs(modelIds: $modelIds, scope: $scope, signature: $signature, domainId: $domainId) {
      pending
      buildProgress {
        completedRuns
        totalRuns
        currentRunId
        updatedAt
      }
      snapshotComputedAt
      snapshotIsStale
      snapshotSource
      models { modelId label }
      unavailableModels { modelId label reason }
      excludedNonBinaryCells
      tiedCells
      pairwiseAgreementMatrix {
        modelAId
        modelALabel
        modelBId
        modelBLabel
        totalCells
        percentAgreement
        cohensKappa
        kappaInterpretation
        meanAbsoluteDivergence
        cohensKappaConfidenceLow
        cohensKappaConfidenceHigh
        cohensKappaConfidenceIsSymmetric
      }
      trialConsistency {
        modelId
        modelLabel
        cellsObserved
        meanTrialConsistency
        noisy
      }
    }
  }
`;

const drilldownQuery = `
  query PairDivergence($modelAId: ID!, $modelBId: ID!, $scope: String!, $signature: String!, $domainId: ID) {
    modelPairDivergenceBreakdown(modelAId: $modelAId, modelBId: $modelBId, scope: $scope, signature: $signature, domainId: $domainId) {
      pending
      buildProgress {
        completedRuns
        totalRuns
        currentRunId
        updatedAt
      }
      modelAId
      modelALabel
      modelBId
      modelBLabel
      perValuePair {
        valueA
        valueB
        cellsCompared
        meanAbsoluteDivergence
        modelAProportionA
        modelBProportionA
      }
    }
  }
`;

describe('model-agreement-on-tradeoffs GraphQL queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueSend.mockResolvedValue(undefined);
    mocks.getBoss.mockReturnValue({
      send: mocks.queueSend,
    });
    mocks.getModelsFromDatabase.mockResolvedValue([
      model('model-a', 'Model A'),
      model('model-b', 'Model B'),
      model('model-c', 'Model C'),
    ]);
    mocks.resolveDomainAnalysisScopeDefinitions.mockResolvedValue(scopeData());
    mocks.resolveSignatureRuns.mockResolvedValue(signatureRuns());
    mocks.queueDomainAnalysisRefresh.mockResolvedValue(true);
    mocks.getModelAgreementSnapshot.mockImplementation((_prisma, _queue, input) =>
      buildCacheHitAgreement(input as Parameters<typeof buildCacheHitAgreement>[0]),
    );
  });

  it('returns perfect disagreement metrics and drilldown divergence', async () => {
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: snapshot({
        'def-1::model-a::Achievement::Tradition::1::2': { aChoices: 6, bChoices: 0, neutrals: 0 },
        'def-1::model-b::Achievement::Tradition::1::2': { aChoices: 0, bChoices: 6, neutrals: 0 },
      }),
      buildProgress: null,
      inputHash: 'hash-1',
    });

    const agreementResponse = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    expect(agreementResponse.body.errors).toBeUndefined();
    const agreement = agreementResponse.body.data.modelAgreementOnTradeoffs as {
      pending: boolean;
      buildProgress: null;
      snapshotComputedAt: string | null;
      snapshotIsStale: boolean | null;
      snapshotSource: string | null;
      pairwiseAgreementMatrix: Array<{
        totalCells: number;
        percentAgreement: number | null;
        cohensKappa: number | null;
        kappaInterpretation: string | null;
        meanAbsoluteDivergence: number | null;
      }>;
      trialConsistency: Array<{
        modelId: string;
        cellsObserved: number;
        meanTrialConsistency: number | null;
        noisy: boolean;
      }>;
    };

    expect(agreement.pending).toBe(false);
    expect(agreement.snapshotSource).toBe('CACHE_HIT');
    expect(agreement.snapshotIsStale).toBe(false);
    expect(agreement.snapshotComputedAt).toBe('2026-05-01T12:00:00.000Z');
    expect(agreement.pairwiseAgreementMatrix).toHaveLength(1);
    // With a single cell where A always picks canonicalA and B always picks canonicalB,
    // marginals are 1.0 vs 0.0, so P_chance = 0 and kappa = (0 - 0) / (1 - 0) = 0.
    // Perfect anti-correlation kappa = -1 requires multiple cells with 50/50 marginals.
    // Here we just assert percentAgreement and divergence reflect the disagreement.
    expect(agreement.pairwiseAgreementMatrix[0]).toMatchObject({
      modelAId: 'model-a',
      modelBId: 'model-b',
      totalCells: 1,
      percentAgreement: 0,
      cohensKappa: 0,
      kappaInterpretation: 'Slight',
      meanAbsoluteDivergence: 1,
    });
    expect(agreement.trialConsistency).toHaveLength(2);
    expect(agreement.trialConsistency[0]).toMatchObject({
      modelId: 'model-a',
      cellsObserved: 1,
      meanTrialConsistency: 1,
      noisy: false,
    });
    expect(agreement.trialConsistency[1]).toMatchObject({
      modelId: 'model-b',
      cellsObserved: 1,
      meanTrialConsistency: 1,
      noisy: false,
    });

    const drilldownResponse = await graphqlRequest(drilldownQuery, {
      modelAId: 'model-a',
      modelBId: 'model-b',
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    expect(drilldownResponse.body.errors).toBeUndefined();
    const drilldown = drilldownResponse.body.data.modelPairDivergenceBreakdown as {
      pending: boolean;
      perValuePair: Array<{
        valueA: string;
        valueB: string;
        cellsCompared: number;
        meanAbsoluteDivergence: number | null;
        modelAProportionA: number | null;
        modelBProportionA: number | null;
      }>;
    };

    expect(drilldown.pending).toBe(false);
    expect(drilldown.perValuePair).toEqual([
      {
        valueA: 'Achievement',
        valueB: 'Tradition',
        cellsCompared: 1,
        meanAbsoluteDivergence: 1,
        modelAProportionA: 1,
        modelBProportionA: 0,
      },
    ]);
  });

  it('returns pending while a missing snapshot queues a refresh', async () => {
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue(null);
    mocks.getModelAgreementSnapshot.mockImplementation(async (_prisma, queue, input) => {
      await queue.send(
        'refresh_model_agreement_snapshot',
        {
          scope: input.scope,
          signature: input.signature,
          domainId: input.domainId,
          domainIds: [...input.domainIds],
          modelIds: [...input.modelIds],
          reason: 'cache-miss',
        },
      );
      return {
        payload: null,
        source: 'BUILDING' as const,
        snapshotComputedAt: null,
      };
    });

    const response = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.modelAgreementOnTradeoffs).toMatchObject({
      pending: true,
      buildProgress: null,
      snapshotComputedAt: null,
      snapshotIsStale: false,
      snapshotSource: 'BUILDING',
      models: [],
      unavailableModels: [],
      excludedNonBinaryCells: 0,
      tiedCells: 0,
      pairwiseAgreementMatrix: [],
      trialConsistency: [],
    });
    expect(mocks.getBoss).toHaveBeenCalledTimes(1);
    expect(mocks.queueSend).toHaveBeenCalledTimes(1);
  });

  it('returns a live result for a non-canonical selection without queueing a refresh', async () => {
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: snapshot({
        'def-1::model-a::Achievement::Tradition::1::2': { aChoices: 6, bChoices: 0, neutrals: 0 },
        'def-1::model-c::Achievement::Tradition::1::2': { aChoices: 0, bChoices: 6, neutrals: 0 },
      }),
      buildProgress: null,
      inputHash: 'hash-live-noncanonical',
    });

    const response = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-c'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.modelAgreementOnTradeoffs).toMatchObject({
      pending: false,
      buildProgress: null,
      snapshotComputedAt: null,
      snapshotIsStale: false,
      snapshotSource: 'LIVE_NON_CANONICAL',
    });
    expect(mocks.getModelAgreementSnapshot).not.toHaveBeenCalled();
    expect(mocks.queueDomainAnalysisRefresh).not.toHaveBeenCalled();
  });

  it('lists a model with no cell-level outcomes as unavailable and keeps it out of the matrix', async () => {
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: snapshot({
        'def-1::model-a::Achievement::Tradition::1::2': { aChoices: 6, bChoices: 0, neutrals: 0 },
        'def-1::model-b::Achievement::Tradition::1::2': { aChoices: 0, bChoices: 6, neutrals: 0 },
      }),
      buildProgress: null,
      inputHash: 'hash-2',
    });

    const response = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b', 'model-c'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    const agreement = response.body.data.modelAgreementOnTradeoffs as {
      models: Array<{ modelId: string; label: string }>;
      unavailableModels: Array<{ modelId: string; label: string; reason: string }>;
      pairwiseAgreementMatrix: Array<unknown>;
    };

    expect(agreement.models.map((model) => model.modelId)).toEqual(['model-a', 'model-b']);
    expect(agreement.unavailableModels).toHaveLength(1);
    expect(agreement.unavailableModels[0]).toMatchObject({
      modelId: 'model-c',
      label: 'Model C',
      reason: 'No cell-level outcomes were available for the selected scope.',
    });
    expect(agreement.pairwiseAgreementMatrix).toHaveLength(1);

    const drilldownResponse = await graphqlRequest(drilldownQuery, {
      modelAId: 'model-a',
      modelBId: 'model-c',
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    expect(drilldownResponse.body.errors).toBeUndefined();
    expect(drilldownResponse.body.data.modelPairDivergenceBreakdown.perValuePair).toEqual([]);
  });

  it('surfaces build progress while the report is still rebuilding', async () => {
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: null,
      buildProgress: {
        completedRuns: 4,
        totalRuns: 10,
        currentRunId: 'run-4',
        updatedAt: '2026-05-08T15:00:00.000Z',
      },
      inputHash: 'hash-3',
    });

    const response = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-c'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.modelAgreementOnTradeoffs).toMatchObject({
      pending: true,
      buildProgress: {
        completedRuns: 4,
        totalRuns: 10,
        currentRunId: 'run-4',
        updatedAt: '2026-05-08T15:00:00.000Z',
      },
      snapshotComputedAt: null,
      snapshotIsStale: false,
      snapshotSource: 'LIVE_NON_CANONICAL',
    });
    expect(mocks.getModelAgreementSnapshot).not.toHaveBeenCalled();
  });

  it('returns a stale cache hit, marks it refreshing, and queues a refresh', async () => {
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: snapshot({
        'def-1::model-a::Achievement::Tradition::1::2': { aChoices: 6, bChoices: 0, neutrals: 0 },
        'def-1::model-b::Achievement::Tradition::1::2': { aChoices: 0, bChoices: 6, neutrals: 0 },
      }),
      buildProgress: null,
      inputHash: 'hash-stale-cache',
    });
    mocks.getModelAgreementSnapshot.mockImplementation(async (_prisma, queue, input) => {
      await queue.send(
        'refresh_model_agreement_snapshot',
        {
          scope: input.scope,
          signature: input.signature,
          domainId: input.domainId,
          domainIds: [...input.domainIds],
          modelIds: [...input.modelIds],
          reason: 'page-load-stale',
        },
      );
      const cacheHit = await buildCacheHitAgreement(input);
      return {
        ...cacheHit,
        source: 'CACHE_HIT_STALE' as const,
      };
    });

    const response = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.modelAgreementOnTradeoffs).toMatchObject({
      snapshotSource: 'CACHE_HIT_STALE',
      snapshotIsStale: true,
      snapshotComputedAt: '2026-05-01T12:00:00.000Z',
    });
    expect(mocks.queueSend).toHaveBeenCalledTimes(1);
  });

  it('does not reuse the canonical cache for a larger model selection', async () => {
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: snapshot({
        'def-1::model-a::Achievement::Tradition::1::2': { aChoices: 6, bChoices: 0, neutrals: 0 },
        'def-1::model-b::Achievement::Tradition::1::2': { aChoices: 0, bChoices: 6, neutrals: 0 },
        'def-1::model-c::Achievement::Tradition::1::2': { aChoices: 6, bChoices: 0, neutrals: 0 },
      }),
      buildProgress: null,
      inputHash: 'hash-collision',
    });

    const canonicalResponse = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    const expandedResponse = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b', 'model-c'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    expect(canonicalResponse.body.data.modelAgreementOnTradeoffs.snapshotSource).toBe('CACHE_HIT');
    expect(expandedResponse.body.data.modelAgreementOnTradeoffs.snapshotSource).toBe('LIVE_NON_CANONICAL');
    expect(mocks.getModelAgreementSnapshot).toHaveBeenCalledTimes(1);
  });

  it('returns a zero-overlap row with null metrics when two models never share a cell', async () => {
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: snapshot({
        'def-1::model-a::Achievement::Tradition::1::2': { aChoices: 6, bChoices: 0, neutrals: 0 },
        'def-2::model-b::Achievement::Tradition::1::2': { aChoices: 0, bChoices: 6, neutrals: 0 },
      }),
      buildProgress: null,
      inputHash: 'hash-4',
    });

    const response = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    const agreement = response.body.data.modelAgreementOnTradeoffs as {
      pairwiseAgreementMatrix: Array<{
        totalCells: number;
        percentAgreement: number | null;
        cohensKappa: number | null;
        kappaInterpretation: string | null;
        meanAbsoluteDivergence: number | null;
      }>;
    };

    expect(agreement.pairwiseAgreementMatrix).toHaveLength(1);
    expect(agreement.pairwiseAgreementMatrix[0]).toMatchObject({
      modelAId: 'model-a',
      modelBId: 'model-b',
      totalCells: 0,
      percentAgreement: null,
      cohensKappa: null,
      kappaInterpretation: null,
      meanAbsoluteDivergence: null,
    });
  });

  it('TIED is treated as a soft disagreement, not a hard one, under weighted kappa', async () => {
    // Model A is exactly 50/50 (TIED). Model B picks canonicalA always.
    // Under weighted kappa: A vs TIED is a one-step disagreement (weight 0.5),
    // not a hard disagreement (weight 0). Mean abs divergence = |0.5 - 1.0| = 0.5.
    //
    // Weighted math:
    //   P_observed_weighted = 0.5 (single cell: TIED vs A → weight 0.5)
    //   Marginals: pAx=0, pTx=1, pBx=0; pAy=1, pTy=0, pBy=0
    //   P_chance_weighted = pTx*pAy*0.5 = 0.5
    //   kappa = (0.5 - 0.5) / (1 - 0.5) = 0
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: snapshot({
        'def-1::model-a::Achievement::Tradition::1::2': { aChoices: 3, bChoices: 3, neutrals: 0 },
        'def-1::model-b::Achievement::Tradition::1::2': { aChoices: 6, bChoices: 0, neutrals: 0 },
      }),
      buildProgress: null,
      inputHash: 'hash-5',
    });

    const response = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    const agreement = response.body.data.modelAgreementOnTradeoffs as {
      tiedCells: number;
      pairwiseAgreementMatrix: Array<{
        totalCells: number;
        percentAgreement: number | null;
        cohensKappa: number | null;
        kappaInterpretation: string | null;
        meanAbsoluteDivergence: number | null;
      }>;
      trialConsistency: Array<{
        modelId: string;
        cellsObserved: number;
        meanTrialConsistency: number | null;
        noisy: boolean;
      }>;
    };

    // tiedCells = 1 (cell where at least one model was tied — informational, no longer "excluded")
    expect(agreement.tiedCells).toBe(1);
    expect(agreement.pairwiseAgreementMatrix).toHaveLength(1);
    expect(agreement.pairwiseAgreementMatrix[0]).toMatchObject({
      modelAId: 'model-a',
      modelBId: 'model-b',
      // totalCells INCLUDES the tied cell now
      totalCells: 1,
      // Binary same-category agreement: 0 (TIED ≠ A)
      percentAgreement: 0,
      // Weighted kappa = 0 (P_observed = P_chance = 0.5 in this degenerate single-cell case)
      cohensKappa: 0,
      kappaInterpretation: 'Slight',
      // Mean abs divergence INCLUDES the tied cell: |0.5 - 1.0| = 0.5
      meanAbsoluteDivergence: 0.5,
    });
    expect(agreement.trialConsistency).toHaveLength(2);
    expect(agreement.trialConsistency[0]).toMatchObject({
      modelId: 'model-a',
      cellsObserved: 1,
      meanTrialConsistency: 0.5,
      noisy: false,
    });
    expect(agreement.trialConsistency[1]).toMatchObject({
      modelId: 'model-b',
      cellsObserved: 1,
      meanTrialConsistency: 1,
      noisy: false,
    });
  });

  it('treats neutral trials as half-votes between A and B in cell categorization', async () => {
    // model-a: aChoices=4, neutrals=2. New proportionA = (4 + 0.5*2) / 6 = 5/6 ≈ 0.833 → A
    // model-b: aChoices=3, neutrals=3. New proportionA = (3 + 0.5*3) / 6 = 4.5/6 = 0.75 → A
    // Both categories are A → agrees. But proportions differ, so divergence = 5/6 - 3/4 = 1/12.
    // Under the old rule (neutrals excluded):
    //   model-a: 4/4 = 1.0 → A; model-b: 3/3 = 1.0 → A. divergence = 0.
    // The new rule shows the real difference in lean strength.
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: snapshot({
        'def-1::model-a::Achievement::Tradition::1::2': { aChoices: 4, bChoices: 0, neutrals: 2 },
        'def-1::model-b::Achievement::Tradition::1::2': { aChoices: 3, bChoices: 0, neutrals: 3 },
      }),
      buildProgress: null,
      inputHash: 'hash-neutral-half-votes',
    });

    const response = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    const agreement = response.body.data.modelAgreementOnTradeoffs as {
      pairwiseAgreementMatrix: Array<{
        totalCells: number;
        percentAgreement: number | null;
        meanAbsoluteDivergence: number | null;
      }>;
    };

    expect(agreement.pairwiseAgreementMatrix).toHaveLength(1);
    expect(agreement.pairwiseAgreementMatrix[0]).toMatchObject({
      totalCells: 1,
      // Both classified A → agree
      percentAgreement: 1,
    });
    // divergence = |5/6 - 3/4| = |10/12 - 9/12| = 1/12
    expect(agreement.pairwiseAgreementMatrix[0]?.meanAbsoluteDivergence).toBeCloseTo(1 / 12, 6);
  });

  it('classifies an all-neutral cell as TIED (no longer dropped)', async () => {
    // model-a: all neutral (aChoices=0, bChoices=0, neutrals=6).
    // Old rule: proportionA = null (no decisive trials) → cell dropped, totalCells = 0.
    // New rule: proportionA = (0 + 0.5*6) / 6 = 0.5 → TIED. Cell is kept.
    // model-b picks A always. TIED vs A = soft disagreement.
    //
    // Weighted math:
    //   P_observed_weighted = 0.5 (TIED vs A → weight 0.5)
    //   Marginals: pAx=0, pTx=1, pBx=0; pAy=1, pTy=0, pBy=0
    //   P_chance_weighted = pTx*pAy*0.5 = 0.5
    //   kappa = (0.5 - 0.5) / (1 - 0.5) = 0
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: snapshot({
        'def-1::model-a::Achievement::Tradition::1::2': { aChoices: 0, bChoices: 0, neutrals: 6 },
        'def-1::model-b::Achievement::Tradition::1::2': { aChoices: 6, bChoices: 0, neutrals: 0 },
      }),
      buildProgress: null,
      inputHash: 'hash-all-neutral',
    });

    const response = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    const agreement = response.body.data.modelAgreementOnTradeoffs as {
      tiedCells: number;
      pairwiseAgreementMatrix: Array<{
        totalCells: number;
        percentAgreement: number | null;
        cohensKappa: number | null;
        kappaInterpretation: string | null;
        meanAbsoluteDivergence: number | null;
      }>;
    };

    // Cell is now kept (not dropped): totalCells = 1
    expect(agreement.pairwiseAgreementMatrix).toHaveLength(1);
    expect(agreement.pairwiseAgreementMatrix[0]).toMatchObject({
      totalCells: 1,
      // TIED ≠ A: binary agreement = 0
      percentAgreement: 0,
      // Soft disagreement: kappa = 0
      cohensKappa: 0,
      kappaInterpretation: 'Slight',
      // |0.5 - 1.0| = 0.5
      meanAbsoluteDivergence: 0.5,
    });
    // model-a's all-neutral cell is counted as tied
    expect(agreement.tiedCells).toBe(1);
  });

  it('populates cohensKappaConfidenceLow/High that bracket the point estimate', async () => {
    // Build enough vignettes that bootstrap produces a real CI (>= 100 valid samples).
    // 20 vignettes: model-a always picks canonicalA, model-b alternates A/B.
    const cellLevelOutcomes: Record<string, CellOutcome> = {};
    for (let i = 1; i <= 20; i += 1) {
      cellLevelOutcomes[`def-${i}::model-a::Achievement::Tradition::1::2`] = { aChoices: 6, bChoices: 0, neutrals: 0 };
      // model-b alternates: even → A, odd → B
      const bA = i % 2 === 0 ? 6 : 0;
      const bB = i % 2 === 0 ? 0 : 6;
      cellLevelOutcomes[`def-${i}::model-b::Achievement::Tradition::1::2`] = { aChoices: bA, bChoices: bB, neutrals: 0 };
    }

    // Also register def-1 through def-20 in the scope data (latestDefinitionIds).
    const extendedScopeData = {
      ...scopeData(),
      latestDefinitionIds: Array.from({ length: 20 }, (_, i) => `def-${i + 1}`),
    };
    mocks.resolveDomainAnalysisScopeDefinitions.mockResolvedValue(extendedScopeData);
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: snapshot(cellLevelOutcomes),
      buildProgress: null,
      inputHash: 'hash-ci-test',
    });

    const response = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    expect(response.body.errors).toBeUndefined();
    const matrix = response.body.data.modelAgreementOnTradeoffs.pairwiseAgreementMatrix as Array<{
      cohensKappa: number | null;
      cohensKappaConfidenceLow: number | null;
      cohensKappaConfidenceHigh: number | null;
      cohensKappaConfidenceIsSymmetric: boolean;
    }>;

    expect(matrix).toHaveLength(1);
    const row = matrix[0]!;

    // The CI should be populated (20 vignettes → well above 100-sample threshold).
    expect(row.cohensKappaConfidenceLow).not.toBeNull();
    expect(row.cohensKappaConfidenceHigh).not.toBeNull();
    expect(typeof row.cohensKappaConfidenceIsSymmetric).toBe('boolean');

    if (row.cohensKappa != null && row.cohensKappaConfidenceLow != null && row.cohensKappaConfidenceHigh != null) {
      // CI must bracket the point estimate (within floating-point tolerance).
      expect(row.cohensKappaConfidenceLow).toBeLessThanOrEqual(row.cohensKappa + 0.01);
      expect(row.cohensKappaConfidenceHigh).toBeGreaterThanOrEqual(row.cohensKappa - 0.01);
    }
  });

  it('equal-weights value pairs in the headline kappa (no over-tested-pair bias)', async () => {
    // Setup: two value pairs of very different sizes.
    //
    // Pair 1 (Achievement vs Tradition, 1 vignette, 2 cells): models PERFECTLY DISAGREE.
    //   Both pick canonicalA at fractions that produce kappa near -1 within the pair.
    //
    // Pair 2 (Hedonism vs Stimulation, 1 vignette, 4 cells): models PERFECTLY AGREE.
    //   Both pick canonicalA on every cell.
    //
    // Cell counts differ (2 vs 4). Under the OLD aggregation (vignette equal-weight,
    // value-pair NOT equal-weight) the cells-per-vignette didn't bias things, but
    // vignettes-per-pair did — and with 1 vignette each here the old and new
    // approaches would coincide. To prove value-pair equal-weighting matters, we
    // need different vignette counts per pair.
    //
    // So: pair 1 has 2 vignettes (disagreeing); pair 2 has 1 vignette (agreeing).
    // Old aggregation: 3 vignette slots (2 disagree + 1 agree) → headline leans
    //   toward disagree.
    // New aggregation: 2 value-pair slots (1 disagree + 1 agree) → headline lands
    //   in the middle.
    mocks.readModelAgreementSnapshotStateFromSnapshot.mockResolvedValue({
      cellLevelOutcomes: snapshot({
        // Pair 1, vignette 1: A picks canonicalA, B picks canonicalB
        'def-1::model-a::Achievement::Tradition::1::1': { aChoices: 6, bChoices: 0, neutrals: 0 },
        'def-1::model-b::Achievement::Tradition::1::1': { aChoices: 0, bChoices: 6, neutrals: 0 },
        'def-1::model-a::Achievement::Tradition::2::2': { aChoices: 0, bChoices: 6, neutrals: 0 },
        'def-1::model-b::Achievement::Tradition::2::2': { aChoices: 6, bChoices: 0, neutrals: 0 },
        // Pair 1, vignette 2: same disagreement pattern
        'def-2::model-a::Achievement::Tradition::1::1': { aChoices: 6, bChoices: 0, neutrals: 0 },
        'def-2::model-b::Achievement::Tradition::1::1': { aChoices: 0, bChoices: 6, neutrals: 0 },
        'def-2::model-a::Achievement::Tradition::2::2': { aChoices: 0, bChoices: 6, neutrals: 0 },
        'def-2::model-b::Achievement::Tradition::2::2': { aChoices: 6, bChoices: 0, neutrals: 0 },
        // Pair 2, vignette 3: both pick canonicalA always (perfect agreement)
        'def-3::model-a::Hedonism::Stimulation::1::1': { aChoices: 6, bChoices: 0, neutrals: 0 },
        'def-3::model-b::Hedonism::Stimulation::1::1': { aChoices: 6, bChoices: 0, neutrals: 0 },
      }),
      buildProgress: null,
      inputHash: 'hash-equal-weight',
    });

    const response = await graphqlRequest(agreementQuery, {
      modelIds: ['model-a', 'model-b'],
      scope: 'ALL_DOMAINS',
      signature: 'sig-1',
    });

    const agreement = response.body.data.modelAgreementOnTradeoffs as {
      pairwiseAgreementMatrix: Array<{
        percentAgreement: number | null;
        meanAbsoluteDivergence: number | null;
      }>;
    };

    // With value-pair equal-weighting:
    //   Pair 1 percent-agreement = 0 (every cell disagrees)
    //   Pair 2 percent-agreement = 1 (every cell agrees)
    //   Headline percent-agreement = (0 + 1) / 2 = 0.5
    expect(agreement.pairwiseAgreementMatrix).toHaveLength(1);
    expect(agreement.pairwiseAgreementMatrix[0]?.percentAgreement).toBeCloseTo(0.5, 6);

    // Same logic for divergence:
    //   Pair 1 mean abs divergence = 1 (each cell |1 - 0| = 1)
    //   Pair 2 mean abs divergence = 0 (each cell |1 - 1| = 0)
    //   Headline = (1 + 0) / 2 = 0.5
    expect(agreement.pairwiseAgreementMatrix[0]?.meanAbsoluteDivergence).toBeCloseTo(0.5, 6);
  });
});
