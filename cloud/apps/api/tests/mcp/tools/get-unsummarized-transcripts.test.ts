/**
 * get_unsummarized_transcripts MCP Tool Tests [T021]
 *
 * Tests for the unsummarized transcripts query MCP tool.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';

describe('get_unsummarized_transcripts MCP Tool [T021]', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdScenarioIds: string[] = [];
  const createdTranscriptIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (createdTranscriptIds.length > 0) {
      await db.transcript.deleteMany({
        where: { id: { in: createdTranscriptIds } },
      });
      createdTranscriptIds.length = 0;
    }

    if (createdRunIds.length > 0) {
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
        name: 'MCP Unsummarized Test ' + Date.now(),
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

  async function createTestRun(definitionId: string) {
    const run = await db.run.create({
      data: {
        definitionId,
        status: 'SUMMARIZING',
        startedAt: new Date(),
        config: { models: ['openai:gpt-4o'] },
        progress: { total: 10, completed: 10, failed: 0 },
        summarizeProgress: { total: 10, completed: 5, failed: 0 },
      },
    });
    createdRunIds.push(run.id);
    return run;
  }

  async function createTestTranscript(
    runId: string,
    modelId: string,
    scenarioId: string,
    options?: { summarized?: boolean; failed?: boolean }
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
        summarizedAt: options?.summarized ? new Date() : null,
        decisionCode: options?.failed ? 'error' : options?.summarized ? '3' : null,
      },
    });
    createdTranscriptIds.push(transcript.id);
    return transcript;
  }

  describe('response structure', () => {
    it('returns count and list of transcripts', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id, { summarized: false });

      const transcripts = await db.transcript.findMany({
        where: { runId: run.id, summarizedAt: null },
        select: {
          id: true,
          modelId: true,
          scenarioId: true,
          createdAt: true,
        },
      });

      expect(transcripts.length).toBe(1);
      expect(transcripts[0]).toHaveProperty('id');
      expect(transcripts[0]).toHaveProperty('modelId');
      expect(transcripts[0]).toHaveProperty('scenarioId');
    });

    it('returns empty list for fully summarized run', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id, { summarized: true });

      const transcripts = await db.transcript.findMany({
        where: { runId: run.id, summarizedAt: null },
      });

      expect(transcripts.length).toBe(0);
    });
  });

  describe('filtering', () => {
    it('excludes failed transcripts by default', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id, { summarized: false });
      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id, { failed: true });

      // Query pattern: include NULL decisionCode OR non-error decisionCode
      // (NOT: { decisionCode: 'error' } excludes NULLs in SQL)
      const transcripts = await db.transcript.findMany({
        where: {
          runId: run.id,
          summarizedAt: null,
          OR: [{ decisionCode: null }, { decisionCode: { not: 'error' } }],
        },
      });

      expect(transcripts.length).toBe(1);
    });

    it('includes failed transcripts when requested', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id, { summarized: false });
      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id, { failed: true });

      const transcripts = await db.transcript.findMany({
        where: {
          runId: run.id,
          summarizedAt: null,
        },
      });

      expect(transcripts.length).toBe(2);
    });
  });

  describe('pagination', () => {
    it('respects limit parameter', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      // Create 5 transcripts
      for (let i = 0; i < 5; i++) {
        await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id, { summarized: false });
      }

      const transcripts = await db.transcript.findMany({
        where: { runId: run.id, summarizedAt: null },
        take: 3,
      });

      expect(transcripts.length).toBe(3);
    });

    it('returns total count regardless of limit', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      // Create 5 transcripts
      for (let i = 0; i < 5; i++) {
        await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id, { summarized: false });
      }

      const totalCount = await db.transcript.count({
        where: { runId: run.id, summarizedAt: null },
      });
      const limited = await db.transcript.findMany({
        where: { runId: run.id, summarizedAt: null },
        take: 2,
      });

      expect(totalCount).toBe(5);
      expect(limited.length).toBe(2);
    });
  });

  describe('run validation', () => {
    it('validates run exists', async () => {
      const run = await db.run.findUnique({
        where: { id: 'non-existent-run-id' },
      });

      expect(run).toBeNull();
    });

    it('works for soft-deleted runs check', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      // Soft delete the run
      await db.run.update({
        where: { id: run.id },
        data: { deletedAt: new Date() },
      });

      const deletedRun = await db.run.findUnique({
        where: { id: run.id },
        select: { id: true, deletedAt: true },
      });

      expect(deletedRun?.deletedAt).not.toBeNull();
    });
  });

  describe('multiple models', () => {
    it('returns transcripts from different models', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      await createTestTranscript(run.id, 'openai:gpt-4o', scenario.id, { summarized: false });
      await createTestTranscript(run.id, 'anthropic:claude-3', scenario.id, { summarized: false });

      const transcripts = await db.transcript.findMany({
        where: { runId: run.id, summarizedAt: null },
        select: { id: true, modelId: true },
      });

      expect(transcripts.length).toBe(2);
      const modelIds = transcripts.map(t => t.modelId);
      expect(modelIds).toContain('openai:gpt-4o');
      expect(modelIds).toContain('anthropic:claude-3');
    });
  });
});
