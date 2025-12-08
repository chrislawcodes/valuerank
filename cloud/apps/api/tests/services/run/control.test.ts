/**
 * Unit tests for run control service
 *
 * Tests pause, resume, and cancel operations with state transitions.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import {
  pauseRun,
  resumeRun,
  cancelRun,
  isRunPaused,
  isRunTerminal,
} from '../../../src/services/run/control.js';
import { NotFoundError, RunStateError } from '@valuerank/shared';

// Mock PgBoss
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  })),
}));

describe('run control service', () => {
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

  async function createTestRun(status: string, progress?: { total: number; completed: number; failed: number }) {
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
        status,
        config: { models: ['gpt-4'] },
        progress: progress ?? { total: 10, completed: 0, failed: 0 },
      },
    });
    createdRunIds.push(run.id);

    return run;
  }

  describe('pauseRun', () => {
    it('pauses a PENDING run', async () => {
      const run = await createTestRun('PENDING');

      const result = await pauseRun(run.id);

      expect(result.status).toBe('PAUSED');

      // Verify in database
      const dbRun = await db.run.findUnique({ where: { id: run.id } });
      expect(dbRun?.status).toBe('PAUSED');
    });

    it('pauses a RUNNING run', async () => {
      const run = await createTestRun('RUNNING');

      const result = await pauseRun(run.id);

      expect(result.status).toBe('PAUSED');
    });

    it('throws NotFoundError for non-existent run', async () => {
      await expect(pauseRun('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('throws RunStateError for COMPLETED run', async () => {
      const run = await createTestRun('COMPLETED');

      await expect(pauseRun(run.id)).rejects.toThrow(RunStateError);
    });

    it('throws RunStateError for CANCELLED run', async () => {
      const run = await createTestRun('CANCELLED');

      await expect(pauseRun(run.id)).rejects.toThrow(RunStateError);
    });

    it('throws RunStateError for already PAUSED run', async () => {
      const run = await createTestRun('PAUSED');

      await expect(pauseRun(run.id)).rejects.toThrow(RunStateError);
    });
  });

  describe('resumeRun', () => {
    it('resumes a PAUSED run', async () => {
      const run = await createTestRun('PAUSED');

      const result = await resumeRun(run.id);

      expect(result.status).toBe('RUNNING');

      // Verify in database
      const dbRun = await db.run.findUnique({ where: { id: run.id } });
      expect(dbRun?.status).toBe('RUNNING');
    });

    it('throws NotFoundError for non-existent run', async () => {
      await expect(resumeRun('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('throws RunStateError for PENDING run', async () => {
      const run = await createTestRun('PENDING');

      await expect(resumeRun(run.id)).rejects.toThrow(RunStateError);
    });

    it('throws RunStateError for RUNNING run', async () => {
      const run = await createTestRun('RUNNING');

      await expect(resumeRun(run.id)).rejects.toThrow(RunStateError);
    });

    it('throws RunStateError for COMPLETED run', async () => {
      const run = await createTestRun('COMPLETED');

      await expect(resumeRun(run.id)).rejects.toThrow(RunStateError);
    });
  });

  describe('cancelRun', () => {
    it('cancels a PENDING run', async () => {
      const run = await createTestRun('PENDING');

      const result = await cancelRun(run.id);

      expect(result.status).toBe('CANCELLED');

      // Verify in database
      const dbRun = await db.run.findUnique({ where: { id: run.id } });
      expect(dbRun?.status).toBe('CANCELLED');
      expect(dbRun?.completedAt).not.toBeNull();
    });

    it('cancels a RUNNING run', async () => {
      const run = await createTestRun('RUNNING');

      const result = await cancelRun(run.id);

      expect(result.status).toBe('CANCELLED');
    });

    it('cancels a PAUSED run', async () => {
      const run = await createTestRun('PAUSED');

      const result = await cancelRun(run.id);

      expect(result.status).toBe('CANCELLED');
    });

    it('throws NotFoundError for non-existent run', async () => {
      await expect(cancelRun('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('throws RunStateError for COMPLETED run', async () => {
      const run = await createTestRun('COMPLETED');

      await expect(cancelRun(run.id)).rejects.toThrow(RunStateError);
    });

    it('throws RunStateError for already CANCELLED run', async () => {
      const run = await createTestRun('CANCELLED');

      await expect(cancelRun(run.id)).rejects.toThrow(RunStateError);
    });
  });

  describe('isRunPaused', () => {
    it('returns true for PAUSED run', async () => {
      const run = await createTestRun('PAUSED');

      const result = await isRunPaused(run.id);

      expect(result).toBe(true);
    });

    it('returns false for RUNNING run', async () => {
      const run = await createTestRun('RUNNING');

      const result = await isRunPaused(run.id);

      expect(result).toBe(false);
    });

    it('returns false for non-existent run', async () => {
      const result = await isRunPaused('non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('isRunTerminal', () => {
    it('returns true for COMPLETED run', async () => {
      const run = await createTestRun('COMPLETED');

      const result = await isRunTerminal(run.id);

      expect(result).toBe(true);
    });

    it('returns true for CANCELLED run', async () => {
      const run = await createTestRun('CANCELLED');

      const result = await isRunTerminal(run.id);

      expect(result).toBe(true);
    });

    it('returns true for FAILED run', async () => {
      const run = await createTestRun('FAILED');

      const result = await isRunTerminal(run.id);

      expect(result).toBe(true);
    });

    it('returns false for RUNNING run', async () => {
      const run = await createTestRun('RUNNING');

      const result = await isRunTerminal(run.id);

      expect(result).toBe(false);
    });

    it('returns false for PAUSED run', async () => {
      const run = await createTestRun('PAUSED');

      const result = await isRunTerminal(run.id);

      expect(result).toBe(false);
    });

    it('returns true for non-existent run (fail-safe)', async () => {
      const result = await isRunTerminal('non-existent-id');

      expect(result).toBe(true);
    });
  });

  describe('state transition sequence', () => {
    it('PENDING -> pause -> resume -> cancel', async () => {
      const run = await createTestRun('PENDING');

      // Pause
      let result = await pauseRun(run.id);
      expect(result.status).toBe('PAUSED');

      // Resume
      result = await resumeRun(run.id);
      expect(result.status).toBe('RUNNING');

      // Cancel
      result = await cancelRun(run.id);
      expect(result.status).toBe('CANCELLED');
    });

    it('cannot pause after cancel', async () => {
      const run = await createTestRun('RUNNING');

      await cancelRun(run.id);

      await expect(pauseRun(run.id)).rejects.toThrow(RunStateError);
    });

    it('cannot resume after cancel', async () => {
      const run = await createTestRun('PAUSED');

      await cancelRun(run.id);

      await expect(resumeRun(run.id)).rejects.toThrow(RunStateError);
    });
  });
});
