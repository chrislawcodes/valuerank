/**
 * Integration tests for transcript query helpers.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createTranscript,
  createTranscripts,
  getTranscriptById,
  getTranscriptWithContent,
  getTranscriptsForRun,
  getTranscriptsWithContentForRun,
  listTranscripts,
  getTranscriptStatsForRun,
  touchTranscript,
  touchTranscripts,
} from '../src/queries/transcripts.js';
import { createDefinition } from '../src/queries/definitions.js';
import { createRun } from '../src/queries/runs.js';
import type { TranscriptContent, DefinitionContent, RunConfig } from '../src/types.js';

const prisma = new PrismaClient();

// Skip tests if no database URL
const skipIfNoDb = process.env.DATABASE_URL ? describe : describe.skip;

// Helper to create a definition for tests
async function createTestDefinition() {
  const content: DefinitionContent = {
    schema_version: 1,
    preamble: 'Test preamble',
    template: 'Test template',
    dimensions: [],
  };
  return createDefinition({ name: 'Test Definition', content });
}

// Helper to create a run for tests
async function createTestRun(definitionId: string) {
  const config: RunConfig = {
    schema_version: 1,
    models: ['gpt-4', 'claude-3'],
  };
  return createRun({ definitionId, config });
}

// Helper to create valid transcript content
function createTranscriptContent(): TranscriptContent {
  return {
    schema_version: 1,
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ],
  };
}

skipIfNoDb('Transcript Queries (Integration)', () => {
  beforeEach(async () => {
    // Clean up test data in correct FK order
    await prisma.analysisResult.deleteMany();
    await prisma.runComparison.deleteMany();
    await prisma.runScenarioSelection.deleteMany();
    await prisma.transcript.deleteMany();
    await prisma.scenario.deleteMany();
    await prisma.run.deleteMany();
    await prisma.experiment.deleteMany();
    await prisma.definition.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('createTranscript', () => {
    it('creates a transcript with valid data', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const result = await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });

      expect(result.id).toBeDefined();
      expect(result.runId).toBe(run.id);
      expect(result.modelId).toBe('gpt-4');
      expect(result.turnCount).toBe(2);
    });

    it('creates a transcript with model version', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const result = await createTranscript({
        runId: run.id,
        modelId: 'gemini-1.5-pro',
        modelVersion: 'gemini-1.5-pro-002',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });

      expect(result.modelId).toBe('gemini-1.5-pro');
      expect(result.modelVersion).toBe('gemini-1.5-pro-002');
    });

    it('creates a transcript with definition snapshot', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const snapshot = { schema_version: 1, preamble: 'Snapshot' };
      const result = await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        definitionSnapshot: snapshot,
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });

      expect(result.definitionSnapshot).toEqual(snapshot);
    });

    it('throws on missing run ID', async () => {
      await expect(
        createTranscript({
          runId: '',
          modelId: 'gpt-4',
          content: createTranscriptContent(),
          turnCount: 2,
          tokenCount: 100,
          durationMs: 500,
        })
      ).rejects.toThrow('Run ID is required');
    });

    it('throws on missing model ID', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      await expect(
        createTranscript({
          runId: run.id,
          modelId: '',
          content: createTranscriptContent(),
          turnCount: 2,
          tokenCount: 100,
          durationMs: 500,
        })
      ).rejects.toThrow('Model ID is required');
    });

    it('throws on missing content', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      await expect(
        createTranscript({
          runId: run.id,
          modelId: 'gpt-4',
          content: undefined as unknown as TranscriptContent,
          turnCount: 2,
          tokenCount: 100,
          durationMs: 500,
        })
      ).rejects.toThrow('Transcript content is required');
    });
  });

  describe('createTranscripts', () => {
    it('creates multiple transcripts in batch', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const result = await createTranscripts([
        {
          runId: run.id,
          modelId: 'gpt-4',
          content: createTranscriptContent(),
          turnCount: 2,
          tokenCount: 100,
          durationMs: 500,
        },
        {
          runId: run.id,
          modelId: 'claude-3',
          content: createTranscriptContent(),
          turnCount: 3,
          tokenCount: 150,
          durationMs: 600,
        },
      ]);

      expect(result.count).toBe(2);

      const transcripts = await listTranscripts({ runId: run.id });
      expect(transcripts.length).toBe(2);
    });

    it('returns zero count for empty array', async () => {
      const result = await createTranscripts([]);
      expect(result.count).toBe(0);
    });
  });

  describe('getTranscriptById', () => {
    it('returns transcript when exists', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);
      const created = await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });

      const result = await getTranscriptById(created.id);

      expect(result.id).toBe(created.id);
      expect(result.modelId).toBe('gpt-4');
    });

    it('throws NotFoundError when not exists', async () => {
      await expect(getTranscriptById('non-existent-id')).rejects.toThrow(
        'Transcript not found: non-existent-id'
      );
    });
  });

  describe('getTranscriptWithContent', () => {
    it('returns transcript with parsed content', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);
      const created = await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });

      const result = await getTranscriptWithContent(created.id);

      expect(result.parsedContent.schema_version).toBe(1);
      expect(result.parsedContent.messages).toHaveLength(2);
      expect(result.parsedContent.messages[0].role).toBe('user');
    });
  });

  describe('getTranscriptsForRun', () => {
    it('returns all transcripts for a run', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });
      await createTranscript({
        runId: run.id,
        modelId: 'claude-3',
        content: createTranscriptContent(),
        turnCount: 3,
        tokenCount: 150,
        durationMs: 600,
      });

      const result = await getTranscriptsForRun(run.id);

      expect(result.length).toBe(2);
    });

    it('returns empty array for run with no transcripts', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const result = await getTranscriptsForRun(run.id);

      expect(result.length).toBe(0);
    });
  });

  describe('getTranscriptsWithContentForRun', () => {
    it('returns transcripts with parsed content', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });

      const result = await getTranscriptsWithContentForRun(run.id);

      expect(result.length).toBe(1);
      expect(result[0].parsedContent.messages).toHaveLength(2);
    });
  });

  describe('listTranscripts', () => {
    it('returns all transcripts without filters', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });

      const result = await listTranscripts();

      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by runId', async () => {
      const definition = await createTestDefinition();
      const run1 = await createTestRun(definition.id);
      const run2 = await createTestRun(definition.id);

      await createTranscript({
        runId: run1.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });
      await createTranscript({
        runId: run2.id,
        modelId: 'claude-3',
        content: createTranscriptContent(),
        turnCount: 3,
        tokenCount: 150,
        durationMs: 600,
      });

      const result = await listTranscripts({ runId: run1.id });

      expect(result.length).toBe(1);
      expect(result[0].runId).toBe(run1.id);
    });

    it('filters by modelId', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });
      await createTranscript({
        runId: run.id,
        modelId: 'claude-3',
        content: createTranscriptContent(),
        turnCount: 3,
        tokenCount: 150,
        durationMs: 600,
      });

      const result = await listTranscripts({ modelId: 'gpt-4' });

      expect(result.every((t) => t.modelId === 'gpt-4')).toBe(true);
    });

    it('supports pagination', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      for (let i = 0; i < 5; i++) {
        await createTranscript({
          runId: run.id,
          modelId: `model-${i}`,
          content: createTranscriptContent(),
          turnCount: 2,
          tokenCount: 100,
          durationMs: 500,
        });
      }

      const page1 = await listTranscripts({ limit: 2, offset: 0 });
      const page2 = await listTranscripts({ limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
    });
  });

  describe('getTranscriptStatsForRun', () => {
    it('returns correct statistics', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });
      await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 4,
        tokenCount: 200,
        durationMs: 700,
      });
      await createTranscript({
        runId: run.id,
        modelId: 'claude-3',
        content: createTranscriptContent(),
        turnCount: 3,
        tokenCount: 150,
        durationMs: 600,
      });

      const stats = await getTranscriptStatsForRun(run.id);

      expect(stats.count).toBe(3);
      expect(stats.totalTokens).toBe(450);
      expect(stats.totalDurationMs).toBe(1800);
      expect(stats.avgTurns).toBe(3);
      expect(stats.modelCounts['gpt-4']).toBe(2);
      expect(stats.modelCounts['claude-3']).toBe(1);
    });

    it('returns zero stats for empty run', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const stats = await getTranscriptStatsForRun(run.id);

      expect(stats.count).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.avgTurns).toBe(0);
    });
  });

  describe('Access Tracking', () => {
    it('touchTranscript updates lastAccessedAt', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);
      const transcript = await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });

      expect(transcript.lastAccessedAt).toBeNull();

      await touchTranscript(transcript.id);

      const updated = await getTranscriptById(transcript.id);
      expect(updated.lastAccessedAt).not.toBeNull();
    });

    it('touchTranscripts updates multiple transcripts', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const t1 = await createTranscript({
        runId: run.id,
        modelId: 'gpt-4',
        content: createTranscriptContent(),
        turnCount: 2,
        tokenCount: 100,
        durationMs: 500,
      });
      const t2 = await createTranscript({
        runId: run.id,
        modelId: 'claude-3',
        content: createTranscriptContent(),
        turnCount: 3,
        tokenCount: 150,
        durationMs: 600,
      });

      await touchTranscripts([t1.id, t2.id]);

      const updated1 = await getTranscriptById(t1.id);
      const updated2 = await getTranscriptById(t2.id);

      expect(updated1.lastAccessedAt).not.toBeNull();
      expect(updated2.lastAccessedAt).not.toBeNull();
    });

    it('touchTranscripts handles empty array', async () => {
      await touchTranscripts([]);
      // Should not throw
    });
  });
});
