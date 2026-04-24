import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
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

const app = createServer();

describe('Run progress GraphQL queries', () => {
  const createdDefinitionIds: string[] = [];
  const createdScenarioIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdTranscriptIds: string[] = [];
  const createdProbeResultIds: string[] = [];
  const createdAnomalyIds: string[] = [];

  afterEach(async () => {
    if (createdAnomalyIds.length > 0) {
      await db.runAnomaly.deleteMany({ where: { id: { in: createdAnomalyIds } } });
      createdAnomalyIds.length = 0;
    }
    if (createdTranscriptIds.length > 0) {
      await db.transcript.deleteMany({ where: { id: { in: createdTranscriptIds } } });
      createdTranscriptIds.length = 0;
    }
    if (createdProbeResultIds.length > 0) {
      await db.probeResult.deleteMany({ where: { id: { in: createdProbeResultIds } } });
      createdProbeResultIds.length = 0;
    }
    if (createdRunIds.length > 0) {
      await db.runScenarioSelection.deleteMany({ where: { runId: { in: createdRunIds } } });
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
  });

  async function createRun() {
    const definition = await db.definition.create({
      data: {
        name: 'GraphQL run-progress test',
        content: { schema_version: 1, preamble: 'Test' },
      },
    });
    createdDefinitionIds.push(definition.id);

    const scenario = await db.scenario.create({
      data: {
        definitionId: definition.id,
        name: 'scenario-' + Date.now(),
        content: { schema_version: 1, prompt: 'Test', dimension_values: {} },
      },
    });
    createdScenarioIds.push(scenario.id);

    const run = await db.run.create({
      data: {
        definitionId: definition.id,
        status: 'SUMMARIZING',
        config: {
          models: ['openai:gpt-4o', 'anthropic:claude-3'],
          samplesPerScenario: 1,
        },
        progress: { total: 10, completed: 999, failed: 999 },
        summarizeProgress: { total: 5, completed: 999, failed: 999 },
      },
    });
    createdRunIds.push(run.id);

    await db.runScenarioSelection.create({
      data: {
        runId: run.id,
        scenarioId: scenario.id,
      },
    });

    return { run, scenario };
  }

  it('derives runProgress from ProbeResult rows', async () => {
    const { run } = await createRun();

    const successProbeIds: string[] = [];
    const failedProbeIds: string[] = [];

    for (let i = 0; i < 6; i++) {
      const probe = await db.probeResult.create({
        data: {
          runId: run.id,
          scenarioId: createdScenarioIds[0]!,
          modelId: 'openai:gpt-4o',
          sampleIndex: i,
          status: 'SUCCESS',
        },
      });
      successProbeIds.push(probe.id);
    }

    for (let i = 0; i < 2; i++) {
      const probe = await db.probeResult.create({
        data: {
          runId: run.id,
          scenarioId: createdScenarioIds[0]!,
          modelId: 'anthropic:claude-3',
          sampleIndex: i,
          status: 'FAILED',
          errorCode: 'TEST',
          errorMessage: 'test',
        },
      });
      failedProbeIds.push(probe.id);
    }

    createdProbeResultIds.push(...successProbeIds, ...failedProbeIds);

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: `
          query GetRun($id: ID!) {
            run(id: $id) {
              runProgress {
                total
                completed
                failed
                percentComplete
              }
            }
          }
        `,
        variables: { id: run.id },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.run.runProgress).toEqual({
      total: 10,
      completed: 6,
      failed: 2,
      percentComplete: 80,
    });
  });

  it('derives summarizeProgress from Transcript rows and surfaces anomalies', async () => {
    const { run } = await createRun();

    const transcripts: Array<{ summarizedAt?: Date; summarizeFailedAt?: Date; modelId: string }> = [
      { modelId: 'openai:gpt-4o', summarizedAt: new Date() },
      { modelId: 'openai:gpt-4o', summarizedAt: new Date() },
      { modelId: 'anthropic:claude-3', summarizedAt: new Date() },
      { modelId: 'anthropic:claude-3', summarizeFailedAt: new Date() },
      { modelId: 'anthropic:claude-3' },
    ];

    for (const transcriptData of transcripts) {
      const transcript = await db.transcript.create({
        data: {
          runId: run.id,
          scenarioId: createdScenarioIds[0]!,
          modelId: transcriptData.modelId,
          content: { schema_version: 1, messages: [], costSnapshot: { estimatedCost: 1 } },
          turnCount: 1,
          tokenCount: 100,
          durationMs: 1000,
          summarizedAt: transcriptData.summarizedAt ?? null,
          summarizeFailedAt: transcriptData.summarizeFailedAt ?? null,
          decisionText: transcriptData.summarizeFailedAt ? 'Summary failed: test' : null,
        },
      });
      createdTranscriptIds.push(transcript.id);
    }

    const anomaly = await db.runAnomaly.create({
      data: {
        runId: run.id,
        type: 'STRANDED_TRANSCRIPT',
        subject: '',
        details: { transcriptIds: [createdTranscriptIds[4]] },
      },
    });
    createdAnomalyIds.push(anomaly.id);

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: `
          query GetRun($id: ID!) {
            run(id: $id) {
              summarizeProgress {
                total
                completed
                failed
                percentComplete
              }
              anomalies {
                id
                type
                subject
              }
            }
          }
        `,
        variables: { id: run.id },
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.run.summarizeProgress).toEqual({
      total: 5,
      completed: 3,
      failed: 1,
      percentComplete: 80,
    });
    expect(response.body.data.run.anomalies).toEqual([
      {
        id: anomaly.id,
        type: 'STRANDED_TRANSCRIPT',
        subject: '',
      },
    ]);
  });
});
