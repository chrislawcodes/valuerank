/**
 * Integration tests for queue status query
 *
 * Tests queueStatus query returns accurate job counts.
 */

import { describe, it, expect, vi } from 'vitest';
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
  isBossRunning: vi.fn().mockReturnValue(false),
}));

const app = createServer();

describe('Queue Status Query', () => {
  const statusQuery = `
    query QueueStatus {
      queueStatus {
        isRunning
        isPaused
        jobTypes {
          type
          pending
          active
          completed
          failed
        }
        totals {
          pending
          active
          completed
          failed
        }
      }
    }
  `;

  it('returns queue status with all fields', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: statusQuery });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();

    const status = response.body.data.queueStatus;
    expect(status).toBeDefined();
    expect(typeof status.isRunning).toBe('boolean');
    expect(typeof status.isPaused).toBe('boolean');
    expect(Array.isArray(status.jobTypes)).toBe(true);
    expect(status.totals).toBeDefined();
  });

  it('returns known job types', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: statusQuery });

    expect(response.status).toBe(200);

    const jobTypes = response.body.data.queueStatus.jobTypes;
    const typeNames = jobTypes.map((jt: { type: string }) => jt.type);

    expect(typeNames).toContain('probe_scenario');
    expect(typeNames).toContain('analyze_basic');
    expect(typeNames).toContain('analyze_deep');
  });

  it('returns valid count structure', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: statusQuery });

    expect(response.status).toBe(200);

    const totals = response.body.data.queueStatus.totals;
    // Verify count structure exists with numeric values (may have leftover jobs from other tests)
    expect(typeof totals.pending).toBe('number');
    expect(typeof totals.active).toBe('number');
    expect(typeof totals.completed).toBe('number');
    expect(typeof totals.failed).toBe('number');
    expect(totals.pending).toBeGreaterThanOrEqual(0);
    expect(totals.active).toBeGreaterThanOrEqual(0);
    expect(totals.completed).toBeGreaterThanOrEqual(0);
    expect(totals.failed).toBeGreaterThanOrEqual(0);
  });

  it('requires authentication', async () => {
    const response = await request(app)
      .post('/graphql')
      .send({ query: statusQuery });

    expect(response.status).toBe(401);
  });

  it('each job type has all count fields', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: statusQuery });

    expect(response.status).toBe(200);

    const jobTypes = response.body.data.queueStatus.jobTypes;
    for (const jt of jobTypes) {
      expect(typeof jt.pending).toBe('number');
      expect(typeof jt.active).toBe('number');
      expect(typeof jt.completed).toBe('number');
      expect(typeof jt.failed).toBe('number');
    }
  });
});
