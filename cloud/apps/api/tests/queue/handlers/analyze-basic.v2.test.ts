import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@valuerank/db';

vi.mock('../../../src/queue/spawn.js', () => ({
  spawnPython: vi.fn(),
}));

describe('analyze-basic handler with decision-model v2 enabled', () => {
  const createdIds = {
    definition: '' as string,
    run: '' as string,
    scenario: '' as string,
    transcript: '' as string,
  };

  let createAnalyzeBasicHandler: typeof import('../../../src/queue/handlers/analyze-basic.js').createAnalyzeBasicHandler;
  let mockSpawnPython: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost/test';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'test-secret-that-is-at-least-32-characters-long';
    process.env.DECISION_MODEL_V2 = 'true';

    vi.resetModules();

    const handlerModule = await import('../../../src/queue/handlers/analyze-basic.js');
    createAnalyzeBasicHandler = handlerModule.createAnalyzeBasicHandler;

    const spawnModule = await import('../../../src/queue/spawn.js');
    mockSpawnPython = vi.mocked(spawnModule.spawnPython);
  });

  afterEach(async () => {
    mockSpawnPython.mockReset();

    if (createdIds.transcript) {
      await db.transcript.deleteMany({ where: { id: createdIds.transcript } });
      createdIds.transcript = '';
    }
    if (createdIds.scenario) {
      await db.scenario.deleteMany({ where: { id: createdIds.scenario } });
      createdIds.scenario = '';
    }
    if (createdIds.run) {
      await db.run.deleteMany({ where: { id: createdIds.run } });
      createdIds.run = '';
    }
    if (createdIds.definition) {
      await db.definition.deleteMany({ where: { id: createdIds.definition } });
      createdIds.definition = '';
    }
  });

  it('sends canonical decision data to the worker when the v2 flag is on', async () => {
    const definition = await db.definition.create({
      data: {
        name: 'V2 Analyze Basic Definition',
        content: {
          schema_version: 1,
          dimensions: [
            { name: 'Achievement' },
            { name: 'Benevolence_Dependability' },
          ],
        },
      },
    });
    createdIds.definition = definition.id;

    const run = await db.run.create({
      data: {
        definitionId: definition.id,
        status: 'COMPLETED',
        config: {
          models: ['test-model'],
          assumptionKey: 'temp_zero_determinism',
        },
      },
    });
    createdIds.run = run.id;

    const scenario = await db.scenario.create({
      data: {
        definitionId: definition.id,
        name: 'V2 Scenario',
        content: { dimensions: { stakes: 'high' } },
      },
    });
    createdIds.scenario = scenario.id;

    const transcript = await db.transcript.create({
      data: {
        runId: run.id,
        modelId: 'test-model',
        scenarioId: scenario.id,
        decisionMetadata: {
          matchedLabel: 'Achievement',
          parseClass: 'exact',
          parsePath: 'exact.favor_first.strong',
          parserVersion: 'parser-1',
          responseExcerpt: 'Achievement',
        },
        definitionSnapshot: {
          dimensions: [
            { name: 'Achievement' },
            { name: 'Benevolence_Dependability' },
          ],
          methodology: {
            presentation_order: 'A_first',
          },
        },
        content: { turns: [] },
        turnCount: 1,
        tokenCount: 50,
        durationMs: 1000,
      },
    });
    createdIds.transcript = transcript.id;

    mockSpawnPython.mockResolvedValueOnce({
      success: true,
      data: {
        success: true,
        analysis: {
          perModel: {},
          preferenceSummary: null,
          reliabilitySummary: null,
          modelAgreement: {},
          dimensionAnalysis: {},
          varianceAnalysis: {
            isMultiSample: false,
            samplesPerScenario: 1,
            perModel: {},
            mostVariableScenarios: [],
            leastVariableScenarios: [],
          },
          mostContestedScenarios: [],
          methodsUsed: {},
          warnings: [],
          computedAt: '2026-03-23T00:00:00.000Z',
          durationMs: 1,
        },
      },
      stderr: '',
    });

    const handler = createAnalyzeBasicHandler();
    await handler([
      {
        id: 'job-1',
        data: {
          runId: run.id,
          transcriptIds: [transcript.id],
        },
      } as never,
    ]);

    expect(mockSpawnPython).toHaveBeenCalledWith(
      'workers/analyze_basic.py',
      expect.objectContaining({
        runId: run.id,
        transcripts: [
          expect.objectContaining({
            id: transcript.id,
            decisionModelV2: expect.objectContaining({
              canonical: expect.objectContaining({
                favoredValueKey: 'Achievement',
                opposedValueKey: 'Benevolence_Dependability',
                direction: 'favor_first',
                strength: 'strong',
              }),
              raw: expect.objectContaining({
                parseClass: 'exact',
                parsePath: 'exact.favor_first.strong',
                parserVersion: 'parser-1',
              }),
            }),
            summary: {
              values: {
                Achievement: 'prioritized',
                Benevolence_Dependability: 'deprioritized',
              },
            },
          }),
        ],
      }),
      expect.objectContaining({ timeout: 120000 }),
    );
  });
});
