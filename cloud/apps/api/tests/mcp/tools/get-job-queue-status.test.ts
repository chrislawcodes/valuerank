/**
 * get_job_queue_status MCP Tool Tests [T018]
 *
 * Tests for the job queue status MCP tool.
 * Service layer tests are in tests/services/run/job-queue.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import { NotFoundError } from '@valuerank/shared';
import { getJobQueueStatus } from '../../../src/services/run/job-queue.js';
import type { JobQueueStatus } from '../../../src/services/run/types.js';

describe('get_job_queue_status MCP Tool [T018]', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.run.deleteMany({ where: { id: { in: createdRunIds } } });
    createdRunIds.length = 0;

    await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
    createdDefinitionIds.length = 0;
  });

  async function createTestDefinition() {
    const definition = await db.definition.create({
      data: {
        name: 'MCP Job Queue Test ' + Date.now(),
        content: { schema_version: 1, preamble: 'Test' },
      },
    });
    createdDefinitionIds.push(definition.id);
    return definition;
  }

  async function createTestRun(definitionId: string, status = 'RUNNING') {
    const run = await db.run.create({
      data: {
        definitionId,
        status,
        startedAt: new Date(),
        config: { models: ['openai:gpt-4o'] },
        progress: { total: 10, completed: 0, failed: 0 },
      },
    });
    createdRunIds.push(run.id);
    return run;
  }

  describe('input validation', () => {
    it('requires run_id parameter', async () => {
      // The getJobQueueStatus function requires runId
      await expect(getJobQueueStatus('')).rejects.toThrow();
    });

    it('returns NOT_FOUND for non-existent run', async () => {
      await expect(getJobQueueStatus('non-existent-run-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('response structure', () => {
    it('returns JobQueueStatus with all required fields', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const status = await getJobQueueStatus(run.id);

      expect(status).toHaveProperty('runId');
      expect(status).toHaveProperty('byJobType');
      expect(status).toHaveProperty('totalPending');
      expect(status).toHaveProperty('totalRunning');
      expect(status).toHaveProperty('totalCompleted');
      expect(status).toHaveProperty('totalFailed');
    });

    it('returns zero counts for run with no jobs', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const status = await getJobQueueStatus(run.id);

      expect(status.totalPending).toBe(0);
      expect(status.totalRunning).toBe(0);
      expect(status.totalCompleted).toBe(0);
      expect(status.totalFailed).toBe(0);
    });

    it('byJobType is an object (can be empty)', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const status = await getJobQueueStatus(run.id);

      expect(typeof status.byJobType).toBe('object');
    });
  });

  describe('include_recent_failures option', () => {
    it('does not include recentFailures by default', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const status = await getJobQueueStatus(run.id);

      expect(status.recentFailures).toBeUndefined();
    });

    it('includes recentFailures when requested', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const status = await getJobQueueStatus(run.id, { includeRecentFailures: true });

      // Even if empty, should be an array when requested
      expect(Array.isArray(status.recentFailures)).toBe(true);
    });

    it('respects failureLimit option', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const status = await getJobQueueStatus(run.id, {
        includeRecentFailures: true,
        failureLimit: 5,
      });

      expect(Array.isArray(status.recentFailures)).toBe(true);
      expect((status.recentFailures || []).length).toBeLessThanOrEqual(5);
    });
  });

  describe('JobQueueStatus type', () => {
    it('has correct byJobType structure', () => {
      const status: JobQueueStatus = {
        runId: 'test-run',
        byJobType: {
          probe_scenario: { pending: 5, running: 2, completed: 10, failed: 1 },
          summarize_transcript: { pending: 0, running: 1, completed: 8, failed: 0 },
        },
        totalPending: 5,
        totalRunning: 3,
        totalCompleted: 18,
        totalFailed: 1,
      };

      expect(status.byJobType.probe_scenario?.pending).toBe(5);
      expect(status.byJobType.summarize_transcript?.running).toBe(1);
    });

    it('allows recentFailures to be undefined or array', () => {
      const statusWithoutFailures: JobQueueStatus = {
        runId: 'test-run',
        byJobType: {},
        totalPending: 0,
        totalRunning: 0,
        totalCompleted: 0,
        totalFailed: 0,
      };

      const statusWithFailures: JobQueueStatus = {
        runId: 'test-run',
        byJobType: {},
        totalPending: 0,
        totalRunning: 0,
        totalCompleted: 0,
        totalFailed: 1,
        recentFailures: [
          {
            jobId: 'job-1',
            jobType: 'probe_scenario',
            error: 'Connection timeout',
            failedAt: '2025-01-01T00:00:00Z',
            modelId: 'openai:gpt-4o',
          },
        ],
      };

      expect(statusWithoutFailures.recentFailures).toBeUndefined();
      expect(statusWithFailures.recentFailures).toHaveLength(1);
    });
  });

  describe('different run states', () => {
    it('returns status for RUNNING run', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id, 'RUNNING');

      const status = await getJobQueueStatus(run.id);

      expect(status.runId).toBe(run.id);
    });

    it('returns status for SUMMARIZING run', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id, 'SUMMARIZING');

      const status = await getJobQueueStatus(run.id);

      expect(status.runId).toBe(run.id);
    });

    it('returns status for COMPLETED run', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id, 'COMPLETED');

      const status = await getJobQueueStatus(run.id);

      expect(status.runId).toBe(run.id);
    });
  });
});
