/**
 * Integration tests for queue control mutations
 *
 * Tests pauseQueue and resumeQueue mutations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
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
  isBossRunning: vi.fn().mockReturnValue(true),
}));

const app = createServer();

describe('Queue Control Mutations', () => {
  describe('pauseQueue mutation', () => {
    const pauseMutation = `
      mutation PauseQueue {
        pauseQueue {
          isRunning
          isPaused
          totals {
            pending
            active
          }
        }
      }
    `;

    it('pauses the queue and returns status', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: pauseMutation });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const status = response.body.data.pauseQueue;
      expect(status.isPaused).toBe(true);
    });

    it('requires authentication', async () => {
      const response = await request(app)
        .post('/graphql')
        .send({ query: pauseMutation });

      expect(response.status).toBe(401);
    });

    it('is idempotent - can pause when already paused', async () => {
      // First pause
      await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: pauseMutation });

      // Second pause should succeed
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: pauseMutation });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.pauseQueue.isPaused).toBe(true);
    });
  });

  describe('resumeQueue mutation', () => {
    const resumeMutation = `
      mutation ResumeQueue {
        resumeQueue {
          isRunning
          isPaused
          totals {
            pending
            active
          }
        }
      }
    `;

    it('resumes the queue and returns status', async () => {
      // First pause
      await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: `mutation { pauseQueue { isPaused } }`,
        });

      // Then resume
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: resumeMutation });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const status = response.body.data.resumeQueue;
      expect(status.isPaused).toBe(false);
    });

    it('requires authentication', async () => {
      const response = await request(app)
        .post('/graphql')
        .send({ query: resumeMutation });

      expect(response.status).toBe(401);
    });

    it('is idempotent - can resume when not paused', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: resumeMutation });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.resumeQueue.isPaused).toBe(false);
    });
  });

  describe('pause/resume cycle', () => {
    it('can pause and resume in sequence', async () => {
      // Pause
      let response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: `mutation { pauseQueue { isPaused } }` });

      expect(response.body.data.pauseQueue.isPaused).toBe(true);

      // Resume
      response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: `mutation { resumeQueue { isPaused } }` });

      expect(response.body.data.resumeQueue.isPaused).toBe(false);

      // Pause again
      response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: `mutation { pauseQueue { isPaused } }` });

      expect(response.body.data.pauseQueue.isPaused).toBe(true);
    });
  });
});
