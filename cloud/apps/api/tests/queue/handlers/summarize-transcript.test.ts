/**
 * Unit tests for summarize-transcript handler
 *
 * Tests summary generation and run completion logic.
 */

import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@valuerank/db';
import { config } from '../../../src/config.js';

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
    scenarios: [] as string[],
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
    if (createdIds.scenarios.length > 0) {
      await db.scenario.deleteMany({
        where: { id: { in: createdIds.scenarios } },
      });
      createdIds.scenarios = [];
    }
    if (createdIds.definitions.length > 0) {
      await db.definition.deleteMany({
        where: { id: { in: createdIds.definitions } },
      });
      createdIds.definitions = [];
    }
  });

  function computeResponseSha256(content: { turns: Array<{ targetResponse?: string }> }): string {
    const responseText = content.turns
      .map((turn) => turn.targetResponse ?? '')
      .filter((response) => response.length > 0)
      .join('\n')
      .trim();

    return crypto.createHash('sha256').update(responseText, 'utf8').digest('hex');
  }

  function buildSuccessfulWorkerSummary(
    content: { turns: Array<{ targetResponse?: string }> },
    options?: {
    decisionCode?: string;
    decisionSource?: string;
    decisionText?: string | null;
    decisionMetadata?: Record<string, unknown>;
      parserVersion?: string;
    }
  ) {
    const responseSha256 = computeResponseSha256(content);
    return {
      decisionCode: options?.decisionCode ?? '4',
      decisionSource: options?.decisionSource ?? 'deterministic',
      decisionText: options?.decisionText ?? 'AI prioritized safety over efficiency',
      decisionMetadata: options?.decisionMetadata ?? {
        matchedText: 'Achievement',
        matchedLabel: 'Achievement',
        parseClass: 'exact',
        parsePath: 'numeric_deterministic',
        parserVersion: options?.parserVersion ?? config.SUMMARIZE_PARSER_VERSION,
        responseSha256,
        responseExcerpt: 'Achievement',
      },
    };
  }

  async function createTestData(options?: {
    content?: { turns: Array<{ probePrompt?: string; targetResponse?: string }> };
    decisionMetadata?: unknown;
    decisionCode?: string | null;
    decisionCodeSource?: string | null;
    decisionText?: string | null;
    summarizedAt?: Date | null;
  }) {
    const content =
      options?.content ??
      {
        turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }],
      };

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
        content,
        turnCount: 1,
        tokenCount: 50,
        durationMs: 1000,
        decisionCode: options?.decisionCode ?? null,
        decisionCodeSource: options?.decisionCodeSource ?? null,
        decisionText: options?.decisionText ?? null,
        decisionMetadata: options?.decisionMetadata ?? undefined,
        summarizedAt: options?.summarizedAt ?? null,
      },
    });
    createdIds.transcripts.push(transcript.id);

    return { definition, run, transcript, content };
  }

  describe('successful summarization', () => {
    it('updates transcript with summary metadata and text', async () => {
      const { run, transcript } = await createTestData();

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: {
            decisionCode: '1',
            decisionText: 'AI prioritized safety over efficiency',
            decisionMetadata: {
              matchedText: 'Achievement',
              matchedLabel: 'Achievement',
              parseClass: 'exact',
              parsePath: 'exact.favor_first.strong',
              parserVersion: 'parser-1',
              responseExcerpt: 'Achievement',
            },
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

      expect(updated?.decisionText).toBe('AI prioritized safety over efficiency');
      expect(updated?.summarizedAt).not.toBeNull();
      expect(updated?.decisionMetadata).toMatchObject({
        rawDecisionEvidence: {
          matchedText: 'Achievement',
          matchedLabel: 'Achievement',
          parseClass: 'exact',
          parsePath: 'exact.favor_first.strong',
          parserVersion: 'parser-1',
          responseExcerpt: 'Achievement',
          manualOverride: null,
        },
      });
    });

    it('stores a winner-first cache for a B-first transcript', async () => {
      const definition = await db.definition.create({
        data: {
          name: `Transcript Cache Definition ${Date.now()}`,
          content: {
            schema_version: 1,
            dimensions: [
              { name: 'Achievement' },
              { name: 'Benevolence_Dependability' },
            ],
          },
        },
      });
      createdIds.definitions.push(definition.id);

      const run = await db.run.create({
        data: {
          definitionId: definition.id,
          status: 'SUMMARIZING',
          config: { models: ['test-model'] },
          progress: { total: 1, completed: 0, failed: 0 },
        },
      });
      createdIds.runs.push(run.id);

      const scenario = await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: 'Transcript Cache Scenario',
          orientationFlipped: true,
          content: { dimensions: { stakes: 'high' } },
        },
      });
      createdIds.scenarios.push(scenario.id);

      const transcript = await db.transcript.create({
        data: {
          runId: run.id,
          scenarioId: scenario.id,
          modelId: 'test-model',
          content: {
            turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }],
          },
          definitionSnapshot: {
            dimensions: [
              { name: 'Achievement' },
              { name: 'Benevolence_Dependability' },
            ],
            methodology: {
              presentation_order: 'B_first',
            },
          },
          turnCount: 1,
          tokenCount: 50,
          durationMs: 1000,
        },
      });
      createdIds.transcripts.push(transcript.id);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(
            {
              turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }],
            },
            {
              decisionCode: '1',
              decisionText: 'AI strongly preferred the first option',
              decisionMetadata: {
                matchedText: 'Achievement',
                matchedLabel: 'Achievement',
                parseClass: 'exact',
                parsePath: 'exact.favor_first.strong',
                parserVersion: 'parser-1',
                responseExcerpt: 'Achievement',
              },
            },
          ),
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

      expect(updated?.decisionMetadata).toMatchObject({
        summaryCache: {
          summary: {
            canonicalDecision: {
              cacheVersion: 1,
              decisionState: 'resolved',
              favoredValueKey: 'Benevolence_Dependability',
              strength: 'strong',
            },
          },
        },
      });
    });

    it('batches multiple transcripts into one Python spawn', async () => {
      const first = await createTestData();
      const second = await createTestData();
      const summaryModelId = 'anthropic:test-summary-model';

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summaries: [
            {
              transcriptId: first.transcript.id,
              batchIndex: 0,
              success: true,
              summary: buildSuccessfulWorkerSummary(first.content, {
                decisionCode: '1',
              }),
            },
            {
              transcriptId: second.transcript.id,
              batchIndex: 1,
              success: true,
              summary: buildSuccessfulWorkerSummary(second.content, {
                decisionCode: '2',
              }),
            },
          ],
        },
      });

      const handler = createSummarizeTranscriptHandler();
      const jobs: Array<MockJob<{ runId: string; transcriptId: string }>> = [
        {
          id: 'test-job-id-1',
          data: { runId: first.run.id, transcriptId: first.transcript.id, summaryModelId },
        },
        {
          id: 'test-job-id-2',
          data: { runId: second.run.id, transcriptId: second.transcript.id, summaryModelId },
        },
      ];

      await handler(jobs as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
      expect(mockSpawnPython).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          transcripts: [
            expect.objectContaining({
              transcriptId: first.transcript.id,
              modelId: summaryModelId,
            }),
            expect.objectContaining({
              transcriptId: second.transcript.id,
              modelId: summaryModelId,
            }),
          ],
        }),
        expect.objectContaining({
          cwd: expect.any(String),
        }),
      );
    });

    it('preserves non-object decision metadata without corrupting JSON shape', async () => {
      const { run, transcript } = await createTestData();

      const legacyMetadata = ['legacy', 'metadata'] as unknown as never;

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: {
            decisionCode: '1',
            decisionText: 'AI prioritized safety over efficiency',
            decisionMetadata: legacyMetadata,
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

      expect(updated?.decisionMetadata).toEqual(legacyMetadata);
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

  describe('cache behavior', () => {
    const summaryModelId = 'anthropic:test-summary-model';

    function cloneJson<T>(value: T): T {
      return JSON.parse(JSON.stringify(value));
    }

    function makeJob(runId: string, transcriptId: string, forceSummarize = false) {
      return {
        id: 'test-job-id',
        data: {
          runId,
          transcriptId,
          summaryModelId,
          ...(forceSummarize ? { forceSummarize: true } : {}),
        },
      };
    }

    async function runWorkerWithSummary(
      runId: string,
      transcriptId: string,
      content: { turns: Array<{ targetResponse?: string }> },
      summary?: ReturnType<typeof buildSuccessfulWorkerSummary>
    ) {
      const handler = createSummarizeTranscriptHandler();
      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: summary ?? buildSuccessfulWorkerSummary(content),
        },
      });
      await handler([makeJob(runId, transcriptId)] as Parameters<typeof handler>[0]);
    }

    async function seedCacheFromFreshRun() {
      const first = await createTestData();
      const firstSummary = buildSuccessfulWorkerSummary(first.content);

      await runWorkerWithSummary(first.run.id, first.transcript.id, first.content, firstSummary);

      const freshTranscript = await db.transcript.findUnique({
        where: { id: first.transcript.id },
      });

      if (!freshTranscript?.decisionMetadata) {
        throw new Error('Fresh transcript missing decision metadata');
      }

      mockSpawnPython.mockClear();

      return {
        first,
        freshTranscript,
      };
    }

    it('reuses the cached summary for an unchanged transcript', async () => {
      const { first, freshTranscript } = await seedCacheFromFreshRun();

      mockSpawnPython.mockClear();
      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(first.run.id, first.transcript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).not.toHaveBeenCalled();

      const cachedTranscript = await db.transcript.findUnique({
        where: { id: first.transcript.id },
      });

      expect(cachedTranscript?.decisionText).toBe(freshTranscript.decisionText);
      expect(cachedTranscript?.decisionMetadata).toEqual(freshTranscript.decisionMetadata);
      expect(cachedTranscript?.summarizedAt).not.toBeNull();
    });

    it('re-runs summarization when transcript content changes', async () => {
      const { first, freshTranscript } = await seedCacheFromFreshRun();
      const changedContent = {
        turns: [{ probePrompt: 'Test prompt', targetResponse: 'Different response' }],
      };

      await db.transcript.update({
        where: { id: first.transcript.id },
        data: { content: changedContent, decisionMetadata: cloneJson(freshTranscript.decisionMetadata) },
      });

      const handler = createSummarizeTranscriptHandler();
      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(changedContent, {
            decisionCode: '2',
            decisionText: 'AI chose balanced approach',
          }),
        },
      });

      await handler([makeJob(first.run.id, first.transcript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);

      const updated = await db.transcript.findUnique({
        where: { id: first.transcript.id },
      });

      expect(updated?.decisionText).toBe('AI chose balanced approach');
      expect(updated?.summarizedAt).not.toBeNull();
    });

    it('re-runs summarization when parser version changes', async () => {
      const { first, freshTranscript } = await seedCacheFromFreshRun();
      const changedMetadata = cloneJson(freshTranscript.decisionMetadata) as any;
      changedMetadata.summaryCache.parserVersion = 'parser-legacy';
      await db.transcript.update({
        where: { id: freshTranscript.id },
        data: {
          decisionMetadata: changedMetadata,
          summarizedAt: new Date(),
        },
      });

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(first.content, {
            decisionCode: '3',
            decisionText: 'AI chose a middle path',
          }),
        },
      });

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(freshTranscript.runId, freshTranscript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
    });

    it('re-runs summarization when model changes', async () => {
      const { first, freshTranscript } = await seedCacheFromFreshRun();
      const changedMetadata = cloneJson(freshTranscript.decisionMetadata) as any;
      changedMetadata.summaryCache.modelId = 'anthropic:other-model';
      await db.transcript.update({
        where: { id: freshTranscript.id },
        data: {
          decisionMetadata: changedMetadata,
          summarizedAt: new Date(),
        },
      });

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(first.content, {
            decisionCode: '1',
            decisionText: 'AI chose the opposite side',
          }),
        },
      });

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(freshTranscript.runId, freshTranscript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
    });

    it('re-runs summarization when the cached winner-first version is stale', async () => {
      const { first, freshTranscript } = await seedCacheFromFreshRun();
      const changedMetadata = cloneJson(freshTranscript.decisionMetadata) as any;
      changedMetadata.summaryCache.summary.canonicalDecision.cacheVersion = 0;
      await db.transcript.update({
        where: { id: freshTranscript.id },
        data: {
          decisionMetadata: changedMetadata,
          summarizedAt: new Date(),
        },
      });

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(first.content, {
            decisionCode: '1',
            decisionText: 'AI chose the opposite side',
          }),
        },
      });

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(freshTranscript.runId, freshTranscript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
    });

    it('bypasses the cache when forceSummarize is set', async () => {
      const { first } = await seedCacheFromFreshRun();

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(first.content, {
            decisionCode: '5',
            decisionText: 'AI strongly preferred the first option',
          }),
        },
      });

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(first.run.id, first.transcript.id, true)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
    });

    it.each([
      'missing summary payload',
      'error summary payload',
    ])('falls back to the worker when the cache is malformed (%s)', async (caseName) => {
      const { first, freshTranscript } = await seedCacheFromFreshRun();
      const malformedMetadata = cloneJson(freshTranscript.decisionMetadata) as any;
      if (caseName === 'missing summary payload') {
        malformedMetadata.summaryCache = {
          responseSha256: malformedMetadata.summaryCache.responseSha256,
          parserVersion: malformedMetadata.summaryCache.parserVersion,
          modelId: malformedMetadata.summaryCache.modelId,
        };
      } else {
        malformedMetadata.summaryCache.summary.decisionCode = 'error';
      }

      await db.transcript.update({
        where: { id: freshTranscript.id },
        data: { decisionMetadata: malformedMetadata, summarizedAt: new Date() },
      });

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(first.content, {
            decisionCode: '4',
            decisionText: 'AI prioritized safety over efficiency',
          }),
        },
      });

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(freshTranscript.runId, freshTranscript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
    });

    it('falls back to the worker when the cache is missing', async () => {
      const missing = await createTestData();

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(missing.content),
        },
      });

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(missing.run.id, missing.transcript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
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

      expect(updated?.decisionText).toContain('Invalid model');
      expect(updated?.decisionMetadata).toBeNull();
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

      expect(updated?.decisionText).toContain('Network error');
      expect(updated?.decisionMetadata).toBeNull();
    });
  });
});
