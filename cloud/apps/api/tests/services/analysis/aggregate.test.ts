import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@valuerank/db';
import {
  claimAggregateRun,
  persistAggregateRun,
  prepareAggregateRunSnapshot,
  releaseAggregateClaim,
  spawnAggregateWorker,
} from '../../../src/services/analysis/aggregate/aggregate-run-workflow.js';

const { spawnPython } = vi.hoisted(() => ({
  spawnPython: vi.fn(),
}));

vi.mock('../../../src/queue/spawn.js', () => ({
  spawnPython,
}));

import { updateAggregateRun } from '../../../src/services/analysis/aggregate.js';

type TestRunOptions = {
  definitionId: string;
  scenarioIds: string[];
  modelScenarioMap: Record<string, string[]>;
  analysisCodeVersion?: string;
  assumptionKey?: string | null;
};

function buildAnalysisOutput(
  scenarioIds: string[],
  modelScenarioMap: Record<string, string[]>,
) {
  const perModel = Object.fromEntries(
    Object.keys(modelScenarioMap).map((modelId) => [
      modelId,
      {
        sampleSize: modelScenarioMap[modelId]?.length ?? 0,
        values: {},
        overall: { mean: 3, stdDev: 0.5, min: 1, max: 5 },
      },
    ]),
  );

  const decisionDistribution = Object.fromEntries(
    Object.keys(modelScenarioMap).map((modelId) => [modelId, { '1': 0, '2': 0, '3': 0, '4': 0, '5': modelScenarioMap[modelId]?.length ?? 0 }]),
  );
  const modelScenarioMatrix = Object.fromEntries(
    Object.entries(modelScenarioMap).map(([modelId, modelScenarioIds]) => [
      modelId,
      Object.fromEntries(modelScenarioIds.map((scenarioId) => [scenarioId, 5])),
    ]),
  );
  const scenarioDimensions = Object.fromEntries(
    scenarioIds.map((scenarioId, index) => [
      scenarioId,
      { stakes: index + 1 },
    ]),
  );

  return {
    perModel,
    modelAgreement: {},
    mostContestedScenarios: [],
    visualizationData: {
      decisionDistribution,
      modelScenarioMatrix,
      scenarioDimensions,
    },
    methodsUsed: {
      codeVersion: '1.1.1',
    },
    warnings: [],
    computedAt: '2026-03-11T00:00:00.000Z',
    durationMs: 1,
  };
}

async function createSourceRun({
  definitionId,
  scenarioIds,
  modelScenarioMap,
  analysisCodeVersion = '1.1.1',
  assumptionKey = null,
}: TestRunOptions) {
  const run = await db.run.create({
    data: {
      definitionId,
      status: 'COMPLETED',
      config: {
        definitionSnapshot: {
          _meta: {
            preambleVersionId: 'pre-1',
            definitionVersion: 1,
          },
        },
        temperature: 0.7,
        ...(assumptionKey ? { assumptionKey } : {}),
      },
      progress: { completed: 1, total: 1 },
    },
  });

  await db.analysisResult.create({
    data: {
      runId: run.id,
      analysisType: 'basic',
      status: 'CURRENT',
      codeVersion: analysisCodeVersion,
      inputHash: `hash-${run.id}`,
      output: buildAnalysisOutput(scenarioIds, modelScenarioMap),
    },
  });

  const transcriptData = Object.entries(modelScenarioMap).flatMap(([modelId, modelScenarioIds]) =>
    modelScenarioIds.map((scenarioId, index) => ({
      runId: run.id,
      modelId,
      scenarioId,
      sampleIndex: index,
      decisionCode: '5',
      content: {},
      turnCount: 1,
      tokenCount: 10,
      durationMs: 100,
      decisionCodeSource: 'deterministic',
    })),
  );

  if (transcriptData.length > 0) {
    await db.transcript.createMany({ data: transcriptData });
  }

  return run;
}

async function createCurrentAnalysisResult(
  runId: string,
  scenarioIds: string[],
  modelScenarioMap: Record<string, string[]>,
  analysisCodeVersion = '1.1.1'
) {
  return db.analysisResult.create({
    data: {
      runId,
      analysisType: 'basic',
      status: 'CURRENT',
      codeVersion: analysisCodeVersion,
      inputHash: `hash-${runId}-${analysisCodeVersion}-${Date.now()}`,
      output: buildAnalysisOutput(scenarioIds, modelScenarioMap),
    },
  });
}

describe('updateAggregateRun same-signature aggregate eligibility', () => {
  const definitionIds: string[] = [];

  beforeEach(() => {
    spawnPython.mockReset();
    spawnPython.mockResolvedValue({
      success: true,
      data: {
        success: true,
        analysis: {
          preferenceSummary: { perModel: {} },
          reliabilitySummary: { perModel: {} },
          aggregateSemantics: {
            perModelRepeatCoverage: {},
            perModelDrift: {},
          },
        },
      },
    });
  });

  afterEach(async () => {
    for (const definitionId of definitionIds.splice(0, definitionIds.length)) {
      const runs = await db.run.findMany({
        where: { definitionId },
        select: { id: true },
      });
      const runIds = runs.map((run) => run.id);

      if (runIds.length > 0) {
        await db.analysisResult.deleteMany({ where: { runId: { in: runIds } } });
        await db.transcript.deleteMany({ where: { runId: { in: runIds } } });
        await db.run.deleteMany({ where: { id: { in: runIds } } });
      }

      await db.scenario.deleteMany({ where: { definitionId } });
      await db.definition.delete({ where: { id: definitionId } });
    }
  });

  it('fails closed when any pooled model is missing planned baseline conditions', async () => {
    const definition = await db.definition.create({
      data: {
        name: `aggregate-test-${Date.now() + 1}`,
        content: {
          schema_version: 1,
          dimensions: [{ name: 'ValueA' }, { name: 'ValueB' }],
        },
      },
    });
    definitionIds.push(definition.id);

    const scenarios = await db.scenario.createManyAndReturn({
      data: [
        { definitionId: definition.id, name: 'Scenario 1', content: { dimensions: { stakes: 1 } } },
        { definitionId: definition.id, name: 'Scenario 2', content: { dimensions: { stakes: 2 } } },
      ],
      select: { id: true },
    });
    const scenarioIds = scenarios.map((scenario) => scenario.id);

    await createSourceRun({
      definitionId: definition.id,
      scenarioIds,
      modelScenarioMap: {
        'gpt-4': scenarioIds,
        'claude-3': [scenarioIds[0]!],
      },
    });

    await updateAggregateRun(definition.id, 'pre-1', 1, 0.7);

    expect(spawnPython).not.toHaveBeenCalled();

    const aggregateAnalysis = await db.analysisResult.findFirstOrThrow({
      where: {
        analysisType: 'AGGREGATE',
        run: { definitionId: definition.id },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect((aggregateAnalysis.output as Record<string, unknown>).aggregateMetadata).toMatchObject({
      aggregateEligibility: 'ineligible_partial_coverage',
      aggregateIneligibilityReason: 'At least one model is missing planned baseline conditions, so pooled baseline summaries would be incomplete.',
    });
  });

  it('prepares a stable aggregate snapshot with a fingerprint and claim lease before worker execution', async () => {
    const definition = await db.definition.create({
      data: {
        name: `aggregate-test-${Date.now() + 6}`,
        content: {
          schema_version: 1,
          dimensions: [{ name: 'ValueA' }, { name: 'ValueB' }],
        },
      },
    });
    definitionIds.push(definition.id);

    const scenarios = await db.scenario.createManyAndReturn({
      data: [
        { definitionId: definition.id, name: 'Scenario 1', content: { dimensions: { stakes: 1 } } },
        { definitionId: definition.id, name: 'Scenario 2', content: { dimensions: { stakes: 2 } } },
      ],
      select: { id: true },
    });
    const scenarioIds = scenarios.map((scenario) => scenario.id);

    await createSourceRun({
      definitionId: definition.id,
      scenarioIds,
      modelScenarioMap: { 'gpt-4': scenarioIds },
    });

    const prepared = await prepareAggregateRunSnapshot(definition.id, 'pre-1', 1, 0.7);

    expect(prepared).not.toBeNull();
    expect(prepared?.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared?.claim.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(prepared?.claim.leaseExpiresAt ?? '').getTime()).toBeGreaterThan(Date.now());
    expect(prepared?.aggregateWorkerInput).not.toBeNull();
    expect(prepared?.finalRunConfig).toMatchObject({
      isAggregate: true,
      sourceRunIds: expect.any(Array),
      transcriptCount: 2,
      temperature: 0.7,
      aggregateSourceFingerprint: prepared?.sourceFingerprint,
    });
  });

  it('rejects stale aggregate claims before the final persist step', async () => {
    const definition = await db.definition.create({
      data: {
        name: `aggregate-test-${Date.now() + 7}`,
        content: {
          schema_version: 1,
          dimensions: [{ name: 'ValueA' }, { name: 'ValueB' }],
        },
      },
    });
    definitionIds.push(definition.id);

    const scenarios = await db.scenario.createManyAndReturn({
      data: [
        { definitionId: definition.id, name: 'Scenario 1', content: { dimensions: { stakes: 1 } } },
        { definitionId: definition.id, name: 'Scenario 2', content: { dimensions: { stakes: 2 } } },
      ],
      select: { id: true },
    });
    const scenarioIds = scenarios.map((scenario) => scenario.id);

    await createSourceRun({
      definitionId: definition.id,
      scenarioIds,
      modelScenarioMap: { 'gpt-4': scenarioIds },
    });

    await updateAggregateRun(definition.id, 'pre-1', 1, 0.7);

    const prepared = await prepareAggregateRunSnapshot(definition.id, 'pre-1', 1, 0.7);
    expect(prepared).not.toBeNull();

    const claim = await claimAggregateRun(prepared!);
    const workerResult = await spawnAggregateWorker(prepared!);

    await db.run.update({
      where: { id: claim.aggregateRunId },
      data: {
        config: {
          ...prepared!.finalRunConfig,
          aggregateRecomputeClaim: {
            ...claim.claim,
            token: 'stale-token',
          },
        },
      },
    });

    await expect(persistAggregateRun(prepared!, claim, workerResult)).rejects.toMatchObject({
      retryable: true,
    });

    await releaseAggregateClaim(prepared!, claim);
  });

  it('restores the previous aggregate config when cleanup runs on the matching claim', async () => {
    const definition = await db.definition.create({
      data: {
        name: `aggregate-test-${Date.now() + 9}`,
        content: {
          schema_version: 1,
          dimensions: [{ name: 'ValueA' }, { name: 'ValueB' }],
        },
      },
    });
    definitionIds.push(definition.id);

    const scenarios = await db.scenario.createManyAndReturn({
      data: [
        { definitionId: definition.id, name: 'Scenario 1', content: { dimensions: { stakes: 1 } } },
        { definitionId: definition.id, name: 'Scenario 2', content: { dimensions: { stakes: 2 } } },
      ],
      select: { id: true },
    });
    const scenarioIds = scenarios.map((scenario) => scenario.id);

    await createSourceRun({
      definitionId: definition.id,
      scenarioIds,
      modelScenarioMap: { 'gpt-4': scenarioIds },
    });

    await updateAggregateRun(definition.id, 'pre-1', 1, 0.7);
    const baselineAggregateRun = await db.run.findFirstOrThrow({
      where: {
        definitionId: definition.id,
        tags: {
          some: {
            tag: {
              name: 'Aggregate',
            },
          },
        },
      },
    });
    const baselineConfigResult = baselineAggregateRun.config != null ? baselineAggregateRun.config : null;

    const prepared = await prepareAggregateRunSnapshot(definition.id, 'pre-1', 1, 0.7);
    expect(prepared).not.toBeNull();

    const claim = await claimAggregateRun(prepared!);

    await releaseAggregateClaim(prepared!, claim);

    const restoredAggregateRun = await db.run.findUniqueOrThrow({
      where: { id: claim.aggregateRunId },
    });

    expect(restoredAggregateRun.status).toBe('COMPLETED');
    expect(restoredAggregateRun.config).toEqual(baselineConfigResult);
  });

  it('marks a newly created aggregate as failed when cleanup runs on the matching claim', async () => {
    const definition = await db.definition.create({
      data: {
        name: `aggregate-test-${Date.now() + 10}`,
        content: {
          schema_version: 1,
          dimensions: [{ name: 'ValueA' }, { name: 'ValueB' }],
        },
      },
    });
    definitionIds.push(definition.id);

    const scenarios = await db.scenario.createManyAndReturn({
      data: [
        { definitionId: definition.id, name: 'Scenario 1', content: { dimensions: { stakes: 1 } } },
        { definitionId: definition.id, name: 'Scenario 2', content: { dimensions: { stakes: 2 } } },
      ],
      select: { id: true },
    });
    const scenarioIds = scenarios.map((scenario) => scenario.id);

    await createSourceRun({
      definitionId: definition.id,
      scenarioIds,
      modelScenarioMap: { 'gpt-4': scenarioIds },
    });

    const prepared = await prepareAggregateRunSnapshot(definition.id, 'pre-1', 1, 0.7);
    expect(prepared).not.toBeNull();

    const claim = await claimAggregateRun(prepared!);
    expect(claim.createdNew).toBe(true);

    await releaseAggregateClaim(prepared!, claim);

    const failedAggregateRun = await db.run.findUniqueOrThrow({
      where: { id: claim.aggregateRunId },
    });

    expect(failedAggregateRun.status).toBe('FAILED');
    expect(failedAggregateRun.config).not.toHaveProperty('aggregateRecomputeClaim');
    expect(failedAggregateRun.config).not.toHaveProperty('aggregateSourceFingerprint');
  });

  it('uses the newest current analysis result when multiple CURRENT rows exist', async () => {
    const definition = await db.definition.create({
      data: {
        name: `aggregate-test-${Date.now() + 8}`,
        content: {
          schema_version: 1,
          dimensions: [{ name: 'ValueA' }, { name: 'ValueB' }],
        },
      },
    });
    definitionIds.push(definition.id);

    const scenarios = await db.scenario.createManyAndReturn({
      data: [
        { definitionId: definition.id, name: 'Scenario 1', content: { dimensions: { stakes: 1 } } },
        { definitionId: definition.id, name: 'Scenario 2', content: { dimensions: { stakes: 2 } } },
      ],
      select: { id: true },
    });
    const scenarioIds = scenarios.map((scenario) => scenario.id);

    const run = await createSourceRun({
      definitionId: definition.id,
      scenarioIds,
      modelScenarioMap: { 'gpt-4': scenarioIds },
    });

    const originalAnalysis = await db.analysisResult.findFirstOrThrow({
      where: { runId: run.id, status: 'CURRENT' },
      orderBy: { createdAt: 'asc' },
    });

    await db.analysisResult.update({
      where: { id: originalAnalysis.id },
      data: {
        output: { broken: true },
      },
    });

    await createCurrentAnalysisResult(run.id, scenarioIds, { 'gpt-4': scenarioIds }, '1.1.2');

    await updateAggregateRun(definition.id, 'pre-1', 1, 0.7);

    expect(spawnPython).toHaveBeenCalledTimes(1);

    const aggregateAnalysis = await db.analysisResult.findFirstOrThrow({
      where: {
        analysisType: 'AGGREGATE',
        run: { definitionId: definition.id },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(aggregateAnalysis.output).toMatchObject({
      aggregateMetadata: {
        sourceRunCount: 1,
      },
      runCount: 1,
      analysisCount: 1,
    });
  });

  it('fails closed when any source run is an assumption run', async () => {
    const definition = await db.definition.create({
      data: {
        name: `aggregate-test-${Date.now() + 3}`,
        content: {
          schema_version: 1,
          dimensions: [{ name: 'ValueA' }, { name: 'ValueB' }],
        },
      },
    });
    definitionIds.push(definition.id);

    const scenarios = await db.scenario.createManyAndReturn({
      data: [
        { definitionId: definition.id, name: 'Scenario 1', content: { dimensions: { stakes: 1 } } },
        { definitionId: definition.id, name: 'Scenario 2', content: { dimensions: { stakes: 2 } } },
      ],
      select: { id: true },
    });
    const scenarioIds = scenarios.map((scenario) => scenario.id);

    await createSourceRun({
      definitionId: definition.id,
      scenarioIds,
      modelScenarioMap: { 'gpt-4': scenarioIds },
      assumptionKey: 'order_invariance',
    });

    await updateAggregateRun(definition.id, 'pre-1', 1, 0.7);

    expect(spawnPython).not.toHaveBeenCalled();

    const aggregateAnalysis = await db.analysisResult.findFirstOrThrow({
      where: {
        analysisType: 'AGGREGATE',
        run: { definitionId: definition.id },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect((aggregateAnalysis.output as Record<string, unknown>).aggregateMetadata).toMatchObject({
      aggregateEligibility: 'ineligible_run_type',
      aggregateIneligibilityReason: 'This aggregate mixes in assumption or manipulated runs, so it cannot be shown as baseline analysis.',
    });
  });

  it('publishes eligible aggregate summaries when source code versions differ but signature and baseline guards still match', async () => {
    const definition = await db.definition.create({
      data: {
        name: `aggregate-test-${Date.now() + 2}`,
        content: {
          schema_version: 1,
          dimensions: [{ name: 'ValueA' }, { name: 'ValueB' }],
        },
      },
    });
    definitionIds.push(definition.id);

    const scenarios = await db.scenario.createManyAndReturn({
      data: [
        { definitionId: definition.id, name: 'Scenario 1', content: { dimensions: { stakes: 1 } } },
        { definitionId: definition.id, name: 'Scenario 2', content: { dimensions: { stakes: 2 } } },
      ],
      select: { id: true },
    });
    const scenarioIds = scenarios.map((scenario) => scenario.id);

    const runA = await createSourceRun({
      definitionId: definition.id,
      scenarioIds,
      modelScenarioMap: { 'gpt-4': scenarioIds },
      analysisCodeVersion: '1.1.1',
    });

    const runB = await createSourceRun({
      definitionId: definition.id,
      scenarioIds,
      modelScenarioMap: { 'gpt-4': scenarioIds },
      analysisCodeVersion: '1.1.3',
    });

    await updateAggregateRun(definition.id, 'pre-1', 1, 0.7);

    expect(spawnPython).toHaveBeenCalledTimes(1);
    expect(spawnPython).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        emitVignetteSemantics: true,
        aggregateSemantics: expect.objectContaining({
          mode: 'same_signature_v1',
          plannedScenarioIds: scenarioIds,
        }),
        transcripts: expect.arrayContaining([
          expect.objectContaining({ runId: runA.id, modelId: 'gpt-4' }),
          expect.objectContaining({ runId: runB.id, modelId: 'gpt-4' }),
        ]),
      }),
      expect.any(Object),
    );

    const aggregateAnalysis = await db.analysisResult.findFirstOrThrow({
      where: {
        analysisType: 'AGGREGATE',
        run: { definitionId: definition.id },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(aggregateAnalysis.codeVersion).toBe('1.2.0');
    expect(aggregateAnalysis.output).toMatchObject({
      preferenceSummary: { perModel: {} },
      reliabilitySummary: { perModel: {} },
      aggregateMetadata: {
        aggregateEligibility: 'eligible_same_signature_baseline',
        aggregateIneligibilityReason: null,
        sourceRunCount: 2,
      },
    });
  });

  it('treats temp-zero same-signature runs as baseline-compatible for aggregate eligibility', async () => {
    const definition = await db.definition.create({
      data: {
        name: `aggregate-test-${Date.now() + 4}`,
        content: {
          schema_version: 1,
          dimensions: [{ name: 'ValueA' }, { name: 'ValueB' }],
        },
      },
    });
    definitionIds.push(definition.id);

    const scenarios = await db.scenario.createManyAndReturn({
      data: [
        { definitionId: definition.id, name: 'Scenario 1', content: { dimensions: { stakes: 1 } } },
        { definitionId: definition.id, name: 'Scenario 2', content: { dimensions: { stakes: 2 } } },
      ],
      select: { id: true },
    });
    const scenarioIds = scenarios.map((scenario) => scenario.id);

    await createSourceRun({
      definitionId: definition.id,
      scenarioIds,
      modelScenarioMap: { 'gpt-4': scenarioIds },
      assumptionKey: 'temp_zero_determinism',
    });

    await updateAggregateRun(definition.id, 'pre-1', 1, 0.7);

    expect(spawnPython).toHaveBeenCalledTimes(1);

    const aggregateAnalysis = await db.analysisResult.findFirstOrThrow({
      where: {
        analysisType: 'AGGREGATE',
        run: { definitionId: definition.id },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect((aggregateAnalysis.output as Record<string, unknown>).aggregateMetadata).toMatchObject({
      aggregateEligibility: 'eligible_same_signature_baseline',
      aggregateIneligibilityReason: null,
    });
  });

  it('preserves worker payload shaping and normalized aggregate artifacts after the split', async () => {
    const definition = await db.definition.create({
      data: {
        name: `aggregate-test-${Date.now() + 5}`,
        content: {
          schema_version: 1,
          dimensions: [{ name: 'ValueA' }, { name: 'ValueB' }],
        },
      },
    });
    definitionIds.push(definition.id);

    const scenarios = await db.scenario.createManyAndReturn({
      data: [
        { definitionId: definition.id, name: 'Scenario 1', content: { dimensions: { stakes: 1 } }, orientationFlipped: false },
        { definitionId: definition.id, name: 'Scenario 2', content: { dimensions: { stakes: 2 } }, orientationFlipped: true },
      ],
      select: { id: true },
    });
    const scenarioIds = scenarios.map((scenario) => scenario.id);

    await createSourceRun({
      definitionId: definition.id,
      scenarioIds,
      modelScenarioMap: {
        'gpt-4': [scenarioIds[0]!, scenarioIds[0]!, scenarioIds[1]!, scenarioIds[1]!],
      },
    });

    await updateAggregateRun(definition.id, 'pre-1', 1, 0.7);

    expect(spawnPython).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        aggregateSemantics: expect.objectContaining({
          plannedScenarioIds: scenarioIds,
          minRepeatCoverageCount: 3,
          minRepeatCoverageShare: 0.2,
          lowCoverageCautionThreshold: 5,
          driftWarningThreshold: 0.25,
        }),
        transcripts: expect.arrayContaining([
          expect.objectContaining({
            scenarioId: scenarioIds[1],
            orientationFlipped: true,
            summary: expect.objectContaining({
              score: 5,
              values: {
                ValueA: 'deprioritized',
                ValueB: 'prioritized',
              },
            }),
          }),
        ]),
      }),
      expect.any(Object),
    );

    const aggregateAnalysis = await db.analysisResult.findFirstOrThrow({
      where: {
        analysisType: 'AGGREGATE',
        run: { definitionId: definition.id },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(aggregateAnalysis.output).toMatchObject({
      methodsUsed: {
        aggregateSemantics: 'same-signature-v1',
        codeVersion: '1.2.0',
      },
      visualizationData: {
        scenarioDimensions: {
          [scenarioIds[0]!]: { stakes: '1' },
          [scenarioIds[1]!]: { stakes: '2' },
        },
      },
      varianceAnalysis: {
        isMultiSample: true,
        orientationCorrectedCount: 1,
      },
    });
  });
});
