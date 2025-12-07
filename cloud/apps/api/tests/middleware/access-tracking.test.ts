/**
 * Tests for access tracking middleware
 *
 * Tests lastAccessedAt updates when entities are viewed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { getAuthHeader } from '../test-utils.js';
import { db } from '@valuerank/db';

// Mock PgBoss
vi.mock('../../src/queue/boss.js', () => ({
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

describe('Access Tracking', () => {
  let testDefinitionId: string | undefined;
  let testRunId: string | undefined;

  beforeEach(async () => {
    // Create test definition
    const definition = await db.definition.create({
      data: {
        name: 'Test Definition for Access Tracking',
        content: { test: true },
      },
    });
    testDefinitionId = definition.id;

    // Create test run with null lastAccessedAt
    const run = await db.run.create({
      data: {
        definitionId: testDefinitionId,
        status: 'COMPLETED',
        config: { models: ['test-model'] },
        progress: { total: 1, completed: 1, failed: 0 },
        lastAccessedAt: null, // Start with null
      },
    });
    testRunId = run.id;
  });

  afterEach(async () => {
    if (testRunId) {
      await db.run.delete({ where: { id: testRunId } });
    }
    if (testDefinitionId) {
      await db.definition.delete({ where: { id: testDefinitionId } });
    }
  });

  describe('Run Access Tracking', () => {
    const runQuery = `
      query GetRun($id: ID!) {
        run(id: $id) {
          id
          status
          lastAccessedAt
        }
      }
    `;

    it('updates lastAccessedAt when run is queried', async () => {
      // Verify initial state
      const initialRun = await db.run.findUnique({
        where: { id: testRunId },
        select: { lastAccessedAt: true },
      });
      expect(initialRun?.lastAccessedAt).toBeNull();

      // Query the run
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: runQuery,
          variables: { id: testRunId },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run).not.toBeNull();

      // Wait a bit for async update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify lastAccessedAt was updated
      const updatedRun = await db.run.findUnique({
        where: { id: testRunId },
        select: { lastAccessedAt: true },
      });
      expect(updatedRun?.lastAccessedAt).not.toBeNull();
    });

    it('does not throw errors when run not found', async () => {
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: runQuery,
          variables: { id: 'non-existent-id' },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run).toBeNull();
    });

    it('updates lastAccessedAt to recent timestamp', async () => {
      const beforeQuery = new Date();

      // Query the run
      await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: runQuery,
          variables: { id: testRunId },
        });

      // Wait for async update
      await new Promise((resolve) => setTimeout(resolve, 100));

      const afterQuery = new Date();

      // Verify timestamp is within the query window
      const updatedRun = await db.run.findUnique({
        where: { id: testRunId },
        select: { lastAccessedAt: true },
      });

      expect(updatedRun?.lastAccessedAt).not.toBeNull();
      const accessTime = updatedRun!.lastAccessedAt!.getTime();
      expect(accessTime).toBeGreaterThanOrEqual(beforeQuery.getTime() - 1000);
      expect(accessTime).toBeLessThanOrEqual(afterQuery.getTime() + 1000);
    });
  });

  describe('Access Tracking Functions', () => {
    it('trackRunAccess updates lastAccessedAt', async () => {
      const { trackRunAccess } = await import('../../src/middleware/access-tracking.js');

      // Verify initial state
      const initialRun = await db.run.findUnique({
        where: { id: testRunId },
        select: { lastAccessedAt: true },
      });
      expect(initialRun?.lastAccessedAt).toBeNull();

      // Track access
      trackRunAccess(testRunId!);

      // Wait for async update
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify update
      const updatedRun = await db.run.findUnique({
        where: { id: testRunId },
        select: { lastAccessedAt: true },
      });
      expect(updatedRun?.lastAccessedAt).not.toBeNull();
    });

    it('trackRunAccess does not throw for invalid id', async () => {
      const { trackRunAccess } = await import('../../src/middleware/access-tracking.js');

      // Should not throw, just log warning
      expect(() => {
        trackRunAccess('invalid-id-that-does-not-exist');
      }).not.toThrow();

      // Wait to ensure promise settles
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('trackDefinitionAccess updates lastAccessedAt', async () => {
      const { trackDefinitionAccess } = await import(
        '../../src/middleware/access-tracking.js'
      );

      // Verify initial state
      const initialDef = await db.definition.findUnique({
        where: { id: testDefinitionId },
        select: { lastAccessedAt: true },
      });
      expect(initialDef?.lastAccessedAt).toBeNull();

      // Track access
      trackDefinitionAccess(testDefinitionId!);

      // Wait for async update
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify update
      const updatedDef = await db.definition.findUnique({
        where: { id: testDefinitionId },
        select: { lastAccessedAt: true },
      });
      expect(updatedDef?.lastAccessedAt).not.toBeNull();
    });
  });
});
