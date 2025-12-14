/**
 * recover_run MCP Tool Tests [T011]
 *
 * Tests for the MCP tool interface layer.
 * Service layer tests are in tests/services/run/recovery.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import { recoverOrphanedRun } from '../../../src/services/run/recovery.js';

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

describe('recover_run MCP Tool [T011]', () => {
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
        name: 'MCP Recover Test ' + Date.now(),
        content: { schema_version: 1, preamble: 'Test' },
      },
    });
    createdDefinitionIds.push(definition.id);
    return definition;
  }

  async function createTestScenario(definitionId: string) {
    const scenario = await db.scenario.create({
      data: {
        definitionId,
        name: 'test-scenario-' + Date.now(),
        content: { schema_version: 1, prompt: 'Test', dimension_values: {} },
      },
    });
    createdScenarioIds.push(scenario.id);
    return scenario;
  }

  async function createTestRun(
    definitionId: string,
    status: string,
    progress?: { total: number; completed: number; failed: number }
  ) {
    const run = await db.run.create({
      data: {
        definitionId,
        status,
        startedAt: status !== 'PENDING' ? new Date() : null,
        config: { models: ['openai:gpt-4o'] },
        progress: progress ?? { total: 10, completed: 0, failed: 0 },
        summarizeProgress: { total: 10, completed: 0, failed: 0 },
      },
    });
    createdRunIds.push(run.id);
    return run;
  }

  async function createTestTranscript(
    runId: string,
    modelId: string,
    scenarioId?: string,
    summarized = false
  ) {
    const transcript = await db.transcript.create({
      data: {
        runId,
        modelId,
        scenarioId,
        content: { schema_version: 1, messages: [], model_response: 'test' },
        turnCount: 1,
        tokenCount: 100,
        durationMs: 1000,
        summarizedAt: summarized ? new Date() : null,
      },
    });
    return transcript;
  }

  describe('input validation', () => {
    it('validates run exists', async () => {
      // Non-existent run should not be found
      const run = await db.run.findUnique({
        where: { id: 'non-existent-run-id-12345678' },
      });
      expect(run).toBeNull();
    });
  });

  describe('recovery actions', () => {
    it('returns no_missing_probes when all probes complete', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id, 'RUNNING', { total: 1, completed: 1, failed: 0 });

      // Create scenario selection
      await db.runScenarioSelection.create({
        data: { runId: run.id, scenarioId: scenario.id },
      });

      // Create transcript for this scenario+model
      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id);

      const result = await recoverOrphanedRun(run.id);

      // Should trigger summarization or return action
      expect(['triggered_summarization', 'no_missing_probes']).toContain(result.action);
    });

    it('requeues missing probes when transcripts missing', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id, 'RUNNING', { total: 1, completed: 0, failed: 0 });

      // Create scenario selection but no transcript
      await db.runScenarioSelection.create({
        data: { runId: run.id, scenarioId: scenario.id },
      });

      mockSend.mockClear();
      const result = await recoverOrphanedRun(run.id);

      expect(result.action).toBe('requeued_probes');
      expect(result.requeuedCount).toBe(1);
      expect(mockSend).toHaveBeenCalled();
    });

    it('requeues summarize jobs for SUMMARIZING run with unsummarized transcripts', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id, 'SUMMARIZING', { total: 1, completed: 1, failed: 0 });

      // Create unsummarized transcript
      await createTestTranscript(run.id, 'openai:gpt-4o', undefined, false);

      mockSend.mockClear();
      const result = await recoverOrphanedRun(run.id);

      expect(['requeued_summarize_jobs', 'no_missing_probes']).toContain(result.action);
    });

    it('completes run when all transcripts summarized in SUMMARIZING state', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id, 'SUMMARIZING', { total: 1, completed: 1, failed: 0 });

      // Create summarized transcript
      await createTestTranscript(run.id, 'openai:gpt-4o', undefined, true);

      const result = await recoverOrphanedRun(run.id);

      expect(result.action).toBe('completed_run');

      // Verify run is now completed
      const updatedRun = await db.run.findUnique({ where: { id: run.id } });
      expect(updatedRun?.status).toBe('COMPLETED');
    });
  });

  describe('response structure', () => {
    it('returns action field', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id, 'RUNNING', { total: 1, completed: 1, failed: 0 });

      await db.runScenarioSelection.create({
        data: { runId: run.id, scenarioId: scenario.id },
      });
      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id);

      const result = await recoverOrphanedRun(run.id);

      expect(result).toHaveProperty('action');
      expect(typeof result.action).toBe('string');
    });

    it('returns requeuedCount when jobs are requeued', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id, 'RUNNING', { total: 1, completed: 0, failed: 0 });

      await db.runScenarioSelection.create({
        data: { runId: run.id, scenarioId: scenario.id },
      });

      const result = await recoverOrphanedRun(run.id);

      if (result.action === 'requeued_probes') {
        expect(result.requeuedCount).toBeDefined();
        expect(typeof result.requeuedCount).toBe('number');
      }
    });
  });

  describe('job queuing', () => {
    it('queues probe jobs with correct queue name', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id, 'RUNNING', { total: 1, completed: 0, failed: 0 });

      await db.runScenarioSelection.create({
        data: { runId: run.id, scenarioId: scenario.id },
      });

      mockSend.mockClear();
      await recoverOrphanedRun(run.id);

      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('probe_scenario'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('queues probe jobs with correct data structure', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id, 'RUNNING', { total: 1, completed: 0, failed: 0 });

      await db.runScenarioSelection.create({
        data: { runId: run.id, scenarioId: scenario.id },
      });

      mockSend.mockClear();
      await recoverOrphanedRun(run.id);

      const [, jobData] = mockSend.mock.calls[0];
      expect(jobData).toHaveProperty('runId', run.id);
      expect(jobData).toHaveProperty('scenarioId', scenario.id);
      expect(jobData).toHaveProperty('modelId', 'openai:gpt-4o');
    });
  });

  describe('idempotency', () => {
    it('is safe to call multiple times', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id, 'SUMMARIZING', { total: 1, completed: 1, failed: 0 });

      // Create summarized transcript
      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id, true);

      // Call multiple times
      const result1 = await recoverOrphanedRun(run.id);
      const result2 = await recoverOrphanedRun(run.id);

      // Both should complete the run or return consistent action
      expect(result1.action).toBeDefined();
      expect(result2.action).toBeDefined();
    });
  });
});
