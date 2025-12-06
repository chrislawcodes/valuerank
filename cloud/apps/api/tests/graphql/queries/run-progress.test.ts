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
