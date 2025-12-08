/**
 * Unit tests for summarize-transcript handler
 *
 * Tests summary generation and run completion logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@valuerank/db';

// Mock pg-boss types
type MockJob<T> = {
  id: string;
  data: T;
  retrycount?: number;
};

// Mock the spawn module
vi.mock('../../../src/queue/spawn.js', () => ({
  spawnPython: vi.fn(),
}));

// Import handler after mocking
import { createSummarizeTranscriptHandler } from '../../../src/queue/handlers/summarize-transcript.js';
import { spawnPython } from '../../../src/queue/spawn.js';

const mockSpawnPython = vi.mocked(spawnPython);

describe('summarize-transcript handler', () => {
  const createdIds = {
    definitions: [] as string[],
    runs: [] as string[],
    transcripts: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up in order: transcripts -> runs -> definitions
    if (createdIds.transcripts.length > 0) {
      await db.transcript.deleteMany({
        where: { id: { in: createdIds.transcripts } },
      });
      createdIds.transcripts = [];
    }
    if (createdIds.runs.length > 0) {
      await db.run.deleteMany({
        where: { id: { in: createdIds.runs } },
      });
      createdIds.runs = [];
    }
    if (createdIds.definitions.length > 0) {
      await db.definition.deleteMany({
        where: { id: { in: createdIds.definitions } },
      });
      createdIds.definitions = [];
    }
  });

  async function createTestData() {
    const definition = await db.definition.create({
      data: {
        name: 'Test Definition',
        content: { schema_version: 1, preamble: 'Test' },
      },
    });
    createdIds.definitions.push(definition.id);

    const run = await db.run.create({
      data: {
        definitionId: definition.id,
        status: 'SUMMARIZING',
        config: { models: ['test-model'] },
        progress: { total: 1, completed: 1, failed: 0 },
      },
    });
    createdIds.runs.push(run.id);

    const transcript = await db.transcript.create({
      data: {
        runId: run.id,
        modelId: 'test-model',
        content: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }],
        turnCount: 1,
        tokenCount: 50,
        durationMs: 1000,
      },
    });
    createdIds.transcripts.push(transcript.id);

    return { definition, run, transcript };
  }

  describe('successful summarization', () => {
    it('updates transcript with decision code and text', async () => {
      const { run, transcript } = await createTestData();

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: {
            decisionCode: '1',
            decisionText: 'AI prioritized safety over efficiency',
          },
        },
      });

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: run.id, transcriptId: transcript.id },
      };

      await handler([job] as Parameters<typeof handler>[0]);

      const updated = await db.transcript.findUnique({
        where: { id: transcript.id },
      });

      expect(updated?.decisionCode).toBe('1');
      expect(updated?.decisionText).toBe('AI prioritized safety over efficiency');
      expect(updated?.summarizedAt).not.toBeNull();
    });

    it('completes run when all transcripts are summarized', async () => {
      const { run, transcript } = await createTestData();

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: {
            decisionCode: '2',
            decisionText: 'AI chose balanced approach',
          },
        },
      });

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: run.id, transcriptId: transcript.id },
      };

      await handler([job] as Parameters<typeof handler>[0]);

      const updatedRun = await db.run.findUnique({
        where: { id: run.id },
      });

      expect(updatedRun?.status).toBe('COMPLETED');
      expect(updatedRun?.completedAt).not.toBeNull();
    });

    it('skips already summarized transcripts', async () => {
      const { run, transcript } = await createTestData();

      // Mark as already summarized
      await db.transcript.update({
        where: { id: transcript.id },
        data: {
          decisionCode: '3',
          decisionText: 'Already done',
          summarizedAt: new Date(),
        },
      });

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: run.id, transcriptId: transcript.id },
      };

      await handler([job] as Parameters<typeof handler>[0]);

      // spawn should not be called
      expect(mockSpawnPython).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('stores error in transcript for non-retryable errors', async () => {
      const { run, transcript } = await createTestData();

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: false,
          error: {
            message: 'Invalid model',
            code: 'INVALID_MODEL',
            retryable: false,
          },
        },
      });

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: run.id, transcriptId: transcript.id },
      };

      await handler([job] as Parameters<typeof handler>[0]);

      const updated = await db.transcript.findUnique({
        where: { id: transcript.id },
      });

      expect(updated?.decisionCode).toBe('error');
      expect(updated?.decisionText).toContain('Invalid model');
      expect(updated?.summarizedAt).not.toBeNull();
    });

    it('throws for retryable errors', async () => {
      const { run, transcript } = await createTestData();

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: false,
          error: {
            message: 'Rate limited',
            code: 'RATE_LIMIT',
            retryable: true,
          },
        },
      });

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: run.id, transcriptId: transcript.id },
      };

      await expect(handler([job] as Parameters<typeof handler>[0])).rejects.toThrow(
        'RATE_LIMIT: Rate limited'
      );
    });

    it('handles missing transcript gracefully', async () => {
      const { run } = await createTestData();

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: run.id, transcriptId: 'non-existent-id' },
      };

      // Should not throw - just complete the job
      await handler([job] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).not.toHaveBeenCalled();
    });

    it('stores error after max retries', async () => {
      const { run, transcript } = await createTestData();

      mockSpawnPython.mockRejectedValueOnce(new Error('Network error'));

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: run.id, transcriptId: transcript.id },
        retrycount: 3, // At retry limit
      };

      // Should not throw - stores error and completes
      await handler([job] as Parameters<typeof handler>[0]);

      const updated = await db.transcript.findUnique({
        where: { id: transcript.id },
      });

      expect(updated?.decisionCode).toBe('error');
      expect(updated?.decisionText).toContain('Network error');
    });
  });
});
