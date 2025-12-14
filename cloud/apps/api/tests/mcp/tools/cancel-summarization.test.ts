/**
 * cancel_summarization MCP Tool Tests [T034]
 *
 * Tests for the MCP tool interface layer.
 * Service layer tests are in tests/services/run/summarization.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';

// Mock PgBoss
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  })),
}));

import {
  cancelSummarization,
  type CancelSummarizationResult,
} from '../../../src/services/run/summarization.js';

describe('cancel_summarization MCP Tool [T034]', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];

  afterEach(async () => {
    for (const runId of createdRunIds) {
      await db.transcript.deleteMany({ where: { runId } });
      await db.runScenarioSelection.deleteMany({ where: { runId } });
    }
    await db.run.deleteMany({ where: { id: { in: createdRunIds } } });
    createdRunIds.length = 0;

    await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
    createdDefinitionIds.length = 0;
  });

  async function createTestRun(status: string) {
    const definition = await db.definition.create({
      data: {
        name: 'MCP Cancel Test ' + Date.now(),
        content: { schema_version: 1, preamble: 'Test' },
      },
    });
    createdDefinitionIds.push(definition.id);

    const run = await db.run.create({
      data: {
        definitionId: definition.id,
        status,
        startedAt: new Date(),
        config: { models: ['gpt-4'] },
        progress: { total: 3, completed: 3, failed: 0 },
        summarizeProgress: { total: 3, completed: 1, failed: 0 },
      },
    });
    createdRunIds.push(run.id);

    return run;
  }

  describe('input handling', () => {
    it('accepts valid run_id', async () => {
      const run = await createTestRun('SUMMARIZING');

      const result = await cancelSummarization(run.id);

      expect(result.run.id).toBe(run.id);
    });
  });

  describe('success response format', () => {
    it('returns run with updated status', async () => {
      const run = await createTestRun('SUMMARIZING');

      const result = await cancelSummarization(run.id);

      expect(result.run.status).toBe('COMPLETED');
    });

    it('returns cancelled count', async () => {
      const run = await createTestRun('SUMMARIZING');

      const result = await cancelSummarization(run.id);

      expect(typeof result.cancelledCount).toBe('number');
      expect(result.cancelledCount).toBeGreaterThanOrEqual(0);
    });

    it('returns summarize progress', async () => {
      const run = await createTestRun('SUMMARIZING');

      const result = await cancelSummarization(run.id);

      expect(result.run.summarizeProgress).toBeDefined();
      expect(typeof result.run.summarizeProgress?.total).toBe('number');
      expect(typeof result.run.summarizeProgress?.completed).toBe('number');
    });
  });

  describe('error handling', () => {
    it('throws NotFoundError for non-existent run', async () => {
      await expect(cancelSummarization('non-existent-cuid123456789')).rejects.toThrow(
        /Run.*not found/
      );
    });

    it('throws RunStateError when run is COMPLETED', async () => {
      const run = await createTestRun('COMPLETED');

      await expect(cancelSummarization(run.id)).rejects.toThrow(/cannot.*cancel/i);
    });

    it('throws RunStateError when run is RUNNING', async () => {
      const run = await createTestRun('RUNNING');

      await expect(cancelSummarization(run.id)).rejects.toThrow(/cannot.*cancel/i);
    });

    it('throws RunStateError when run is FAILED', async () => {
      const run = await createTestRun('FAILED');

      await expect(cancelSummarization(run.id)).rejects.toThrow(/cannot.*cancel/i);
    });
  });

  describe('state transitions', () => {
    it('transitions SUMMARIZING to COMPLETED', async () => {
      const run = await createTestRun('SUMMARIZING');

      await cancelSummarization(run.id);

      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.status).toBe('COMPLETED');
    });

    it('sets completedAt timestamp', async () => {
      const run = await createTestRun('SUMMARIZING');

      await cancelSummarization(run.id);

      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.completedAt).not.toBeNull();
    });
  });
});
