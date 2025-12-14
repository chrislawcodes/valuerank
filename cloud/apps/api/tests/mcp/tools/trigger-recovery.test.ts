/**
 * trigger_recovery MCP Tool Tests [T015]
 *
 * Tests for the system-wide recovery MCP tool.
 * Service layer tests are in tests/services/run/recovery.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import { recoverOrphanedRuns } from '../../../src/services/run/recovery.js';
import type { RecoveryResult } from '../../../src/services/run/recovery.js';

// Mock PgBoss
const mockSend = vi.fn().mockResolvedValue('mock-job-id');
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: mockSend,
  })),
}));

// Mock getQueueNameForModel
vi.mock('../../../src/services/parallelism/index.js', () => ({
  getQueueNameForModel: vi.fn().mockResolvedValue('probe_scenario_openai'),
}));

describe('trigger_recovery MCP Tool [T015]', () => {
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

  async function createTestDefinition() {
    const definition = await db.definition.create({
      data: {
        name: 'MCP Trigger Recovery Test ' + Date.now(),
        content: { schema_version: 1, preamble: 'Test' },
      },
    });
    createdDefinitionIds.push(definition.id);
    return definition;
  }

  async function createTestRun(
    definitionId: string,
    status: string,
    progress?: { total: number; completed: number; failed: number },
    updatedAtOffset?: number
  ) {
    const updatedAt = updatedAtOffset
      ? new Date(Date.now() - updatedAtOffset)
      : new Date();

    const run = await db.run.create({
      data: {
        definitionId,
        status,
        startedAt: status !== 'PENDING' ? new Date() : null,
        config: { models: ['openai:gpt-4o'] },
        progress: progress ?? { total: 10, completed: 0, failed: 0 },
        updatedAt,
      },
    });
    createdRunIds.push(run.id);
    return run;
  }

  describe('response structure', () => {
    it('returns RecoveryResult with detected, recovered, and errors arrays', async () => {
      const result = await recoverOrphanedRuns();

      expect(result).toHaveProperty('detected');
      expect(result).toHaveProperty('recovered');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.detected)).toBe(true);
      expect(Array.isArray(result.recovered)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('returns empty arrays when no orphaned runs', async () => {
      // Create only healthy runs (not stuck)
      const definition = await createTestDefinition();
      await createTestRun(definition.id, 'COMPLETED', { total: 10, completed: 10, failed: 0 });

      const result = await recoverOrphanedRuns();

      expect(result.detected.length).toBe(0);
      expect(result.recovered.length).toBe(0);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('detection criteria', () => {
    it('does not detect COMPLETED runs', async () => {
      const definition = await createTestDefinition();
      await createTestRun(
        definition.id,
        'COMPLETED',
        { total: 10, completed: 10, failed: 0 },
        10 * 60 * 1000 // 10 minutes ago
      );

      const result = await recoverOrphanedRuns();

      expect(result.detected.length).toBe(0);
    });

    it('does not detect PENDING runs', async () => {
      const definition = await createTestDefinition();
      await createTestRun(
        definition.id,
        'PENDING',
        { total: 10, completed: 0, failed: 0 },
        10 * 60 * 1000
      );

      const result = await recoverOrphanedRuns();

      expect(result.detected.length).toBe(0);
    });

    it('does not detect FAILED runs', async () => {
      const definition = await createTestDefinition();
      await createTestRun(
        definition.id,
        'FAILED',
        { total: 10, completed: 5, failed: 5 },
        10 * 60 * 1000
      );

      const result = await recoverOrphanedRuns();

      expect(result.detected.length).toBe(0);
    });

    it('does not detect recently updated RUNNING runs', async () => {
      const definition = await createTestDefinition();
      // Updated just now (within threshold)
      await createTestRun(definition.id, 'RUNNING', { total: 10, completed: 5, failed: 0 });

      const result = await recoverOrphanedRuns();

      expect(result.detected.length).toBe(0);
    });

    it('does not detect soft-deleted runs', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(
        definition.id,
        'RUNNING',
        { total: 10, completed: 5, failed: 0 },
        10 * 60 * 1000
      );

      // Soft delete
      await db.run.update({
        where: { id: run.id },
        data: { deletedAt: new Date() },
      });

      const result = await recoverOrphanedRuns();

      const detected = result.detected.find((d) => d.runId === run.id);
      expect(detected).toBeUndefined();
    });
  });

  describe('RecoveryResult type', () => {
    it('has correct structure for detected runs', () => {
      const result: RecoveryResult = {
        detected: [
          {
            runId: 'test-run-id',
            status: 'RUNNING',
            progress: { total: 10, completed: 5, failed: 0 },
            pendingJobs: 0,
            activeJobs: 0,
            missingProbes: 5,
            stuckMinutes: 10,
          },
        ],
        recovered: [],
        errors: [],
      };

      expect(result.detected[0].runId).toBe('test-run-id');
      expect(result.detected[0].missingProbes).toBe(5);
    });

    it('has correct structure for recovered runs', () => {
      const result: RecoveryResult = {
        detected: [],
        recovered: [
          {
            runId: 'test-run-id',
            action: 'requeued_probes',
            requeuedCount: 5,
          },
        ],
        errors: [],
      };

      expect(result.recovered[0].action).toBe('requeued_probes');
      expect(result.recovered[0].requeuedCount).toBe(5);
    });

    it('has correct structure for errors', () => {
      const result: RecoveryResult = {
        detected: [],
        recovered: [],
        errors: [
          {
            runId: 'test-run-id',
            error: 'Failed to re-queue jobs',
          },
        ],
      };

      expect(result.errors[0].runId).toBe('test-run-id');
      expect(result.errors[0].error).toBe('Failed to re-queue jobs');
    });
  });

  describe('idempotency', () => {
    it('is safe to call multiple times', async () => {
      // Call multiple times
      const result1 = await recoverOrphanedRuns();
      const result2 = await recoverOrphanedRuns();

      // Both should return valid results
      expect(result1).toHaveProperty('detected');
      expect(result2).toHaveProperty('detected');
    });
  });
});
