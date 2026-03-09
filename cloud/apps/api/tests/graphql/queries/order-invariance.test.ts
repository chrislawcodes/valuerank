import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { getAuthHeader } from '../../test-utils.js';

vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  })),
  createBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  startBoss: vi.fn().mockResolvedValue(undefined),
  stopBoss: vi.fn().mockResolvedValue(undefined),
  isBossRunning: vi.fn().mockReturnValue(false),
}));

vi.mock('@valuerank/db', () => ({
  db: {
    assumptionScenarioPair: {
      findMany: vi.fn(),
    },
    llmModel: {
      findMany: vi.fn(),
    },
    transcript: {
      findMany: vi.fn(),
    },
    assumptionAnalysisSnapshot: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { db } from '@valuerank/db';

const app = createServer();

const query = `
  query AssumptionsOrderInvariance($directionOnly: Boolean, $trimOutliers: Boolean) {
    assumptionsOrderInvariance(directionOnly: $directionOnly, trimOutliers: $trimOutliers) {
      summary {
        status
        matchRate
        comparablePairs
      }
      modelMetrics {
        modelId
        modelLabel
        matchRate
        matchCount
        matchEligibleCount
        valueOrderReversalRate
        valueOrderEligibleCount
        valueOrderExcludedCount
        valueOrderPull
        scaleOrderReversalRate
        scaleOrderEligibleCount
        scaleOrderExcludedCount
        scaleOrderPull
        withinCellDisagreementRate
        pairLevelMarginSummary {
          mean
          median
          p25
          p75
        }
      }
      rows {
        modelId
        variantType
        majorityVoteBaseline
        majorityVoteFlipped
        isMatch
      }
    }
  }
`;

const LOCKED_VIGNETTE_ID = 'cmlsmyn9l0j3rxeiricruouia';

function buildPair(id: string, variantType: string | null, sourceScenarioId: string, variantScenarioId: string) {
  return {
    id,
    variantType,
    sourceScenario: {
      id: sourceScenarioId,
      name: 'sentinel_4 / compare_2',
      definitionId: LOCKED_VIGNETTE_ID,
      orientationFlipped: false,
    },
    variantScenario: {
      id: variantScenarioId,
      name: 'sentinel_4 / compare_2',
      definitionId: LOCKED_VIGNETTE_ID,
      orientationFlipped: variantType === 'presentation_flipped' || variantType === 'fully_flipped',
    },
  };
}

function buildTranscript(args: {
  id: string;
  scenarioId: string;
  decisionCode: string;
  createdAt: string;
  assumptionKey: string;
  withAssumptionTag?: boolean;
}) {
  return {
    id: args.id,
    scenarioId: args.scenarioId,
    modelId: 'model-a',
    modelVersion: 'v1',
    decisionCode: args.decisionCode,
    createdAt: new Date(args.createdAt),
    run: {
      deletedAt: null,
      config: {
        temperature: 0,
        assumptionKey: args.assumptionKey,
      },
      tags: args.withAssumptionTag === false ? [] : [{ tag: { name: 'assumption-run' } }],
    },
  };
}

describe('assumptionsOrderInvariance query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.llmModel.findMany).mockResolvedValue([
      { modelId: 'model-a', displayName: 'Model A' },
    ] as never);
    vi.mocked(db.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);
    vi.mocked(db.assumptionAnalysisSnapshot.create).mockResolvedValue({
      id: 'snapshot-1',
    } as never);
    vi.mocked(db.assumptionAnalysisSnapshot.updateMany).mockResolvedValue({
      count: 0,
    } as never);
  });

  it('returns backend-computed modelMetrics while preserving rows', async () => {
    vi.mocked(db.assumptionScenarioPair.findMany).mockResolvedValue([
      buildPair('pair-p', 'presentation_flipped', 'scenario-baseline', 'scenario-p'),
      buildPair('pair-s', 'scale_flipped', 'scenario-baseline', 'scenario-s'),
      buildPair('pair-f', 'fully_flipped', 'scenario-baseline', 'scenario-f'),
    ] as never);
    vi.mocked(db.transcript.findMany).mockResolvedValue([
      buildTranscript({ id: 'b1', scenarioId: 'scenario-baseline', decisionCode: '4', createdAt: '2026-03-01T10:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b2', scenarioId: 'scenario-baseline', decisionCode: '4', createdAt: '2026-03-01T09:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b3', scenarioId: 'scenario-baseline', decisionCode: '4', createdAt: '2026-03-01T08:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b4', scenarioId: 'scenario-baseline', decisionCode: '1', createdAt: '2026-03-01T07:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b5', scenarioId: 'scenario-baseline', decisionCode: '5', createdAt: '2026-03-01T06:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'p1', scenarioId: 'scenario-p', decisionCode: '2', createdAt: '2026-03-01T10:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'p2', scenarioId: 'scenario-p', decisionCode: '2', createdAt: '2026-03-01T09:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'p3', scenarioId: 'scenario-p', decisionCode: '2', createdAt: '2026-03-01T08:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'p4', scenarioId: 'scenario-p', decisionCode: '1', createdAt: '2026-03-01T07:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'p5', scenarioId: 'scenario-p', decisionCode: '5', createdAt: '2026-03-01T06:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 's1', scenarioId: 'scenario-s', decisionCode: '2', createdAt: '2026-03-01T10:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 's2', scenarioId: 'scenario-s', decisionCode: '2', createdAt: '2026-03-01T09:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 's3', scenarioId: 'scenario-s', decisionCode: '2', createdAt: '2026-03-01T08:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 's4', scenarioId: 'scenario-s', decisionCode: '1', createdAt: '2026-03-01T07:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 's5', scenarioId: 'scenario-s', decisionCode: '5', createdAt: '2026-03-01T06:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'f1', scenarioId: 'scenario-f', decisionCode: '1', createdAt: '2026-03-01T10:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'f2', scenarioId: 'scenario-f', decisionCode: '1', createdAt: '2026-03-01T09:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'f3', scenarioId: 'scenario-f', decisionCode: '1', createdAt: '2026-03-01T08:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'f4', scenarioId: 'scenario-f', decisionCode: '5', createdAt: '2026-03-01T07:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'f5', scenarioId: 'scenario-f', decisionCode: '2', createdAt: '2026-03-01T06:00:00Z', assumptionKey: 'order_invariance' }),
    ] as never);
    vi.mocked(db.assumptionAnalysisSnapshot.findFirst).mockResolvedValue(null as never);

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query, variables: { directionOnly: true, trimOutliers: true } });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.assumptionsOrderInvariance.summary).toMatchObject({
      status: 'COMPUTED',
      matchRate: 2 / 3,
      comparablePairs: 3,
    });
    expect(response.body.data.assumptionsOrderInvariance.modelMetrics).toEqual([
      expect.objectContaining({
        modelId: 'model-a',
        modelLabel: 'Model A',
        matchRate: 1,
        matchCount: 1,
        matchEligibleCount: 1,
        valueOrderReversalRate: 1,
        valueOrderEligibleCount: 1,
        valueOrderExcludedCount: 0,
        valueOrderPull: 'no clear pull',
        scaleOrderReversalRate: 0,
        scaleOrderEligibleCount: 1,
        scaleOrderExcludedCount: 0,
        scaleOrderPull: 'no clear pull',
        withinCellDisagreementRate: 0,
        pairLevelMarginSummary: {
          mean: 1,
          median: 1,
          p25: 1,
          p75: 1,
        },
      }),
    ]);
    expect(response.body.data.assumptionsOrderInvariance.rows).toHaveLength(3);
    expect(db.assumptionAnalysisSnapshot.create).toHaveBeenCalledTimes(1);
    expect(db.assumptionAnalysisSnapshot.updateMany).toHaveBeenCalledTimes(1);
  });

  it('reuses a cached snapshot when the input hash matches', async () => {
    vi.mocked(db.assumptionScenarioPair.findMany).mockResolvedValue([
      buildPair('pair-p', 'presentation_flipped', 'scenario-baseline', 'scenario-p'),
    ] as never);
    vi.mocked(db.transcript.findMany).mockResolvedValue([
      buildTranscript({ id: 'b1', scenarioId: 'scenario-baseline', decisionCode: '4', createdAt: '2026-03-01T10:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b2', scenarioId: 'scenario-baseline', decisionCode: '4', createdAt: '2026-03-01T09:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b3', scenarioId: 'scenario-baseline', decisionCode: '4', createdAt: '2026-03-01T08:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b4', scenarioId: 'scenario-baseline', decisionCode: '1', createdAt: '2026-03-01T07:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b5', scenarioId: 'scenario-baseline', decisionCode: '5', createdAt: '2026-03-01T06:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'p1', scenarioId: 'scenario-p', decisionCode: '2', createdAt: '2026-03-01T10:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'p2', scenarioId: 'scenario-p', decisionCode: '2', createdAt: '2026-03-01T09:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'p3', scenarioId: 'scenario-p', decisionCode: '2', createdAt: '2026-03-01T08:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'p4', scenarioId: 'scenario-p', decisionCode: '1', createdAt: '2026-03-01T07:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'p5', scenarioId: 'scenario-p', decisionCode: '5', createdAt: '2026-03-01T06:00:00Z', assumptionKey: 'order_invariance' }),
    ] as never);
    vi.mocked(db.assumptionAnalysisSnapshot.findFirst).mockResolvedValue({
      id: 'snapshot-cached',
      createdAt: new Date('2026-03-09T08:00:00Z'),
      output: {
        summary: {
          status: 'COMPUTED',
          matchRate: null,
          exactMatchRate: null,
          presentationEffectMAD: 2,
          scaleEffectMAD: null,
          totalCandidatePairs: 1,
          qualifyingPairs: 1,
          missingPairs: 0,
          comparablePairs: 1,
          sensitiveModelCount: 1,
          sensitiveVignetteCount: 1,
          excludedPairs: [],
        },
        modelMetrics: [
          {
            modelId: 'model-a',
            modelLabel: 'Model A',
            matchRate: null,
            matchCount: 0,
            matchEligibleCount: 0,
            valueOrderReversalRate: 1,
            valueOrderEligibleCount: 1,
            valueOrderExcludedCount: 0,
            valueOrderPull: 'no clear pull',
            scaleOrderReversalRate: null,
            scaleOrderEligibleCount: 0,
            scaleOrderExcludedCount: 0,
            scaleOrderPull: 'no clear pull',
            withinCellDisagreementRate: 0,
            pairLevelMarginSummary: {
              mean: 1,
              median: 1,
              p25: 1,
              p75: 1,
            },
          },
        ],
        rows: [
          {
            modelId: 'model-a',
            modelLabel: 'Model A',
            vignetteId: LOCKED_VIGNETTE_ID,
            vignetteTitle: 'Jobs (Self Direction Action vs Power Dominance)',
            conditionKey: '4x2',
            variantType: 'presentation_flipped',
            majorityVoteBaseline: 4,
            majorityVoteFlipped: 2,
            mismatchType: 'direction_flip',
            ordinalDistance: 2,
            isMatch: false,
          },
        ],
      },
    } as never);

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query, variables: { directionOnly: true, trimOutliers: true } });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.assumptionsOrderInvariance.modelMetrics[0]).toMatchObject({
      modelId: 'model-a',
      valueOrderReversalRate: 1,
    });
    expect(db.assumptionAnalysisSnapshot.create).not.toHaveBeenCalled();
    expect(db.assumptionAnalysisSnapshot.updateMany).not.toHaveBeenCalled();
  });

  it('does not count midpoint-vs-midpoint as a directionOnly match', async () => {
    vi.mocked(db.assumptionScenarioPair.findMany).mockResolvedValue([
      buildPair('pair-f', 'fully_flipped', 'scenario-baseline', 'scenario-f'),
    ] as never);
    vi.mocked(db.transcript.findMany).mockResolvedValue([
      buildTranscript({ id: 'b1', scenarioId: 'scenario-baseline', decisionCode: '3', createdAt: '2026-03-01T10:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b2', scenarioId: 'scenario-baseline', decisionCode: '3', createdAt: '2026-03-01T09:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b3', scenarioId: 'scenario-baseline', decisionCode: '3', createdAt: '2026-03-01T08:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b4', scenarioId: 'scenario-baseline', decisionCode: '3', createdAt: '2026-03-01T07:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'b5', scenarioId: 'scenario-baseline', decisionCode: '3', createdAt: '2026-03-01T06:00:00Z', assumptionKey: 'temp_zero_determinism' }),
      buildTranscript({ id: 'f1', scenarioId: 'scenario-f', decisionCode: '3', createdAt: '2026-03-01T10:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'f2', scenarioId: 'scenario-f', decisionCode: '3', createdAt: '2026-03-01T09:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'f3', scenarioId: 'scenario-f', decisionCode: '3', createdAt: '2026-03-01T08:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'f4', scenarioId: 'scenario-f', decisionCode: '3', createdAt: '2026-03-01T07:00:00Z', assumptionKey: 'order_invariance' }),
      buildTranscript({ id: 'f5', scenarioId: 'scenario-f', decisionCode: '3', createdAt: '2026-03-01T06:00:00Z', assumptionKey: 'order_invariance' }),
    ] as never);
    vi.mocked(db.assumptionAnalysisSnapshot.findFirst).mockResolvedValue(null as never);

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query, variables: { directionOnly: true, trimOutliers: true } });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.assumptionsOrderInvariance.summary).toMatchObject({
      status: 'COMPUTED',
      matchRate: 0,
      comparablePairs: 1,
    });
    expect(response.body.data.assumptionsOrderInvariance.modelMetrics).toEqual([
      expect.objectContaining({
        modelId: 'model-a',
        matchRate: 0,
        matchCount: 0,
        matchEligibleCount: 1,
      }),
    ]);
    expect(response.body.data.assumptionsOrderInvariance.rows).toEqual([
      expect.objectContaining({
        modelId: 'model-a',
        majorityVoteBaseline: 3,
        majorityVoteFlipped: 3,
        isMatch: false,
      }),
    ]);
  });
});
