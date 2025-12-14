/**
 * Integration tests for summarization control mutations
 *
 * Tests cancelSummarization and restartSummarization mutations.
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

describe('Summarization Control Mutations', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdScenarioIds: string[] = [];

  afterEach(async () => {
    // Clean up in order: transcripts -> runs -> scenarios -> definitions
    for (const runId of createdRunIds) {
      await db.transcript.deleteMany({ where: { runId } });
      await db.runScenarioSelection.deleteMany({ where: { runId } });
    }
    await db.run.deleteMany({ where: { id: { in: createdRunIds } } });
    createdRunIds.length = 0;

    await db.scenario.deleteMany({ where: { id: { in: createdScenarioIds } } });
    createdScenarioIds.length = 0;

    await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
    createdDefinitionIds.length = 0;
  });

  async function createTestRun(options: {
    status: string;
    summarizeProgress?: { total: number; completed: number; failed: number };
    transcriptCount?: number;
    summarizedCount?: number;
  }) {
    const definition = await db.definition.create({
      data: {
        name: 'Test Definition ' + Date.now(),
        content: { schema_version: 1, preamble: 'Test' },
      },
    });
    createdDefinitionIds.push(definition.id);

    const scenario = await db.scenario.create({
      data: {
        definitionId: definition.id,
        name: 'test-scenario-' + Date.now(),
        content: { schema_version: 1, prompt: 'Test', dimension_values: {} },
      },
    });
    createdScenarioIds.push(scenario.id);

    const run = await db.run.create({
      data: {
        definitionId: definition.id,
        status: options.status,
        startedAt: new Date(),
        completedAt: options.status === 'COMPLETED' ? new Date() : null,
        config: { models: ['gpt-4'] },
        progress: { total: options.transcriptCount ?? 3, completed: options.transcriptCount ?? 3, failed: 0 },
        summarizeProgress: options.summarizeProgress ?? null,
      },
    });
    createdRunIds.push(run.id);

    // Create transcripts if requested
    const transcriptCount = options.transcriptCount ?? 0;
    const summarizedCount = options.summarizedCount ?? 0;

    for (let i = 0; i < transcriptCount; i++) {
      await db.transcript.create({
        data: {
          runId: run.id,
          scenarioId: scenario.id,
          modelId: 'openai:gpt-4',
          content: { schema_version: 1, messages: [], model_response: 'test' },
          turnCount: 1,
          tokenCount: 100,
          durationMs: 1000,
          summarizedAt: i < summarizedCount ? new Date() : null,
          decisionCode: i < summarizedCount ? '3' : null,
        },
      });
    }

    return { run, definition, scenario };
  }

  describe('cancelSummarization mutation', () => {
    const cancelMutation = `
      mutation CancelSummarization($runId: ID!) {
        cancelSummarization(runId: $runId) {
          run {
            id
            status
          }
          cancelledCount
        }
      }
    `;

    it('cancels summarization for SUMMARIZING run', async () => {
      const { run } = await createTestRun({
        status: 'SUMMARIZING',
        summarizeProgress: { total: 5, completed: 2, failed: 0 },
        transcriptCount: 5,
        summarizedCount: 2,
      });

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: cancelMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.cancelSummarization.run.status).toBe('COMPLETED');
      expect(response.body.data.cancelSummarization.cancelledCount).toBeTypeOf('number');
    });

    it('requires authentication', async () => {
      const { run } = await createTestRun({
        status: 'SUMMARIZING',
      });

      const response = await request(app)
        .post('/graphql')
        .send({
          query: cancelMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(401);
    });

    it('returns error for non-SUMMARIZING run', async () => {
      const { run } = await createTestRun({
        status: 'RUNNING',
      });

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: cancelMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Cannot cancel summarization');
    });

    it('returns error for non-existent run', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: cancelMutation,
          variables: { runId: 'non-existent-id' },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });
  });

  describe('restartSummarization mutation', () => {
    const restartMutation = `
      mutation RestartSummarization($runId: ID!, $force: Boolean) {
        restartSummarization(runId: $runId, force: $force) {
          run {
            id
            status
          }
          queuedCount
        }
      }
    `;

    it('restarts summarization for COMPLETED run', async () => {
      const { run } = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 3,
        summarizedCount: 1,
      });

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: restartMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.restartSummarization.run.status).toBe('SUMMARIZING');
      expect(response.body.data.restartSummarization.queuedCount).toBe(2);
    });

    it('restarts summarization for FAILED run', async () => {
      const { run } = await createTestRun({
        status: 'FAILED',
        transcriptCount: 2,
        summarizedCount: 0,
      });

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: restartMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.restartSummarization.run.status).toBe('SUMMARIZING');
      expect(response.body.data.restartSummarization.queuedCount).toBe(2);
    });

    it('restarts summarization for CANCELLED run', async () => {
      const { run } = await createTestRun({
        status: 'CANCELLED',
        transcriptCount: 2,
        summarizedCount: 1,
      });

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: restartMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.restartSummarization.run.status).toBe('SUMMARIZING');
      expect(response.body.data.restartSummarization.queuedCount).toBe(1);
    });

    it('force mode re-queues all transcripts', async () => {
      const { run } = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 3,
        summarizedCount: 3,
      });

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: restartMutation,
          variables: { runId: run.id, force: true },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.restartSummarization.queuedCount).toBe(3);
    });

    it('requires authentication', async () => {
      const { run } = await createTestRun({
        status: 'COMPLETED',
      });

      const response = await request(app)
        .post('/graphql')
        .send({
          query: restartMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(401);
    });

    it('returns error for RUNNING run', async () => {
      const { run } = await createTestRun({
        status: 'RUNNING',
      });

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: restartMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Cannot restart summarization');
    });

    it('returns error for SUMMARIZING run', async () => {
      const { run } = await createTestRun({
        status: 'SUMMARIZING',
      });

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: restartMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Cannot restart summarization');
    });

    it('returns error for non-existent run', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: restartMutation,
          variables: { runId: 'non-existent-id' },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });

    it('returns 0 when no transcripts need summarization (without force)', async () => {
      const { run } = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 2,
        summarizedCount: 2,
      });

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: restartMutation,
          variables: { runId: run.id, force: false },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.restartSummarization.queuedCount).toBe(0);
      expect(response.body.data.restartSummarization.run.status).toBe('COMPLETED');
    });
  });

  describe('cancel then restart workflow', () => {
    it('can cancel then restart summarization', async () => {
      // Create a run in SUMMARIZING state
      const { run } = await createTestRun({
        status: 'SUMMARIZING',
        summarizeProgress: { total: 3, completed: 1, failed: 0 },
        transcriptCount: 3,
        summarizedCount: 1,
      });

      // Cancel summarization
      let response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: `
            mutation CancelSummarization($runId: ID!) {
              cancelSummarization(runId: $runId) {
                run { id status }
                cancelledCount
              }
            }
          `,
          variables: { runId: run.id },
        });

      expect(response.body.data.cancelSummarization.run.status).toBe('COMPLETED');

      // Now restart summarization
      response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: `
            mutation RestartSummarization($runId: ID!) {
              restartSummarization(runId: $runId) {
                run { id status }
                queuedCount
              }
            }
          `,
          variables: { runId: run.id },
        });

      expect(response.body.data.restartSummarization.run.status).toBe('SUMMARIZING');
      // Should queue 2 (unsummarized)
      expect(response.body.data.restartSummarization.queuedCount).toBe(2);
    });
  });
});
