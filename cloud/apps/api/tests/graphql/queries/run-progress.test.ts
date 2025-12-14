/**
 * Integration tests for run progress polling
 *
 * Tests the runProgress and recentTasks fields on Run type.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import { getAuthHeader } from '../../test-utils.js';

// Mock PgBoss
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

describe('Run Progress Polling', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];

  afterEach(async () => {
    // Clean up runs first
    if (createdRunIds.length > 0) {
      await db.runScenarioSelection.deleteMany({
        where: { runId: { in: createdRunIds } },
      });
      await db.run.deleteMany({
        where: { id: { in: createdRunIds } },
      });
      createdRunIds.length = 0;
    }

    // Clean up definitions
    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
  });

  async function createTestRun(progress: { total: number; completed: number; failed: number }) {
    const definition = await db.definition.create({
      data: {
        name: 'Test Definition',
        content: { schema_version: 1, preamble: 'Test' },
      },
    });
    createdDefinitionIds.push(definition.id);

    const run = await db.run.create({
      data: {
        definitionId: definition.id,
        status: 'RUNNING',
        config: { models: ['gpt-4'] },
        progress,
        startedAt: new Date(),
      },
    });
    createdRunIds.push(run.id);

    return run;
  }

  describe('progress field (JSON)', () => {
    it('returns raw progress JSON for a run', async () => {
      const run = await createTestRun({ total: 30, completed: 10, failed: 2 });

      const query = `
        query GetRun($id: ID!) {
          run(id: $id) {
            id
            status
            progress
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { id: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const result = response.body.data.run;
      expect(result.progress).toEqual({
        total: 30,
        completed: 10,
        failed: 2,
      });
    });
  });

  describe('runProgress field (structured)', () => {
    it('returns structured progress with percentComplete', async () => {
      const run = await createTestRun({ total: 100, completed: 25, failed: 5 });

      const query = `
        query GetRunProgress($id: ID!) {
          run(id: $id) {
            id
            runProgress {
              total
              completed
              failed
              percentComplete
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { id: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const result = response.body.data.run;
      expect(result.runProgress.total).toBe(100);
      expect(result.runProgress.completed).toBe(25);
      expect(result.runProgress.failed).toBe(5);
      expect(result.runProgress.percentComplete).toBe(30); // (25+5)/100 = 30%
    });

    it('returns null for run without progress', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      const run = await db.run.create({
        data: {
          definitionId: definition.id,
          status: 'PENDING',
          config: { models: ['gpt-4'] },
          // No progress field
        },
      });
      createdRunIds.push(run.id);

      const query = `
        query GetRunProgress($id: ID!) {
          run(id: $id) {
            id
            runProgress {
              total
              completed
              failed
              percentComplete
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { id: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.runProgress).toBeNull();
    });

    it('calculates 100% when all jobs complete', async () => {
      const run = await createTestRun({ total: 10, completed: 10, failed: 0 });

      const query = `
        query GetRunProgress($id: ID!) {
          run(id: $id) {
            runProgress {
              percentComplete
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { id: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.run.runProgress.percentComplete).toBe(100);
    });

    it('includes failures in percentComplete calculation', async () => {
      const run = await createTestRun({ total: 10, completed: 3, failed: 2 });

      const query = `
        query GetRunProgress($id: ID!) {
          run(id: $id) {
            runProgress {
              percentComplete
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { id: run.id },
        });

      expect(response.status).toBe(200);
      // (3 completed + 2 failed) / 10 total = 50%
      expect(response.body.data.run.runProgress.percentComplete).toBe(50);
    });
  });

  describe('recentTasks field', () => {
    it('returns empty array when no PgBoss archive exists', async () => {
      const run = await createTestRun({ total: 10, completed: 5, failed: 0 });

      const query = `
        query GetRecentTasks($id: ID!) {
          run(id: $id) {
            id
            recentTasks {
              scenarioId
              modelId
              status
              error
              completedAt
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { id: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      // Returns empty array when PgBoss tables don't exist
      expect(response.body.data.run.recentTasks).toEqual([]);
    });

    it('accepts limit parameter', async () => {
      const run = await createTestRun({ total: 10, completed: 5, failed: 0 });

      const query = `
        query GetRecentTasks($id: ID!, $limit: Int) {
          run(id: $id) {
            recentTasks(limit: $limit) {
              scenarioId
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { id: run.id, limit: 3 },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      // Just verify query works with limit parameter
      expect(Array.isArray(response.body.data.run.recentTasks)).toBe(true);
    });
  });

  describe('polling scenario', () => {
    it('can poll for progress updates', async () => {
      const run = await createTestRun({ total: 10, completed: 0, failed: 0 });

      const query = `
        query PollProgress($id: ID!) {
          run(id: $id) {
            id
            status
            runProgress {
              total
              completed
              failed
              percentComplete
            }
          }
        }
      `;

      // Initial poll
      const response1 = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { id: run.id },
        });

      expect(response1.status).toBe(200);
      expect(response1.body.data.run.runProgress.completed).toBe(0);

      // Simulate progress update (direct DB update for test)
      await db.run.update({
        where: { id: run.id },
        data: {
          progress: { total: 10, completed: 5, failed: 1 },
        },
      });

      // Second poll
      const response2 = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { id: run.id },
        });

      expect(response2.status).toBe(200);
      expect(response2.body.data.run.runProgress.completed).toBe(5);
      expect(response2.body.data.run.runProgress.failed).toBe(1);
      expect(response2.body.data.run.runProgress.percentComplete).toBe(60);
    });
  });
});

describe('Run Progress byModel field [T024]', () => {
  const createdDefinitionIds: string[] = [];
  const createdScenarioIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdProbeResultIds: string[] = [];
  const createdTranscriptIds: string[] = [];

  afterEach(async () => {
    // Clean up in reverse dependency order
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

  async function createTestDefinition() {
    const definition = await db.definition.create({
      data: {
        name: 'byModel Test Definition ' + Date.now(),
        content: { schema_version: 1, preamble: 'Test' },
      },
    });
    createdDefinitionIds.push(definition.id);
    return definition;
  }

  async function createTestScenario(definitionId: string) {
    const scenario = await db.scenario.create({
      data: {
        definitionId,
        name: 'test-scenario-' + Date.now(),
        content: { schema_version: 1, prompt: 'Test', dimension_values: {} },
      },
    });
    createdScenarioIds.push(scenario.id);
    return scenario;
  }

  async function createTestRun(
    definitionId: string,
    options?: { progress?: object; summarizeProgress?: object; status?: string }
  ) {
    const run = await db.run.create({
      data: {
        definitionId,
        status: options?.status ?? 'RUNNING',
        config: { models: ['openai:gpt-4o', 'anthropic:claude-3'] },
        progress: options?.progress ?? { total: 10, completed: 5, failed: 0 },
        summarizeProgress: options?.summarizeProgress,
        startedAt: new Date(),
      },
    });
    createdRunIds.push(run.id);
    return run;
  }

  async function createProbeResult(
    runId: string,
    scenarioId: string,
    modelId: string,
    status: 'SUCCESS' | 'FAILED'
  ) {
    const result = await db.probeResult.create({
      data: {
        runId,
        scenarioId,
        modelId,
        status,
        errorCode: status === 'FAILED' ? 'TEST_ERROR' : null,
      },
    });
    createdProbeResultIds.push(result.id);
    return result;
  }

  async function createTranscript(
    runId: string,
    scenarioId: string,
    modelId: string,
    options?: { summarized?: boolean; failed?: boolean }
  ) {
    const transcript = await db.transcript.create({
      data: {
        runId,
        scenarioId,
        modelId,
        content: { schema_version: 1, messages: [], model_response: 'test' },
        turnCount: 1,
        tokenCount: 100,
        durationMs: 1000,
        summarizedAt: options?.summarized ? new Date() : null,
        decisionCode: options?.failed ? 'error' : options?.summarized ? '3' : null,
      },
    });
    createdTranscriptIds.push(transcript.id);
    return transcript;
  }

  describe('runProgress.byModel', () => {
    it('returns per-model breakdown from ProbeResults', async () => {
      const definition = await createTestDefinition();
      // Create multiple scenarios since ProbeResult has unique constraint on (run_id, scenario_id, model_id)
      const scenario1 = await createTestScenario(definition.id);
      const scenario2 = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id, {
        progress: { total: 4, completed: 3, failed: 1 },
      });

      // Create probe results for two models across different scenarios
      await createProbeResult(run.id, scenario1.id, 'openai:gpt-4o', 'SUCCESS');
      await createProbeResult(run.id, scenario2.id, 'openai:gpt-4o', 'SUCCESS');
      await createProbeResult(run.id, scenario1.id, 'anthropic:claude-3', 'SUCCESS');
      await createProbeResult(run.id, scenario2.id, 'anthropic:claude-3', 'FAILED');

      const query = `
        query GetRunProgressByModel($id: ID!) {
          run(id: $id) {
            runProgress {
              total
              completed
              failed
              byModel {
                modelId
                completed
                failed
              }
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: run.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const { runProgress } = response.body.data.run;
      expect(runProgress.byModel).toHaveLength(2);

      const gptModel = runProgress.byModel.find((m: { modelId: string }) => m.modelId === 'openai:gpt-4o');
      const claudeModel = runProgress.byModel.find((m: { modelId: string }) => m.modelId === 'anthropic:claude-3');

      expect(gptModel).toEqual({ modelId: 'openai:gpt-4o', completed: 2, failed: 0 });
      expect(claudeModel).toEqual({ modelId: 'anthropic:claude-3', completed: 1, failed: 1 });
    });

    it('returns null byModel when no ProbeResults exist', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const query = `
        query GetRunProgressByModel($id: ID!) {
          run(id: $id) {
            runProgress {
              total
              completed
              byModel {
                modelId
              }
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: run.id } });

      expect(response.status).toBe(200);
      expect(response.body.data.run.runProgress.byModel).toBeNull();
    });
  });

  describe('summarizeProgress.byModel', () => {
    it('returns per-model breakdown from Transcripts', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id, {
        status: 'SUMMARIZING',
        summarizeProgress: { total: 4, completed: 3, failed: 1 },
      });

      // Create transcripts for two models
      await createTranscript(run.id, scenario.id, 'openai:gpt-4o', { summarized: true });
      await createTranscript(run.id, scenario.id, 'openai:gpt-4o', { summarized: true });
      await createTranscript(run.id, scenario.id, 'anthropic:claude-3', { summarized: true });
      await createTranscript(run.id, scenario.id, 'anthropic:claude-3', { failed: true });

      const query = `
        query GetSummarizeProgressByModel($id: ID!) {
          run(id: $id) {
            summarizeProgress {
              total
              completed
              failed
              byModel {
                modelId
                completed
                failed
              }
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: run.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const { summarizeProgress } = response.body.data.run;
      expect(summarizeProgress.byModel).toHaveLength(2);

      const gptModel = summarizeProgress.byModel.find((m: { modelId: string }) => m.modelId === 'openai:gpt-4o');
      const claudeModel = summarizeProgress.byModel.find((m: { modelId: string }) => m.modelId === 'anthropic:claude-3');

      expect(gptModel).toEqual({ modelId: 'openai:gpt-4o', completed: 2, failed: 0 });
      expect(claudeModel).toEqual({ modelId: 'anthropic:claude-3', completed: 1, failed: 1 });
    });

    it('returns null summarizeProgress when not in SUMMARIZING state', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id, { status: 'RUNNING' });

      const query = `
        query GetSummarizeProgressByModel($id: ID!) {
          run(id: $id) {
            summarizeProgress {
              total
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: run.id } });

      expect(response.status).toBe(200);
      expect(response.body.data.run.summarizeProgress).toBeNull();
    });

    it('returns null byModel when no Transcripts exist', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id, {
        status: 'SUMMARIZING',
        summarizeProgress: { total: 10, completed: 0, failed: 0 },
      });

      const query = `
        query GetSummarizeProgressByModel($id: ID!) {
          run(id: $id) {
            summarizeProgress {
              total
              byModel {
                modelId
              }
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: run.id } });

      expect(response.status).toBe(200);
      expect(response.body.data.run.summarizeProgress.byModel).toBeNull();
    });
  });
});
