/**
 * Summarization Control Service Tests
 *
 * Tests for cancel and restart summarization operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import { NotFoundError, RunStateError } from '@valuerank/shared';

// Mock PgBoss
const mockSend = vi.fn().mockResolvedValue('mock-job-id');
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: mockSend,
  })),
}));

import { cancelSummarization, restartSummarization } from '../../../src/services/run/summarization.js';

describe('summarization service', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdScenarioIds: string[] = [];

  beforeEach(() => {
    mockSend.mockClear();
  });

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

  describe('cancelSummarization', () => {
    it('throws NotFoundError for non-existent run', async () => {
      await expect(cancelSummarization('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('throws RunStateError when run is not SUMMARIZING', async () => {
      const { run } = await createTestRun({ status: 'RUNNING' });

      await expect(cancelSummarization(run.id)).rejects.toThrow(RunStateError);
    });

    it('cancels summarization when run is SUMMARIZING', async () => {
      const { run } = await createTestRun({
        status: 'SUMMARIZING',
        summarizeProgress: { total: 5, completed: 2, failed: 0 },
        transcriptCount: 5,
        summarizedCount: 2,
      });

      const result = await cancelSummarization(run.id);

      expect(result.run.status).toBe('COMPLETED');
      expect(result.run.summarizeProgress?.completed).toBe(2);
      expect(typeof result.cancelledCount).toBe('number');
    });

    it('preserves completed summaries', async () => {
      const { run } = await createTestRun({
        status: 'SUMMARIZING',
        summarizeProgress: { total: 3, completed: 2, failed: 0 },
        transcriptCount: 3,
        summarizedCount: 2,
      });

      await cancelSummarization(run.id);

      // Verify summarized transcripts are still summarized
      const summarizedCount = await db.transcript.count({
        where: { runId: run.id, summarizedAt: { not: null } },
      });
      expect(summarizedCount).toBe(2);
    });

    it('transitions run to COMPLETED after cancel', async () => {
      const { run } = await createTestRun({
        status: 'SUMMARIZING',
        summarizeProgress: { total: 3, completed: 0, failed: 0 },
      });

      const result = await cancelSummarization(run.id);

      expect(result.run.status).toBe('COMPLETED');

      // Verify in database
      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.status).toBe('COMPLETED');
      expect(updatedRun?.completedAt).not.toBeNull();
    });
  });

  describe('restartSummarization', () => {
    it('throws NotFoundError for non-existent run', async () => {
      await expect(restartSummarization('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('throws RunStateError when run is RUNNING', async () => {
      const { run } = await createTestRun({ status: 'RUNNING' });

      await expect(restartSummarization(run.id)).rejects.toThrow(RunStateError);
    });

    it('throws RunStateError when run is SUMMARIZING', async () => {
      const { run } = await createTestRun({ status: 'SUMMARIZING' });

      await expect(restartSummarization(run.id)).rejects.toThrow(RunStateError);
    });

    it('restarts from COMPLETED state', async () => {
      const { run } = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 3,
        summarizedCount: 1, // 2 unsummarized
      });

      mockSend.mockClear();
      const result = await restartSummarization(run.id);

      expect(result.run.status).toBe('SUMMARIZING');
      expect(result.queuedCount).toBe(2); // Only unsummarized
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('restarts from FAILED state', async () => {
      const { run } = await createTestRun({
        status: 'FAILED',
        transcriptCount: 2,
        summarizedCount: 0,
      });

      mockSend.mockClear();
      const result = await restartSummarization(run.id);

      expect(result.run.status).toBe('SUMMARIZING');
      expect(result.queuedCount).toBe(2);
    });

    it('restarts from CANCELLED state', async () => {
      const { run } = await createTestRun({
        status: 'CANCELLED',
        transcriptCount: 2,
        summarizedCount: 1,
      });

      mockSend.mockClear();
      const result = await restartSummarization(run.id);

      expect(result.run.status).toBe('SUMMARIZING');
      expect(result.queuedCount).toBe(1); // Only the unsummarized one
    });

    it('force mode re-queues all transcripts', async () => {
      const { run } = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 3,
        summarizedCount: 3, // All already summarized
      });

      mockSend.mockClear();
      const result = await restartSummarization(run.id, true);

      expect(result.queuedCount).toBe(3); // All transcripts
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('returns 0 when no transcripts need summarization', async () => {
      const { run } = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 2,
        summarizedCount: 2, // All done
      });

      mockSend.mockClear();
      const result = await restartSummarization(run.id, false);

      expect(result.queuedCount).toBe(0);
      expect(mockSend).not.toHaveBeenCalled();
      // Run status should not change if nothing to do
      expect(result.run.status).toBe('COMPLETED');
    });

    it('initializes summarizeProgress correctly', async () => {
      const { run } = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 4,
        summarizedCount: 1,
      });

      mockSend.mockClear();
      const result = await restartSummarization(run.id);

      expect(result.run.summarizeProgress).toEqual({
        total: 3, // 3 unsummarized
        completed: 0,
        failed: 0,
      });
    });

    it('clears completedAt when restarting', async () => {
      const { run } = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 2,
        summarizedCount: 0,
      });

      // Verify completedAt is set initially
      const initialRun = await db.run.findUnique({ where: { id: run.id } });
      expect(initialRun?.completedAt).not.toBeNull();

      await restartSummarization(run.id);

      // Verify completedAt is cleared
      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.completedAt).toBeNull();
    });

    it('queues jobs with correct data structure', async () => {
      const { run } = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 1,
        summarizedCount: 0,
      });

      mockSend.mockClear();
      await restartSummarization(run.id);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const [queueName, jobData, jobOptions] = mockSend.mock.calls[0];

      expect(queueName).toBe('summarize_transcript');
      expect(jobData).toHaveProperty('runId', run.id);
      expect(jobData).toHaveProperty('transcriptId');
      expect(jobOptions).toHaveProperty('retryLimit', 3);
    });
  });
});
