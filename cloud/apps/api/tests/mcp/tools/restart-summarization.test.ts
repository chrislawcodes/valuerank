/**
 * restart_summarization MCP Tool Tests [T035]
 *
 * Tests for the MCP tool interface layer.
 * Service layer tests are in tests/services/run/summarization.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';

// Mock PgBoss
const mockSend = vi.fn().mockResolvedValue('mock-job-id');
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: mockSend,
  })),
}));

import { restartSummarization } from '../../../src/services/run/summarization.js';

describe('restart_summarization MCP Tool [T035]', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdScenarioIds: string[] = [];

  beforeEach(() => {
    mockSend.mockClear();
  });

  afterEach(async () => {
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
    transcriptCount?: number;
    summarizedCount?: number;
  }) {
    const definition = await db.definition.create({
      data: {
        name: 'MCP Restart Test ' + Date.now(),
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
        summarizeProgress: { total: options.transcriptCount ?? 3, completed: options.summarizedCount ?? 0, failed: 0 },
      },
    });
    createdRunIds.push(run.id);

    // Create transcripts
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

    return run;
  }

  describe('input handling', () => {
    it('accepts valid run_id', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 2,
        summarizedCount: 0,
      });

      const result = await restartSummarization(run.id);

      expect(result.run.id).toBe(run.id);
    });

    it('accepts force parameter as true', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 2,
        summarizedCount: 2,
      });

      mockSend.mockClear();
      const result = await restartSummarization(run.id, true);

      // With force=true, should queue all transcripts even if summarized
      expect(result.queuedCount).toBe(2);
    });

    it('accepts force parameter as false', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 3,
        summarizedCount: 2,
      });

      mockSend.mockClear();
      const result = await restartSummarization(run.id, false);

      // With force=false, should only queue unsummarized
      expect(result.queuedCount).toBe(1);
    });

    it('defaults force to false', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 2,
        summarizedCount: 2, // All summarized
      });

      mockSend.mockClear();
      const result = await restartSummarization(run.id);

      // Should queue nothing (default force=false, all are summarized)
      expect(result.queuedCount).toBe(0);
    });
  });

  describe('success response format', () => {
    it('returns run with updated status', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 2,
        summarizedCount: 0,
      });

      const result = await restartSummarization(run.id);

      expect(result.run.status).toBe('SUMMARIZING');
    });

    it('returns queued count', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 3,
        summarizedCount: 1,
      });

      mockSend.mockClear();
      const result = await restartSummarization(run.id);

      expect(result.queuedCount).toBe(2);
    });

    it('returns summarize progress', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 3,
        summarizedCount: 0,
      });

      const result = await restartSummarization(run.id);

      expect(result.run.summarizeProgress).toEqual({
        total: 3,
        completed: 0,
        failed: 0,
      });
    });
  });

  describe('error handling', () => {
    it('throws NotFoundError for non-existent run', async () => {
      await expect(restartSummarization('non-existent-cuid123456789')).rejects.toThrow(
        /Run.*not found/
      );
    });

    it('throws RunStateError when run is RUNNING', async () => {
      const run = await createTestRun({ status: 'RUNNING' });

      await expect(restartSummarization(run.id)).rejects.toThrow(/cannot.*restart/i);
    });

    it('throws RunStateError when run is SUMMARIZING', async () => {
      const run = await createTestRun({ status: 'SUMMARIZING' });

      await expect(restartSummarization(run.id)).rejects.toThrow(/cannot.*restart/i);
    });

    it('throws RunStateError when run is PENDING', async () => {
      const run = await createTestRun({ status: 'PENDING' });

      await expect(restartSummarization(run.id)).rejects.toThrow(/cannot.*restart/i);
    });
  });

  describe('state transitions', () => {
    it('transitions COMPLETED to SUMMARIZING', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 2,
        summarizedCount: 0,
      });

      await restartSummarization(run.id);

      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.status).toBe('SUMMARIZING');
    });

    it('transitions FAILED to SUMMARIZING', async () => {
      const run = await createTestRun({
        status: 'FAILED',
        transcriptCount: 2,
        summarizedCount: 0,
      });

      await restartSummarization(run.id);

      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.status).toBe('SUMMARIZING');
    });

    it('transitions CANCELLED to SUMMARIZING', async () => {
      const run = await createTestRun({
        status: 'CANCELLED',
        transcriptCount: 2,
        summarizedCount: 0,
      });

      await restartSummarization(run.id);

      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.status).toBe('SUMMARIZING');
    });

    it('clears completedAt when restarting', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 2,
        summarizedCount: 0,
      });

      // Verify completedAt is set initially
      const initialRun = await db.run.findUnique({ where: { id: run.id } });
      expect(initialRun?.completedAt).not.toBeNull();

      await restartSummarization(run.id);

      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.completedAt).toBeNull();
    });

    it('does not transition if no transcripts to queue', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 2,
        summarizedCount: 2, // All done
      });

      await restartSummarization(run.id, false);

      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.status).toBe('COMPLETED'); // No change
    });
  });

  describe('job queuing', () => {
    it('queues correct number of jobs in default mode', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 5,
        summarizedCount: 2,
      });

      mockSend.mockClear();
      await restartSummarization(run.id, false);

      expect(mockSend).toHaveBeenCalledTimes(3); // 5 - 2 = 3 unsummarized
    });

    it('queues all transcripts in force mode', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 4,
        summarizedCount: 4,
      });

      mockSend.mockClear();
      await restartSummarization(run.id, true);

      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    it('queues jobs with correct queue name', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 1,
        summarizedCount: 0,
      });

      mockSend.mockClear();
      await restartSummarization(run.id);

      expect(mockSend).toHaveBeenCalledWith(
        'summarize_transcript',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('queues jobs with correct data structure', async () => {
      const run = await createTestRun({
        status: 'COMPLETED',
        transcriptCount: 1,
        summarizedCount: 0,
      });

      mockSend.mockClear();
      await restartSummarization(run.id);

      const [, jobData] = mockSend.mock.calls[0];
      expect(jobData).toHaveProperty('runId', run.id);
      expect(jobData).toHaveProperty('transcriptId');
    });
  });
});
