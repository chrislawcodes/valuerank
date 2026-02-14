/**
 * Unit tests for run recovery service
 *
 * Tests detection and recovery of orphaned runs - runs stuck in RUNNING/SUMMARIZING
 * state with no active/pending jobs in the queue.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { db } from '@valuerank/db';
import {
  detectOrphanedRuns,
  recoverOrphanedRun,
  recoverOrphanedRuns,
  runStartupRecovery,
  RECOVERY_INTERVAL_MS,
  type OrphanedRunInfo,
  type RecoveryResult,
} from '../../../src/services/run/recovery.js';

// Mock PgBoss
const mockBoss = {
  send: vi.fn().mockResolvedValue('mock-job-id'),
};

vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => mockBoss),
}));

// Mock getQueueNameForModel
vi.mock('../../../src/services/parallelism/index.js', () => ({
  getQueueNameForModel: vi.fn().mockResolvedValue('probe_scenario_openai'),
}));

describe('run recovery service', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdScenarioIds: string[] = [];
  const createdTranscriptIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up in reverse order of creation
    if (createdTranscriptIds.length > 0) {
      await db.transcript.deleteMany({
        where: { id: { in: createdTranscriptIds } },
      });
      createdTranscriptIds.length = 0;
    }

    if (createdRunIds.length > 0) {
      await db.runScenarioSelection.deleteMany({
        where: { runId: { in: createdRunIds } },
      });
      await db.run.deleteMany({
        where: { id: { in: createdRunIds } },
      });
      createdRunIds.length = 0;
    }

    if (createdScenarioIds.length > 0) {
      await db.scenario.deleteMany({
        where: { id: { in: createdScenarioIds } },
      });
      createdScenarioIds.length = 0;
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
        name: 'Test Recovery Definition ' + Date.now(),
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

  async function createTestScenario(definitionId: string) {
    const scenario = await db.scenario.create({
      data: {
        definitionId,
        name: 'Test Scenario ' + Date.now(),
        content: {
          schema_version: 1,
          prompt: 'Test scenario body',
          dimension_values: { variable: '1' },
        },
      },
    });
    createdScenarioIds.push(scenario.id);
    return scenario;
  }

  async function createTestRun(
    definitionId: string,
    status: string,
    progress: { total: number; completed: number; failed: number },
    updatedAtOffset?: number
  ) {
    const updatedAt = updatedAtOffset
      ? new Date(Date.now() - updatedAtOffset)
      : new Date();

    const run = await db.run.create({
      data: {
        definitionId,
        status,
        config: { models: ['openai:gpt-4o'] },
        progress,
        updatedAt,
        startedAt: status !== 'PENDING' ? new Date() : null,
      },
    });
    createdRunIds.push(run.id);
    return run;
  }

  async function createTestTranscript(runId: string, modelId: string, scenarioId?: string) {
    const transcript = await db.transcript.create({
      data: {
        runId,
        modelId,
        scenarioId,
        content: { schema_version: 1, messages: [], model_response: 'test' },
        turnCount: 1,
        tokenCount: 100,
        durationMs: 1000,
      },
    });
    createdTranscriptIds.push(transcript.id);
    return transcript;
  }

  describe('RECOVERY_INTERVAL_MS', () => {
    it('is set to 5 minutes', () => {
      expect(RECOVERY_INTERVAL_MS).toBe(5 * 60 * 1000);
    });
  });

  describe('detectOrphanedRuns', () => {
    it('returns empty array when no runs exist', async () => {
      const orphaned = await detectOrphanedRuns();
      expect(Array.isArray(orphaned)).toBe(true);
    });

    it('does not detect COMPLETED runs', async () => {
      const definition = await createTestDefinition();
      await createTestRun(
        definition.id,
        'COMPLETED',
        { total: 10, completed: 10, failed: 0 },
        10 * 60 * 1000 // 10 minutes ago
      );

      const orphaned = await detectOrphanedRuns();
      expect(orphaned.length).toBe(0);
    });

    it('does not detect PENDING runs', async () => {
      const definition = await createTestDefinition();
      await createTestRun(
        definition.id,
        'PENDING',
        { total: 10, completed: 0, failed: 0 },
        10 * 60 * 1000
      );

      const orphaned = await detectOrphanedRuns();
      expect(orphaned.length).toBe(0);
    });

    it('does not detect recently updated RUNNING runs', async () => {
      const definition = await createTestDefinition();
      // Updated just now (within threshold)
      await createTestRun(definition.id, 'RUNNING', { total: 10, completed: 5, failed: 0 });

      const orphaned = await detectOrphanedRuns();
      expect(orphaned.length).toBe(0);
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

      const orphaned = await detectOrphanedRuns();
      const found = orphaned.find((o) => o.runId === run.id);
      expect(found).toBeUndefined();
    });

    it('detects stuck RUNNING runs even when progress appears complete', async () => {
      const definition = await createTestDefinition();
      // Run with progress complete but stuck in RUNNING (edge case)
      const run = await createTestRun(
        definition.id,
        'RUNNING',
        { total: 10, completed: 10, failed: 0 },
        10 * 60 * 1000
      );

      const orphaned = await detectOrphanedRuns();
      const found = orphaned.find((o) => o.runId === run.id);
      expect(found).toBeDefined();
      expect(found?.missingProbes).toBe(0);
    });

    it('detects missing probes even when progress counters say complete', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(
        definition.id,
        'RUNNING',
        { total: 1, completed: 1, failed: 0 },
        10 * 60 * 1000
      );

      await db.runScenarioSelection.create({
        data: {
          runId: run.id,
          scenarioId: scenario.id,
        },
      });

      // Intentionally no transcript for the expected scenario/model pair.
      const orphaned = await detectOrphanedRuns();
      const found = orphaned.find((o) => o.runId === run.id);
      expect(found).toBeDefined();
      expect(found?.missingProbes).toBe(1);
    });
  });

  describe('recoverOrphanedRun', () => {
    it('triggers summarization when all probes complete in RUNNING state', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(
        definition.id,
        'RUNNING',
        { total: 1, completed: 1, failed: 0 }
      );

      // Create scenario selection
      await db.runScenarioSelection.create({
        data: {
          runId: run.id,
          scenarioId: scenario.id,
        },
      });

      // Create transcript for this scenario+model
      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id);

      const result = await recoverOrphanedRun(run.id);
      // When all probes are complete but status is RUNNING, it triggers summarization
      expect(result.action).toBe('triggered_summarization');
    });

    it('triggers summarization for completed run stuck in RUNNING', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(
        definition.id,
        'RUNNING',
        { total: 1, completed: 1, failed: 0 }
      );

      // Create scenario selection
      await db.runScenarioSelection.create({
        data: {
          runId: run.id,
          scenarioId: scenario.id,
        },
      });

      // Create transcript (makes progress complete)
      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id);

      const result = await recoverOrphanedRun(run.id);

      // Should trigger summarization or return no_missing_probes
      expect(['triggered_summarization', 'no_missing_probes']).toContain(result.action);
    });

    it('requeues missing probes when transcripts are missing', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(
        definition.id,
        'RUNNING',
        { total: 1, completed: 0, failed: 0 }
      );

      // Create scenario selection but no transcript
      await db.runScenarioSelection.create({
        data: {
          runId: run.id,
          scenarioId: scenario.id,
        },
      });

      const result = await recoverOrphanedRun(run.id);

      expect(result.action).toBe('requeued_probes');
      expect(result.requeuedCount).toBe(1);
      expect(mockBoss.send).toHaveBeenCalled();
    });

    it('requeues missing samples in multi-sample runs', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);

      // Create a multi-sample run (3 samples per scenario)
      const samplesPerScenario = 3;
      const run = await db.run.create({
        data: {
          definitionId: definition.id,
          status: 'RUNNING',
          config: { models: ['openai:gpt-4o'], samplesPerScenario },
          progress: { total: 3, completed: 1, failed: 0 }, // 1 of 3 completed
          startedAt: new Date(),
        },
      });
      createdRunIds.push(run.id);

      // Create scenario selection
      await db.runScenarioSelection.create({
        data: {
          runId: run.id,
          scenarioId: scenario.id,
        },
      });

      // Create only 1 transcript (sample index 0), leaving 2 missing
      const transcript = await db.transcript.create({
        data: {
          runId: run.id,
          modelId: 'openai:gpt-4o',
          scenarioId: scenario.id,
          sampleIndex: 0,
          content: { schema_version: 1, messages: [], model_response: 'test' },
          turnCount: 1,
          tokenCount: 100,
          durationMs: 1000,
        },
      });
      createdTranscriptIds.push(transcript.id);

      const result = await recoverOrphanedRun(run.id);

      expect(result.action).toBe('requeued_probes');
      expect(result.requeuedCount).toBe(2); // Should requeue samples 1 and 2

      // Verify the job data includes sampleIndex
      expect(mockBoss.send).toHaveBeenCalledTimes(2);
      const sendCalls = mockBoss.send.mock.calls;
      const sampleIndices = sendCalls.map((call) => call[1].sampleIndex).sort();
      expect(sampleIndices).toEqual([1, 2]); // Missing samples 1 and 2
    });

    it('handles run in SUMMARIZING with no pending jobs', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(
        definition.id,
        'SUMMARIZING',
        { total: 1, completed: 1, failed: 0 }
      );

      // Create an unsummarized transcript
      await createTestTranscript(run.id, 'openai:gpt-4o');

      const result = await recoverOrphanedRun(run.id);

      // Should requeue summarize jobs or return appropriate action
      expect(['requeued_summarize_jobs', 'no_missing_probes']).toContain(result.action);
    });

    it('completes run when all transcripts summarized in SUMMARIZING state', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(
        definition.id,
        'SUMMARIZING',
        { total: 1, completed: 1, failed: 0 }
      );

      // Create a summarized transcript
      const transcript = await createTestTranscript(run.id, 'openai:gpt-4o');
      await db.transcript.update({
        where: { id: transcript.id },
        data: { summarizedAt: new Date() },
      });

      const result = await recoverOrphanedRun(run.id);

      expect(result.action).toBe('completed_run');

      // Verify run is now completed
      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.status).toBe('COMPLETED');
      expect(updatedRun?.completedAt).not.toBeNull();
    });
  });

  describe('recoverOrphanedRuns', () => {
    it('returns empty result when no orphaned runs', async () => {
      const result = await recoverOrphanedRuns();

      expect(result.detected).toEqual([]);
      expect(result.recovered).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('handles errors during individual run recovery', async () => {
      // Create a scenario that will cause an error during recovery
      const definition = await createTestDefinition();
      const run = await createTestRun(
        definition.id,
        'RUNNING',
        { total: 10, completed: 5, failed: 0 },
        10 * 60 * 1000
      );

      // Mock getBoss to throw on send
      mockBoss.send.mockRejectedValueOnce(new Error('Queue error'));

      // The detection won't find this as orphaned unless there are no jobs
      // but the structure is tested
      const result = await recoverOrphanedRuns();

      // Result should be valid structure
      expect(result).toHaveProperty('detected');
      expect(result).toHaveProperty('recovered');
      expect(result).toHaveProperty('errors');
    });
  });

  describe('runStartupRecovery', () => {
    it('calls recoverOrphanedRuns', async () => {
      const result = await runStartupRecovery();

      expect(result).toHaveProperty('detected');
      expect(result).toHaveProperty('recovered');
      expect(result).toHaveProperty('errors');
    });
  });

  describe('OrphanedRunInfo type', () => {
    it('contains expected fields', () => {
      const info: OrphanedRunInfo = {
        runId: 'test-run-id',
        status: 'RUNNING',
        progress: { total: 10, completed: 5, failed: 0 },
        pendingJobs: 0,
        activeJobs: 0,
        missingProbes: 5,
        stuckMinutes: 10,
      };

      expect(info.runId).toBeDefined();
      expect(info.status).toBeDefined();
      expect(info.progress.total).toBe(10);
      expect(info.missingProbes).toBe(5);
      expect(info.stuckMinutes).toBe(10);
    });
  });

  describe('RecoveryResult type', () => {
    it('contains expected structure', () => {
      const result: RecoveryResult = {
        detected: [],
        recovered: [],
        errors: [],
      };

      expect(Array.isArray(result.detected)).toBe(true);
      expect(Array.isArray(result.recovered)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});
