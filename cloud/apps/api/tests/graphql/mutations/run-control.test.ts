/**
 * Integration tests for run control mutations
 *
 * Tests pauseRun, resumeRun, and cancelRun mutations.
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

describe('Run Control Mutations', () => {
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

  async function createTestRun(status: string) {
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
        status,
        config: { models: ['gpt-4'] },
        progress: { total: 10, completed: 0, failed: 0 },
      },
    });
    createdRunIds.push(run.id);

    return run;
  }

  describe('pauseRun mutation', () => {
    const pauseMutation = `
      mutation PauseRun($runId: ID!) {
        pauseRun(runId: $runId) {
          id
          status
        }
      }
    `;

    it('pauses a RUNNING run', async () => {
      const run = await createTestRun('RUNNING');

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: pauseMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.pauseRun.status).toBe('PAUSED');
    });

    it('requires authentication', async () => {
      const run = await createTestRun('RUNNING');

      const response = await request(app)
        .post('/graphql')
        .send({
          query: pauseMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(401);
    });

    it('returns error for invalid state', async () => {
      const run = await createTestRun('COMPLETED');

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: pauseMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Cannot pause');
    });

    it('returns error for non-existent run', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: pauseMutation,
          variables: { runId: 'non-existent-id' },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });
  });

  describe('resumeRun mutation', () => {
    const resumeMutation = `
      mutation ResumeRun($runId: ID!) {
        resumeRun(runId: $runId) {
          id
          status
        }
      }
    `;

    it('resumes a PAUSED run', async () => {
      const run = await createTestRun('PAUSED');

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: resumeMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.resumeRun.status).toBe('RUNNING');
    });

    it('requires authentication', async () => {
      const run = await createTestRun('PAUSED');

      const response = await request(app)
        .post('/graphql')
        .send({
          query: resumeMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(401);
    });

    it('returns error for invalid state', async () => {
      const run = await createTestRun('RUNNING');

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: resumeMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Cannot resume');
    });
  });

  describe('cancelRun mutation', () => {
    const cancelMutation = `
      mutation CancelRun($runId: ID!) {
        cancelRun(runId: $runId) {
          id
          status
        }
      }
    `;

    it('cancels a RUNNING run', async () => {
      const run = await createTestRun('RUNNING');

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: cancelMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.cancelRun.status).toBe('CANCELLED');
    });

    it('cancels a PAUSED run', async () => {
      const run = await createTestRun('PAUSED');

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: cancelMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.cancelRun.status).toBe('CANCELLED');
    });

    it('requires authentication', async () => {
      const run = await createTestRun('RUNNING');

      const response = await request(app)
        .post('/graphql')
        .send({
          query: cancelMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(401);
    });

    it('returns error for COMPLETED run', async () => {
      const run = await createTestRun('COMPLETED');

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: cancelMutation,
          variables: { runId: run.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Cannot cancel');
    });
  });

  describe('state transition via mutations', () => {
    it('pause -> resume -> cancel', async () => {
      const run = await createTestRun('RUNNING');

      // Pause
      let response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: `
            mutation PauseRun($runId: ID!) {
              pauseRun(runId: $runId) {
                id
                status
              }
            }
          `,
          variables: { runId: run.id },
        });

      expect(response.body.data.pauseRun.status).toBe('PAUSED');

      // Resume
      response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: `
            mutation ResumeRun($runId: ID!) {
              resumeRun(runId: $runId) {
                id
                status
              }
            }
          `,
          variables: { runId: run.id },
        });

      expect(response.body.data.resumeRun.status).toBe('RUNNING');

      // Cancel
      response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: `
            mutation CancelRun($runId: ID!) {
              cancelRun(runId: $runId) {
                id
                status
              }
            }
          `,
          variables: { runId: run.id },
        });

      expect(response.body.data.cancelRun.status).toBe('CANCELLED');
    });
  });
});
