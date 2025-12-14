/**
 * Unit tests for progress service
 *
 * Tests atomic progress updates and status transitions.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';

// Mock PgBoss for SUMMARIZING transition (which queues summarize jobs)
const mockSend = vi.fn().mockResolvedValue('mock-job-id');
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: mockSend,
  })),
}));
import {
  updateProgress,
  incrementCompleted,
  incrementFailed,
  getProgress,
  calculatePercentComplete,
} from '../../../src/services/run/progress.js';
import { NotFoundError } from '@valuerank/shared';

describe('progress service', () => {
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
        status: 'PENDING',
        config: { models: ['gpt-4'] },
        progress,
      },
    });
    createdRunIds.push(run.id);

    return run;
  }

  describe('updateProgress', () => {
    it('increments completed count atomically', async () => {
      const run = await createTestRun({ total: 10, completed: 0, failed: 0 });

      const result = await updateProgress(run.id, { incrementCompleted: 1 });

      expect(result.progress.completed).toBe(1);
      expect(result.progress.total).toBe(10);
      expect(result.progress.failed).toBe(0);
    });

    it('increments failed count atomically', async () => {
      const run = await createTestRun({ total: 10, completed: 5, failed: 0 });

      const result = await updateProgress(run.id, { incrementFailed: 1 });

      expect(result.progress.failed).toBe(1);
      expect(result.progress.completed).toBe(5);
    });

    it('increments both completed and failed at once', async () => {
      const run = await createTestRun({ total: 10, completed: 0, failed: 0 });

      const result = await updateProgress(run.id, {
        incrementCompleted: 3,
        incrementFailed: 2,
      });

      expect(result.progress.completed).toBe(3);
      expect(result.progress.failed).toBe(2);
    });

    it('throws NotFoundError for non-existent run', async () => {
      await expect(
        updateProgress('non-existent-run-id', { incrementCompleted: 1 })
      ).rejects.toThrow(NotFoundError);
    });

    it('returns current state for no-op update', async () => {
      const run = await createTestRun({ total: 10, completed: 5, failed: 2 });

      const result = await updateProgress(run.id, {});

      expect(result.progress.completed).toBe(5);
      expect(result.progress.failed).toBe(2);
      expect(result.status).toBe('PENDING');
    });
  });

  describe('status transitions', () => {
    it('transitions PENDING to RUNNING when first job completes', async () => {
      const run = await createTestRun({ total: 10, completed: 0, failed: 0 });

      const result = await incrementCompleted(run.id);

      expect(result.status).toBe('RUNNING');

      // Verify startedAt was set
      const dbRun = await db.run.findUnique({ where: { id: run.id } });
      expect(dbRun?.startedAt).not.toBeNull();
    });

    it('transitions PENDING to RUNNING when first job fails', async () => {
      const run = await createTestRun({ total: 10, completed: 0, failed: 0 });

      const result = await incrementFailed(run.id);

      expect(result.status).toBe('RUNNING');
    });

    it('transitions RUNNING to SUMMARIZING when all jobs done', async () => {
      const run = await createTestRun({ total: 3, completed: 2, failed: 0 });
      // Update to RUNNING first
      await db.run.update({
        where: { id: run.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      const result = await incrementCompleted(run.id);

      // Should transition to SUMMARIZING, not COMPLETED
      expect(result.status).toBe('SUMMARIZING');
      expect(result.progress.completed).toBe(3);
    });

    it('transitions to SUMMARIZING even with failures', async () => {
      const run = await createTestRun({ total: 3, completed: 1, failed: 1 });
      await db.run.update({
        where: { id: run.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      const result = await incrementFailed(run.id);

      // Should transition to SUMMARIZING, not COMPLETED
      expect(result.status).toBe('SUMMARIZING');
      expect(result.progress.completed).toBe(1);
      expect(result.progress.failed).toBe(2);
    });

    it('does not change status if already COMPLETED', async () => {
      const run = await createTestRun({ total: 3, completed: 3, failed: 0 });
      await db.run.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      const result = await updateProgress(run.id, { incrementCompleted: 1 });

      expect(result.status).toBe('COMPLETED');
    });

    it('does not change status if already CANCELLED', async () => {
      const run = await createTestRun({ total: 10, completed: 5, failed: 0 });
      await db.run.update({
        where: { id: run.id },
        data: { status: 'CANCELLED' },
      });

      const result = await incrementCompleted(run.id);

      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('incrementCompleted', () => {
    it('increments completed by 1', async () => {
      const run = await createTestRun({ total: 10, completed: 5, failed: 0 });

      const result = await incrementCompleted(run.id);

      expect(result.progress.completed).toBe(6);
    });
  });

  describe('incrementFailed', () => {
    it('increments failed by 1', async () => {
      const run = await createTestRun({ total: 10, completed: 5, failed: 1 });

      const result = await incrementFailed(run.id);

      expect(result.progress.failed).toBe(2);
    });
  });

  describe('getProgress', () => {
    it('returns progress for existing run', async () => {
      const run = await createTestRun({ total: 10, completed: 5, failed: 2 });

      const progress = await getProgress(run.id);

      expect(progress).toEqual({ total: 10, completed: 5, failed: 2 });
    });

    it('returns null for non-existent run', async () => {
      const progress = await getProgress('non-existent-run-id');

      expect(progress).toBeNull();
    });
  });

  describe('calculatePercentComplete', () => {
    it('calculates correct percentage', () => {
      expect(calculatePercentComplete({ total: 10, completed: 5, failed: 0 })).toBe(50);
      expect(calculatePercentComplete({ total: 10, completed: 3, failed: 2 })).toBe(50);
      expect(calculatePercentComplete({ total: 10, completed: 10, failed: 0 })).toBe(100);
      expect(calculatePercentComplete({ total: 10, completed: 0, failed: 0 })).toBe(0);
    });

    it('returns 100 for zero total', () => {
      expect(calculatePercentComplete({ total: 0, completed: 0, failed: 0 })).toBe(100);
    });

    it('rounds to nearest integer', () => {
      expect(calculatePercentComplete({ total: 3, completed: 1, failed: 0 })).toBe(33);
      expect(calculatePercentComplete({ total: 3, completed: 2, failed: 0 })).toBe(67);
    });
  });

  describe('concurrent updates', () => {
    it('handles multiple concurrent increments correctly', async () => {
      const run = await createTestRun({ total: 100, completed: 0, failed: 0 });

      // Simulate 10 concurrent updates
      const promises = Array.from({ length: 10 }, () =>
        incrementCompleted(run.id)
      );

      await Promise.all(promises);

      // Verify final count
      const progress = await getProgress(run.id);
      expect(progress?.completed).toBe(10);
    });

    it('handles mixed concurrent completed/failed increments', async () => {
      const run = await createTestRun({ total: 100, completed: 0, failed: 0 });

      // 5 completed + 3 failed concurrently
      const completedPromises = Array.from({ length: 5 }, () =>
        incrementCompleted(run.id)
      );
      const failedPromises = Array.from({ length: 3 }, () =>
        incrementFailed(run.id)
      );

      await Promise.all([...completedPromises, ...failedPromises]);

      const progress = await getProgress(run.id);
      expect(progress?.completed).toBe(5);
      expect(progress?.failed).toBe(3);
    });
  });

  describe('summarize job queueing (T014)', () => {
    let testDefinitionId: string;
    let testRunId: string;

    afterEach(async () => {
      mockSend.mockClear();
      if (testRunId) {
        await db.transcript.deleteMany({ where: { runId: testRunId } });
        await db.runScenarioSelection.deleteMany({ where: { runId: testRunId } });
        await db.run.deleteMany({ where: { id: testRunId } });
      }
      if (testDefinitionId) {
        await db.definition.deleteMany({ where: { id: testDefinitionId } });
      }
    });

    async function createRunWithTranscripts(transcriptCount: number) {
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition for Summarize',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      testDefinitionId = definition.id;
      createdDefinitionIds.push(definition.id);

      const run = await db.run.create({
        data: {
          definitionId: definition.id,
          status: 'RUNNING',
          startedAt: new Date(),
          config: { models: ['gpt-4'] },
          progress: { total: transcriptCount, completed: transcriptCount, failed: 0 },
        },
      });
      testRunId = run.id;
      createdRunIds.push(run.id);

      // Create mock scenario
      const scenario = await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: 'test-scenario-' + Date.now(),
          content: { schema_version: 1, prompt: 'Test scenario body', dimension_values: { test: 'value' } },
        },
      });

      // Create transcripts
      for (let i = 0; i < transcriptCount; i++) {
        await db.transcript.create({
          data: {
            runId: run.id,
            scenarioId: scenario.id,
            modelId: 'openai:gpt-4',
            modelVersion: 'gpt-4-0613',
            content: { schema_version: 1, messages: [], model_response: 'test' },
            turnCount: 1,
            tokenCount: 100,
            durationMs: 1000,
          },
        });
      }

      return run;
    }

    it('queues individual summarize job per transcript', async () => {
      const transcriptCount = 3;
      const run = await createRunWithTranscripts(transcriptCount);

      // Increment to trigger SUMMARIZING transition (all jobs done)
      // We need to reduce completed by 1 so the increment causes the transition
      await db.run.update({
        where: { id: run.id },
        data: {
          progress: { total: transcriptCount, completed: transcriptCount - 1, failed: 0 },
        },
      });

      mockSend.mockClear(); // Clear any previous calls
      await incrementCompleted(run.id);

      // Should have queued one job per transcript
      expect(mockSend).toHaveBeenCalledTimes(transcriptCount);
    });

    it('includes runId and transcriptId in job data', async () => {
      const run = await createRunWithTranscripts(2);
      await db.run.update({
        where: { id: run.id },
        data: { progress: { total: 2, completed: 1, failed: 0 } },
      });

      mockSend.mockClear();
      await incrementCompleted(run.id);

      // Verify each call has correct queue name and data structure
      for (const call of mockSend.mock.calls) {
        const [queueName, jobData] = call;
        expect(queueName).toBe('summarize_transcript');
        expect(jobData).toHaveProperty('runId', run.id);
        expect(jobData).toHaveProperty('transcriptId');
        expect(typeof jobData.transcriptId).toBe('string');
      }
    });

    it('uses retry configuration from DEFAULT_JOB_OPTIONS', async () => {
      const run = await createRunWithTranscripts(1);
      await db.run.update({
        where: { id: run.id },
        data: { progress: { total: 1, completed: 0, failed: 0 } },
      });

      mockSend.mockClear();
      await incrementCompleted(run.id);

      // Verify job options were passed
      expect(mockSend).toHaveBeenCalledTimes(1);
      const [, , jobOptions] = mockSend.mock.calls[0];

      // Retry configuration from DEFAULT_JOB_OPTIONS['summarize_transcript']
      expect(jobOptions).toEqual({
        retryLimit: 3,
        retryDelay: 10,
        retryBackoff: true,
        expireInSeconds: 120,
      });
    });

    it('initializes summarizeProgress when transitioning to SUMMARIZING', async () => {
      const transcriptCount = 3;
      const run = await createRunWithTranscripts(transcriptCount);
      await db.run.update({
        where: { id: run.id },
        data: { progress: { total: transcriptCount, completed: transcriptCount - 1, failed: 0 } },
      });

      mockSend.mockClear();
      await incrementCompleted(run.id);

      // Check summarizeProgress was initialized
      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.summarizeProgress).toEqual({
        total: transcriptCount,
        completed: 0,
        failed: 0,
      });
    });
  });
});
