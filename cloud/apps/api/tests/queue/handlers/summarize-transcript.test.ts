/**
 * Unit tests for summarize-transcript handler
 *
 * Tests the handler's contract with its collaborators: which persistence
 * call it makes for each input (cache hit, cache miss, success, failure),
 * what it passes to the Python worker, and how it decides to skip/spawn.
 *
 * This file does NOT hit the database. End-to-end state (transcript updates,
 * run completion side effects, cache record shape) is covered separately in
 * summarize-persistence.test.ts, which owns the persistence layer.
 */

import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SummaryCache } from '@valuerank/db';
import { config } from '../../../src/config.js';

// These vi.mock() calls are hoisted above all imports by Vitest's transform,
// so they register before the handler module (and its transitive imports)
// are evaluated. Keep mock factories self-contained — they run before the
// surrounding file body, including the `vi` import.
vi.mock('@valuerank/db', () => ({
  db: {
    transcript: {
      findUnique: vi.fn(),
    },
    scenario: {
      findUnique: vi.fn(),
    },
  },
  Prisma: { DbNull: null },
}));

vi.mock('../../../src/queue/spawn.js', () => ({
  spawnPython: vi.fn(),
}));

vi.mock('../../../src/queue/handlers/summarize-persistence.js', () => ({
  persistCachedSummary: vi.fn(async () => undefined),
  persistSuccessfulSummary: vi.fn(async () => undefined),
  persistSummarizeFailure: vi.fn(async () => false),
  isCacheRecordMatch: vi.fn(() => false),
}));

vi.mock('../../../src/services/infra-models.js', () => ({
  getSummarizerModel: vi.fn(),
}));

vi.mock('../../../src/services/summarization-parallelism/index.js', () => ({
  getMaxParallelSummarizations: vi.fn(async () => 4),
}));

vi.mock('../../../src/services/rate-limiter/index.js', () => ({
  schedule: vi.fn(
    async (
      _provider: string,
      _label: string,
      _runId: string,
      _modelId: string,
      _transcriptId: string,
      fn: () => Promise<unknown>,
    ) => fn(),
  ),
  getLimiterStats: vi.fn(() => ({
    activeJobs: 0,
    queuedJobs: 0,
    maxParallel: 1,
    requestsPerMinute: 60,
  })),
}));

vi.mock('../../../src/graphql/queries/domain/shared.js', () => ({
  resolveTranscriptDecisionModel: vi.fn(() => ({
    canonical: {
      direction: 'unknown',
      strength: 'unknown',
      favoredValueKey: null,
    },
  })),
}));

// Static imports resolve to the mocked modules above.
import { db } from '@valuerank/db';
import { createSummarizeTranscriptHandler } from '../../../src/queue/handlers/summarize-transcript.js';
import { spawnPython } from '../../../src/queue/spawn.js';
import {
  persistCachedSummary,
  persistSuccessfulSummary,
  persistSummarizeFailure,
  isCacheRecordMatch,
} from '../../../src/queue/handlers/summarize-persistence.js';
import { getSummarizerModel } from '../../../src/services/infra-models.js';
import { resolveTranscriptDecisionModel } from '../../../src/graphql/queries/domain/shared.js';

const mockSpawnPython = vi.mocked(spawnPython);
const mockFindUnique = vi.mocked(db.transcript.findUnique);
const mockScenarioFindUnique = vi.mocked(db.scenario.findUnique);
const mockPersistCached = vi.mocked(persistCachedSummary);
const mockPersistSuccess = vi.mocked(persistSuccessfulSummary);
const mockPersistFailure = vi.mocked(persistSummarizeFailure);
const mockIsCacheRecordMatch = vi.mocked(isCacheRecordMatch);
const mockGetSummarizerModel = vi.mocked(getSummarizerModel);
const mockResolveTranscriptDecisionModel = vi.mocked(resolveTranscriptDecisionModel);

type MockJob<T> = {
  id: string;
  data: T;
  retrycount?: number;
};

type TranscriptShape = {
  id: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  content: unknown;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  decisionCode: string | null;
  decisionCodeSource: string | null;
  decisionText: string | null;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  summarizedAt: Date | null;
};

function makeTranscript(overrides: Partial<TranscriptShape> = {}): TranscriptShape {
  return {
    id: 'transcript-1',
    runId: 'run-1',
    scenarioId: null,
    modelId: 'test-model',
    content: {
      turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }],
    },
    turnCount: 1,
    tokenCount: 50,
    durationMs: 1000,
    decisionCode: null,
    decisionCodeSource: null,
    decisionText: null,
    decisionMetadata: null,
    definitionSnapshot: null,
    summarizedAt: null,
    ...overrides,
  };
}

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
  },
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

function makeValidSummaryCache(content: { turns: Array<{ targetResponse?: string }> }): SummaryCache {
  return {
    responseSha256: computeResponseSha256(content),
    parserVersion: config.SUMMARIZE_PARSER_VERSION,
    modelId: 'anthropic:test-summary-model',
    summary: {
      decisionCode: '4',
      decisionCodeSource: 'deterministic',
      decisionText: 'Cached decision',
      decisionMetadata: {
        matchedText: 'Achievement',
        matchedLabel: 'Achievement',
        parseClass: 'exact',
        parsePath: 'numeric_deterministic',
        parserVersion: config.SUMMARIZE_PARSER_VERSION,
        responseExcerpt: 'Achievement',
      },
      canonicalDecision: {
        cacheVersion: 1,
        decisionState: 'resolved',
        favoredValueKey: 'Achievement',
        strength: 'strong',
      },
    },
  } as SummaryCache;
}

describe('summarize-transcript handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSummarizerModel.mockResolvedValue({
      modelId: 'test-summary-model',
      providerId: 'provider-id',
      providerName: 'anthropic',
      displayName: 'Test Summary Model',
      apiConfig: null,
    });
    mockIsCacheRecordMatch.mockReturnValue(false);
    mockPersistFailure.mockResolvedValue(false);
    mockResolveTranscriptDecisionModel.mockReturnValue({
      canonical: {
        direction: 'unknown',
        strength: 'unknown',
        favoredValueKey: null,
      },
    } as ReturnType<typeof resolveTranscriptDecisionModel>);
  });

  describe('successful summarization', () => {
    it('passes worker summary to persistSuccessfulSummary', async () => {
      const transcript = makeTranscript();
      mockFindUnique.mockResolvedValueOnce(transcript as never);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: {
            decisionCode: '1',
            decisionSource: 'deterministic',
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
      } as never);

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: transcript.runId, transcriptId: transcript.id },
      };

      await handler([job] as Parameters<typeof handler>[0]);

      expect(mockPersistSuccess).toHaveBeenCalledTimes(1);
      const call = mockPersistSuccess.mock.calls[0];
      if (!call) throw new Error('expected persistSuccessfulSummary call');
      const summaryArg = call[6];
      expect(summaryArg.decisionText).toBe('AI prioritized safety over efficiency');
      expect(summaryArg.decisionMetadata).toMatchObject({
        matchedText: 'Achievement',
        parsePath: 'exact.favor_first.strong',
      });
    });

    it('builds a resolved winner-first cache for a paired scenario', async () => {
      const transcript = makeTranscript({
        scenarioId: 'scenario-1',
        definitionSnapshot: {
          dimensions: [{ name: 'Achievement' }, { name: 'Benevolence_Dependability' }],
          methodology: { presentation_order: 'B_first' },
        },
      });
      mockFindUnique.mockResolvedValueOnce(transcript as never);
      mockScenarioFindUnique.mockResolvedValueOnce({ orientationFlipped: true } as never);
      mockResolveTranscriptDecisionModel.mockReturnValueOnce({
        canonical: {
          direction: 'favor_first',
          strength: 'strong',
          favoredValueKey: 'Benevolence_Dependability',
        },
      } as ReturnType<typeof resolveTranscriptDecisionModel>);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(
            { turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }] },
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
      } as never);

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: transcript.runId, transcriptId: transcript.id },
      };

      await handler([job] as Parameters<typeof handler>[0]);

      expect(mockScenarioFindUnique).toHaveBeenCalledWith({
        where: { id: 'scenario-1' },
        select: { orientationFlipped: true },
      });
      expect(mockResolveTranscriptDecisionModel).toHaveBeenCalledWith(
        expect.objectContaining({
          orientationFlipped: true,
        }),
      );

      expect(mockPersistSuccess).toHaveBeenCalledTimes(1);
      const call = mockPersistSuccess.mock.calls[0];
      if (!call) throw new Error('expected persistSuccessfulSummary call');
      expect(call[5]).toEqual({
        cacheVersion: 2,
        decisionState: 'resolved',
        favoredValueKey: 'Benevolence_Dependability',
        strength: 'strong',
      });
    });

    it('batches multiple transcripts into one Python spawn', async () => {
      const first = makeTranscript({ id: 'transcript-1', runId: 'run-a' });
      const second = makeTranscript({ id: 'transcript-2', runId: 'run-b' });
      const summaryModelId = 'anthropic:test-summary-model';

      mockFindUnique
        .mockResolvedValueOnce(first as never)
        .mockResolvedValueOnce(second as never);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summaries: [
            {
              transcriptId: first.id,
              batchIndex: 0,
              success: true,
              summary: buildSuccessfulWorkerSummary(
                first.content as { turns: Array<{ targetResponse?: string }> },
                { decisionCode: '1' },
              ),
            },
            {
              transcriptId: second.id,
              batchIndex: 1,
              success: true,
              summary: buildSuccessfulWorkerSummary(
                second.content as { turns: Array<{ targetResponse?: string }> },
                { decisionCode: '2' },
              ),
            },
          ],
        },
      } as never);

      const handler = createSummarizeTranscriptHandler();
      const jobs: Array<MockJob<{ runId: string; transcriptId: string; summaryModelId: string }>> = [
        {
          id: 'test-job-id-1',
          data: { runId: first.runId, transcriptId: first.id, summaryModelId },
        },
        {
          id: 'test-job-id-2',
          data: { runId: second.runId, transcriptId: second.id, summaryModelId },
        },
      ];

      await handler(jobs as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
      expect(mockSpawnPython).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          transcripts: [
            expect.objectContaining({
              transcriptId: first.id,
              modelId: summaryModelId,
            }),
            expect.objectContaining({
              transcriptId: second.id,
              modelId: summaryModelId,
            }),
          ],
        }),
        expect.objectContaining({ cwd: expect.any(String) }),
      );
      expect(mockPersistSuccess).toHaveBeenCalledTimes(2);
    });

    it('preserves non-object decision metadata as-is on the handler contract', async () => {
      const transcript = makeTranscript();
      mockFindUnique.mockResolvedValueOnce(transcript as never);

      const legacyMetadata = ['legacy', 'metadata'] as unknown;

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: {
            decisionCode: '1',
            decisionSource: 'deterministic',
            decisionText: 'AI prioritized safety over efficiency',
            decisionMetadata: legacyMetadata,
          },
        },
      } as never);

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: transcript.runId, transcriptId: transcript.id },
      };

      await handler([job] as Parameters<typeof handler>[0]);

      expect(mockPersistSuccess).toHaveBeenCalledTimes(1);
      const call = mockPersistSuccess.mock.calls[0];
      if (!call) throw new Error('expected persistSuccessfulSummary call');
      expect(call[6].decisionMetadata).toEqual(legacyMetadata);
    });

    it('delegates run completion to persistSuccessfulSummary (which owns maybeCompleteRun)', async () => {
      // Run completion / status transition is tested in summarize-persistence.test.ts.
      // At the handler layer the contract is simply: call persistSuccessfulSummary
      // for every successful worker result so the persistence layer can decide.
      const transcript = makeTranscript();
      mockFindUnique.mockResolvedValueOnce(transcript as never);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: {
            decisionCode: '2',
            decisionSource: 'deterministic',
            decisionText: 'AI chose balanced approach',
          },
        },
      } as never);

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: transcript.runId, transcriptId: transcript.id },
      };

      await handler([job] as Parameters<typeof handler>[0]);

      expect(mockPersistSuccess).toHaveBeenCalledTimes(1);
      expect(mockPersistFailure).not.toHaveBeenCalled();
    });

    it('skips already-summarized transcripts with no cache field', async () => {
      const transcript = makeTranscript({
        decisionCode: '3',
        decisionText: 'Already done',
        summarizedAt: new Date(),
      });
      mockFindUnique.mockResolvedValueOnce(transcript as never);

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: transcript.runId, transcriptId: transcript.id },
      };

      await handler([job] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).not.toHaveBeenCalled();
      expect(mockPersistSuccess).not.toHaveBeenCalled();
      expect(mockPersistCached).not.toHaveBeenCalled();
    });
  });

  describe('cache behavior', () => {
    const summaryModelId = 'anthropic:test-summary-model';

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

    it('reuses the cached summary for an unchanged transcript', async () => {
      const content = { turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }] };
      const summaryCache = makeValidSummaryCache(content);
      const transcript = makeTranscript({
        content,
        decisionMetadata: { summaryCache },
      });
      mockFindUnique.mockResolvedValueOnce(transcript as never);
      mockIsCacheRecordMatch.mockReturnValueOnce(true);

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(transcript.runId, transcript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).not.toHaveBeenCalled();
      expect(mockPersistCached).toHaveBeenCalledTimes(1);
      const call = mockPersistCached.mock.calls[0];
      if (!call) throw new Error('expected persistCachedSummary call');
      expect(call[2]).toEqual(summaryCache);
      expect(call[5]).toBe(summaryModelId);
    });

    it('re-runs summarization when transcript content changes', async () => {
      const oldContent = { turns: [{ probePrompt: 'Test prompt', targetResponse: 'Old response' }] };
      const summaryCache = makeValidSummaryCache({
        turns: [{ probePrompt: 'Test prompt', targetResponse: 'Stale cached response' }],
      });
      const transcript = makeTranscript({
        content: oldContent,
        decisionMetadata: { summaryCache },
        summarizedAt: new Date(),
      });
      mockFindUnique.mockResolvedValueOnce(transcript as never);
      mockIsCacheRecordMatch.mockReturnValueOnce(false);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(oldContent, {
            decisionCode: '2',
            decisionText: 'AI chose balanced approach',
          }),
        },
      } as never);

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(transcript.runId, transcript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
      expect(mockPersistSuccess).toHaveBeenCalledTimes(1);
    });

    it('re-runs summarization when parser version changes', async () => {
      const content = { turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }] };
      const summaryCache = makeValidSummaryCache(content);
      const transcript = makeTranscript({
        content,
        decisionMetadata: { summaryCache },
        summarizedAt: new Date(),
      });
      mockFindUnique.mockResolvedValueOnce(transcript as never);
      // parser-version divergence is reported by isCacheRecordMatch
      mockIsCacheRecordMatch.mockReturnValueOnce(false);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(content, {
            decisionCode: '3',
            decisionText: 'AI chose a middle path',
          }),
        },
      } as never);

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(transcript.runId, transcript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
    });

    it('re-runs summarization when model changes', async () => {
      const content = { turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }] };
      const summaryCache = makeValidSummaryCache(content);
      const transcript = makeTranscript({
        content,
        decisionMetadata: { summaryCache },
        summarizedAt: new Date(),
      });
      mockFindUnique.mockResolvedValueOnce(transcript as never);
      mockIsCacheRecordMatch.mockReturnValueOnce(false);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(content, {
            decisionCode: '1',
            decisionText: 'AI chose the opposite side',
          }),
        },
      } as never);

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(transcript.runId, transcript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
    });

    it('re-runs summarization when the cached winner-first version is stale', async () => {
      // cacheVersion: 0 is rejected by isWinnerFirstSummaryCache, so the real
      // isSummaryCache type guard (not mocked) treats summaryCache as invalid.
      // The summaryCache FIELD still exists, so the handler falls through to
      // spawning rather than skipping.
      const content = { turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }] };
      const summaryCache = makeValidSummaryCache(content) as SummaryCache & {
        summary: { canonicalDecision: { cacheVersion: number } };
      };
      summaryCache.summary.canonicalDecision.cacheVersion = 0;

      const transcript = makeTranscript({
        content,
        decisionMetadata: { summaryCache },
        summarizedAt: new Date(),
      });
      mockFindUnique.mockResolvedValueOnce(transcript as never);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(content, {
            decisionCode: '1',
            decisionText: 'AI chose the opposite side',
          }),
        },
      } as never);

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(transcript.runId, transcript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
      // isCacheRecordMatch should never be consulted — isSummaryCache rejects the payload first.
      expect(mockIsCacheRecordMatch).not.toHaveBeenCalled();
    });

    it('bypasses the cache when forceSummarize is set', async () => {
      const content = { turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }] };
      const summaryCache = makeValidSummaryCache(content);
      const transcript = makeTranscript({
        content,
        decisionMetadata: { summaryCache },
        summarizedAt: new Date(),
      });
      mockFindUnique.mockResolvedValueOnce(transcript as never);
      // Even though the cache would match, forceSummarize skips the check.
      mockIsCacheRecordMatch.mockReturnValue(true);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(content, {
            decisionCode: '5',
            decisionText: 'AI strongly preferred the first option',
          }),
        },
      } as never);

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(transcript.runId, transcript.id, true)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
      expect(mockPersistCached).not.toHaveBeenCalled();
    });

    it.each([
      'missing summary payload',
      'error summary payload',
    ])('falls back to the worker when the cache is malformed (%s)', async (caseName) => {
      const content = { turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }] };
      const summaryCache = makeValidSummaryCache(content);
      const malformed = JSON.parse(JSON.stringify(summaryCache)) as Record<string, unknown> & {
        summary: { decisionCode: string };
      };

      if (caseName === 'missing summary payload') {
        // Drop the `summary` field entirely — isSummaryCache requires it.
        delete (malformed as { summary?: unknown }).summary;
      } else {
        // decisionCode === 'error' is explicitly rejected by isSummaryCacheSummary.
        malformed.summary.decisionCode = 'error';
      }

      const transcript = makeTranscript({
        content,
        decisionMetadata: { summaryCache: malformed },
        summarizedAt: new Date(),
      });
      mockFindUnique.mockResolvedValueOnce(transcript as never);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(content, {
            decisionCode: '4',
            decisionText: 'AI prioritized safety over efficiency',
          }),
        },
      } as never);

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(transcript.runId, transcript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
    });

    it('falls back to the worker when the cache is missing', async () => {
      const content = { turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response' }] };
      const transcript = makeTranscript({ content });
      mockFindUnique.mockResolvedValueOnce(transcript as never);

      mockSpawnPython.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          summary: buildSuccessfulWorkerSummary(content),
        },
      } as never);

      const handler = createSummarizeTranscriptHandler();
      await handler([makeJob(transcript.runId, transcript.id)] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('forwards non-retryable worker errors to persistSummarizeFailure', async () => {
      const transcript = makeTranscript();
      mockFindUnique.mockResolvedValueOnce(transcript as never);
      mockPersistFailure.mockResolvedValueOnce(false);

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
      } as never);

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: transcript.runId, transcriptId: transcript.id },
      };

      await handler([job] as Parameters<typeof handler>[0]);

      expect(mockPersistFailure).toHaveBeenCalledTimes(1);
      const call = mockPersistFailure.mock.calls[0];
      if (!call) throw new Error('expected persistSummarizeFailure call');
      expect(call[2]).toMatchObject({
        code: 'INVALID_MODEL',
        message: 'Invalid model',
        retryable: false,
      });
      expect(mockPersistSuccess).not.toHaveBeenCalled();
    });

    it('rethrows when persistSummarizeFailure signals a retry for a retryable error', async () => {
      const transcript = makeTranscript();
      mockFindUnique.mockResolvedValueOnce(transcript as never);
      // The real persistence returns true (retry) for retryable errors under the retry limit.
      mockPersistFailure.mockResolvedValueOnce(true);

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
      } as never);

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: transcript.runId, transcriptId: transcript.id },
      };

      await expect(handler([job] as Parameters<typeof handler>[0])).rejects.toThrow(
        'RATE_LIMIT: Rate limited',
      );
    });

    it('handles missing transcript gracefully', async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: 'run-1', transcriptId: 'non-existent-id' },
      };

      await handler([job] as Parameters<typeof handler>[0]);

      expect(mockSpawnPython).not.toHaveBeenCalled();
      expect(mockPersistSuccess).not.toHaveBeenCalled();
      expect(mockPersistFailure).not.toHaveBeenCalled();
    });

    it('forwards spawn rejections to persistSummarizeFailure without rethrow when retry is exhausted', async () => {
      const transcript = makeTranscript();
      mockFindUnique.mockResolvedValueOnce(transcript as never);
      // persistSummarizeFailure returns false once max retries are reached.
      mockPersistFailure.mockResolvedValueOnce(false);

      mockSpawnPython.mockRejectedValueOnce(new Error('Network error'));

      const handler = createSummarizeTranscriptHandler();
      const job: MockJob<{ runId: string; transcriptId: string }> = {
        id: 'test-job-id',
        data: { runId: transcript.runId, transcriptId: transcript.id },
        retrycount: 3,
      };

      await handler([job] as Parameters<typeof handler>[0]);

      expect(mockPersistFailure).toHaveBeenCalledTimes(1);
      const call = mockPersistFailure.mock.calls[0];
      if (!call) throw new Error('expected persistSummarizeFailure call');
      expect(call[2]).toMatchObject({
        code: 'PYTHON_WORKER_FAILED',
        message: 'Network error',
        retryable: true,
      });
    });
  });
});
