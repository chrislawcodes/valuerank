/**
 * Unit tests for job queue service
 *
 * Tests job queue status queries for runs - counts by job type and state.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { db } from '@valuerank/db';
import { NotFoundError } from '@valuerank/shared';
import { getJobQueueStatus } from '../../../src/services/run/job-queue.js';
import type { JobQueueStatus, JobTypeCounts, JobFailure } from '../../../src/services/run/types.js';

describe('job queue service', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up in reverse order of creation
    if (createdRunIds.length > 0) {
      await db.run.deleteMany({
        where: { id: { in: createdRunIds } },
      });
      createdRunIds.length = 0;
    }

    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
  });

  async function createTestDefinition() {
    const definition = await db.definition.create({
      data: {
        name: 'Test Job Queue Definition ' + Date.now(),
        content: {
          schema_version: 2,
          preamble: 'Test preamble',
          template: 'Test template with [variable]',
          dimensions: [{ name: 'variable', levels: [{ score: 1, label: 'test' }] }],
        },
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
        config: { models: ['openai:gpt-4o'] },
        progress: { total: 10, completed: 0, failed: 0 },
      },
    });
    createdRunIds.push(run.id);
    return run;
  }

  describe('getJobQueueStatus', () => {
    it('returns status with zero counts for run with no jobs', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const status = await getJobQueueStatus(run.id);

      expect(status.runId).toBe(run.id);
      expect(status.totalPending).toBe(0);
      expect(status.totalRunning).toBe(0);
      expect(status.totalCompleted).toBe(0);
      expect(status.totalFailed).toBe(0);
    });

    it('throws NotFoundError for non-existent run', async () => {
      await expect(getJobQueueStatus('non-existent-run-id')).rejects.toThrow(NotFoundError);
    });

    it('returns status with correct structure', async () => {
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

      // Even if empty, it should be an array
      expect(Array.isArray(status.recentFailures)).toBe(true);
    });

    it('respects failureLimit option', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      // With custom failure limit
      const status = await getJobQueueStatus(run.id, {
        includeRecentFailures: true,
        failureLimit: 5,
      });

      expect(Array.isArray(status.recentFailures)).toBe(true);
      // Length should not exceed limit
      expect((status.recentFailures || []).length).toBeLessThanOrEqual(5);
    });
  });

  describe('JobQueueStatus type', () => {
    it('allows byJobType to have optional fields', () => {
      const status: JobQueueStatus = {
        runId: 'test-run-id',
        byJobType: {
          probe_scenario: { pending: 5, running: 2, completed: 10, failed: 1 },
          // summarize_transcript omitted
          // analyze_basic omitted
        },
        totalPending: 5,
        totalRunning: 2,
        totalCompleted: 10,
        totalFailed: 1,
      };

      expect(status.byJobType.probe_scenario?.pending).toBe(5);
      expect(status.byJobType.summarize_transcript).toBeUndefined();
    });

    it('allows recentFailures to be undefined or array', () => {
      const statusWithoutFailures: JobQueueStatus = {
        runId: 'test-run-id',
        byJobType: {},
        totalPending: 0,
        totalRunning: 0,
        totalCompleted: 0,
        totalFailed: 0,
      };

      const statusWithFailures: JobQueueStatus = {
        runId: 'test-run-id',
        byJobType: {},
        totalPending: 0,
        totalRunning: 0,
        totalCompleted: 0,
        totalFailed: 1,
        recentFailures: [
          {
            jobId: 'job-1',
            jobType: 'probe_scenario',
            error: 'Test error',
            failedAt: '2025-01-01T00:00:00Z',
          },
        ],
      };

      expect(statusWithoutFailures.recentFailures).toBeUndefined();
      expect(statusWithFailures.recentFailures).toHaveLength(1);
    });
  });

  describe('JobTypeCounts type', () => {
    it('contains all required fields', () => {
      const counts: JobTypeCounts = {
        pending: 5,
        running: 2,
        completed: 10,
        failed: 1,
      };

      expect(counts.pending).toBe(5);
      expect(counts.running).toBe(2);
      expect(counts.completed).toBe(10);
      expect(counts.failed).toBe(1);
    });
  });

  describe('JobFailure type', () => {
    it('has required fields', () => {
      const failure: JobFailure = {
        jobId: 'job-123',
        jobType: 'probe_scenario',
        error: 'Connection timeout',
        failedAt: '2025-01-01T12:00:00Z',
      };

      expect(failure.jobId).toBe('job-123');
      expect(failure.jobType).toBe('probe_scenario');
      expect(failure.error).toBe('Connection timeout');
      expect(failure.failedAt).toBeDefined();
    });

    it('allows optional context fields', () => {
      const failure: JobFailure = {
        jobId: 'job-456',
        jobType: 'probe_scenario',
        error: 'API rate limit',
        failedAt: '2025-01-01T12:00:00Z',
        transcriptId: 'transcript-1',
        scenarioId: 'scenario-1',
        modelId: 'openai:gpt-4o',
      };

      expect(failure.transcriptId).toBe('transcript-1');
      expect(failure.scenarioId).toBe('scenario-1');
      expect(failure.modelId).toBe('openai:gpt-4o');
    });
  });
});
