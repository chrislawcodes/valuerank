/**
 * Integration tests for analyze-basic handler
 *
 * Tests the full flow: job processing -> Python worker -> analysis result creation
 * Uses mocked Python worker responses.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import { createAnalyzeBasicHandler } from '../../../src/queue/handlers/analyze-basic.js';
import type { AnalyzeBasicJobData } from '../../../src/queue/types.js';
import type { Job } from 'pg-boss';

// Mock the spawn module
vi.mock('../../../src/queue/spawn.js', () => ({
  spawnPython: vi.fn(),
}));

// Import the mocked function
import { spawnPython } from '../../../src/queue/spawn.js';

// Test IDs
const TEST_IDS = {
  definition: 'test-def-analyze-' + Date.now(),
  run: 'test-run-analyze-' + Date.now(),
  scenario1: 'test-scenario-1-' + Date.now(),
  scenario2: 'test-scenario-2-' + Date.now(),
  transcript1: 'test-transcript-1-' + Date.now(),
  transcript2: 'test-transcript-2-' + Date.now(),
};

// Mock analysis response from Python worker (matches real output format)
const MOCK_ANALYSIS = {
  success: true,
  analysis: {
    perModel: {
      'gpt-4': {
        totalResponses: 2,
        decisionCounts: { A: 1, B: 1 },
        mean: 0.5,
        stdDev: 0.5,
        confidenceInterval: { lower: 0.01, upper: 0.99 },
      },
    },
    modelAgreement: {
      pairwise: {},
      overallKappa: null,
    },
    dimensionAnalysis: {
      'test-dimension': {
        effectSize: 0.3,
        pValue: 0.05,
        isSignificant: true,
      },
    },
    mostContestedScenarios: [
      {
        scenarioId: TEST_IDS.scenario1,
        scenarioName: 'Test Scenario 1',
        variance: 0.5,
        modelScores: { 'gpt-4': 0.5 },
      },
    ],
    methodsUsed: {
      confidenceInterval: 'Wilson score',
      effectSize: 'eta-squared',
      multipleComparison: 'Holm-Bonferroni',
    },
    warnings: [],
    computedAt: '2024-01-01T00:00:01.000Z',
    durationMs: 150,
  },
};

// Mock job factory
function createMockJob(data: Partial<AnalyzeBasicJobData> = {}): Job<AnalyzeBasicJobData> {
  return {
    id: 'job-' + Date.now(),
    name: 'analyze_basic',
    data: {
      runId: TEST_IDS.run,
      transcriptIds: [TEST_IDS.transcript1, TEST_IDS.transcript2],
      ...data,
    },
    createdOn: new Date(),
    startedOn: new Date(),
  } as Job<AnalyzeBasicJobData>;
}

describe('analyze-basic integration', () => {
  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Default mock: return successful analysis
    vi.mocked(spawnPython).mockResolvedValue({
      success: true,
      data: MOCK_ANALYSIS,
      stderr: '',
    });

    // Create test data
    await db.definition.create({
      data: {
        id: TEST_IDS.definition,
        name: 'Test Definition',
        content: { preamble: 'Test preamble' },
      },
    });

    // Create scenarios
    await db.scenario.createMany({
      data: [
        {
          id: TEST_IDS.scenario1,
          definitionId: TEST_IDS.definition,
          name: 'Test Scenario 1',
          content: { dimensions: { 'test-dimension': 1 } },
        },
        {
          id: TEST_IDS.scenario2,
          definitionId: TEST_IDS.definition,
          name: 'Test Scenario 2',
          content: { dimensions: { 'test-dimension': 2 } },
        },
      ],
    });

    await db.run.create({
      data: {
        id: TEST_IDS.run,
        definitionId: TEST_IDS.definition,
        status: 'COMPLETED',
        config: { models: ['gpt-4'] },
      },
    });

    // Create transcripts with decision codes
    await db.transcript.createMany({
      data: [
        {
          id: TEST_IDS.transcript1,
          runId: TEST_IDS.run,
          modelId: 'gpt-4',
          scenarioId: TEST_IDS.scenario1,
          decisionCode: 'A',
          content: { turns: [] },
          turnCount: 1,
          tokenCount: 100,
          durationMs: 1000,
        },
        {
          id: TEST_IDS.transcript2,
          runId: TEST_IDS.run,
          modelId: 'gpt-4',
          scenarioId: TEST_IDS.scenario2,
          decisionCode: 'B',
          content: { turns: [] },
          turnCount: 1,
          tokenCount: 100,
          durationMs: 1000,
        },
      ],
    });
  });

  afterEach(async () => {
    // Clean up in correct order
    await db.analysisResult.deleteMany({ where: { runId: TEST_IDS.run } });
    await db.transcript.deleteMany({ where: { runId: TEST_IDS.run } });
    await db.run.deleteMany({ where: { id: TEST_IDS.run } });
    await db.scenario.deleteMany({ where: { definitionId: TEST_IDS.definition } });
    await db.definition.deleteMany({ where: { id: TEST_IDS.definition } });
  });

  describe('successful analysis', () => {
    it('creates analysis_results record with full output', async () => {
      const handler = createAnalyzeBasicHandler();
      await handler([createMockJob()]);

      // Verify analysis result was created
      const result = await db.analysisResult.findFirst({
        where: { runId: TEST_IDS.run },
      });

      expect(result).not.toBeNull();
      expect(result?.analysisType).toBe('basic');
      expect(result?.codeVersion).toBe('1.0.0');
      expect(result?.status).toBe('CURRENT');

      // Verify output structure
      const output = result?.output as typeof MOCK_ANALYSIS.analysis;
      expect(output.perModel).toBeDefined();
      expect(output.modelAgreement).toBeDefined();
      expect(output.methodsUsed).toBeDefined();
      expect(output.computedAt).toBe('2024-01-01T00:00:01.000Z');
    });

    it('calls Python worker with transcript data including scenario info', async () => {
      const handler = createAnalyzeBasicHandler();
      await handler([createMockJob()]);

      expect(spawnPython).toHaveBeenCalledWith(
        'workers/analyze_basic.py',
        expect.objectContaining({
          runId: TEST_IDS.run,
          transcripts: expect.arrayContaining([
            expect.objectContaining({
              id: TEST_IDS.transcript1,
              modelId: 'gpt-4',
              scenarioId: TEST_IDS.scenario1,
              summary: { score: null }, // 'A' doesn't parse to numeric 1-5
              scenario: expect.objectContaining({
                name: 'Test Scenario 1',
                dimensions: { 'test-dimension': 1 },
              }),
            }),
          ]),
        }),
        expect.objectContaining({ timeout: 120000 })
      );
    });

    it('generates unique input hash for deduplication', async () => {
      const handler = createAnalyzeBasicHandler();

      // Process same job twice (force=false by default)
      await handler([createMockJob()]);

      // Second call should use cached result
      await handler([createMockJob()]);

      // Only one result should exist (second used cache)
      const results = await db.analysisResult.findMany({
        where: { runId: TEST_IDS.run },
      });

      expect(results.length).toBe(1);
      expect(spawnPython).toHaveBeenCalledTimes(1);
    });

    it('force=true bypasses cache and creates new result', async () => {
      const handler = createAnalyzeBasicHandler();

      // First call
      await handler([createMockJob()]);

      // Second call with force=true
      await handler([createMockJob({ force: true })]);

      // Two results should exist
      const results = await db.analysisResult.findMany({
        where: { runId: TEST_IDS.run },
        orderBy: { createdAt: 'asc' },
      });

      expect(results.length).toBe(2);
      expect(results[0]?.status).toBe('SUPERSEDED');
      expect(results[1]?.status).toBe('CURRENT');
      expect(spawnPython).toHaveBeenCalledTimes(2);
    });

    it('marks existing analysis as SUPERSEDED when creating new one', async () => {
      const handler = createAnalyzeBasicHandler();

      // Create two analyses with force
      await handler([createMockJob({ force: true })]);
      await handler([createMockJob({ force: true })]);

      // Check statuses
      const results = await db.analysisResult.findMany({
        where: { runId: TEST_IDS.run },
        orderBy: { createdAt: 'asc' },
      });

      expect(results.length).toBe(2);
      expect(results[0]?.status).toBe('SUPERSEDED');
      expect(results[1]?.status).toBe('CURRENT');
    });
  });

  describe('error handling', () => {
    it('throws on Python spawn failure', async () => {
      vi.mocked(spawnPython).mockResolvedValueOnce({
        success: false,
        error: 'Python process exited with code 1',
        stderr: 'Error in analyze_basic.py',
      });

      const handler = createAnalyzeBasicHandler();

      await expect(handler([createMockJob()])).rejects.toThrow('Python worker failed');

      // No analysis result should be created
      const result = await db.analysisResult.findFirst({
        where: { runId: TEST_IDS.run },
      });
      expect(result).toBeNull();
    });

    it('handles non-retryable errors gracefully', async () => {
      vi.mocked(spawnPython).mockResolvedValueOnce({
        success: true,
        data: {
          success: false,
          error: {
            message: 'Invalid run ID',
            code: 'VALIDATION_ERROR',
            retryable: false,
          },
        },
        stderr: '',
      });

      const handler = createAnalyzeBasicHandler();

      // Should not throw for non-retryable error
      await handler([createMockJob()]);

      // No analysis result should be created
      const result = await db.analysisResult.findFirst({
        where: { runId: TEST_IDS.run },
      });
      expect(result).toBeNull();
    });

    it('throws on retryable errors', async () => {
      vi.mocked(spawnPython).mockResolvedValueOnce({
        success: true,
        data: {
          success: false,
          error: {
            message: 'Temporary failure',
            code: 'NETWORK_ERROR',
            retryable: true,
          },
        },
        stderr: '',
      });

      const handler = createAnalyzeBasicHandler();

      await expect(handler([createMockJob()])).rejects.toThrow('NETWORK_ERROR');
    });
  });

  describe('batch processing', () => {
    it('processes multiple jobs in batch', async () => {
      // Create another run for batch processing
      const run2Id = 'test-run-2-' + Date.now();
      await db.run.create({
        data: {
          id: run2Id,
          definitionId: TEST_IDS.definition,
          status: 'COMPLETED',
          config: { models: ['gpt-4'] },
        },
      });

      const handler = createAnalyzeBasicHandler();

      await handler([
        createMockJob({ runId: TEST_IDS.run }),
        createMockJob({ runId: run2Id, transcriptIds: ['t3'] }),
      ]);

      // Verify both analysis results were created
      const results = await db.analysisResult.findMany({
        where: { runId: { in: [TEST_IDS.run, run2Id] } },
      });

      expect(results.length).toBe(2);

      // Clean up
      await db.analysisResult.deleteMany({ where: { runId: run2Id } });
      await db.run.deleteMany({ where: { id: run2Id } });
    });
  });

  describe('transcript data extraction', () => {
    it('extracts dimensions from scenario content', async () => {
      const handler = createAnalyzeBasicHandler();
      await handler([createMockJob()]);

      const callArgs = vi.mocked(spawnPython).mock.calls[0];
      const input = callArgs?.[1] as { transcripts: Array<{ scenario: { dimensions: Record<string, number> } }> };

      // Verify numeric dimensions were extracted from scenario content
      // Both scenario 1 (dimension=1) and scenario 2 (dimension=2) should be present
      const transcriptsWithDimension = input.transcripts.filter(
        (t) => t.scenario.dimensions['test-dimension'] !== undefined
      );
      expect(transcriptsWithDimension.length).toBeGreaterThan(0);
      // Check that the dimension values are the expected ones (1 or 2)
      const dimensionValues = transcriptsWithDimension.map((t) => t.scenario.dimensions['test-dimension']);
      expect(dimensionValues).toContain(1);
      expect(dimensionValues).toContain(2);
    });

    it('handles transcripts without scenarios gracefully', async () => {
      // Create transcript without scenario
      const orphanTranscriptId = 'orphan-transcript-' + Date.now();
      await db.transcript.create({
        data: {
          id: orphanTranscriptId,
          runId: TEST_IDS.run,
          modelId: 'gpt-4',
          scenarioId: null,
          decisionCode: 'A',
          content: { turns: [] },
          turnCount: 1,
          tokenCount: 100,
          durationMs: 1000,
        },
      });

      const handler = createAnalyzeBasicHandler();

      // Should not throw
      await handler([
        createMockJob({ transcriptIds: [TEST_IDS.transcript1, orphanTranscriptId] }),
      ]);

      // Verify only transcript with scenario was sent to worker
      const callArgs = vi.mocked(spawnPython).mock.calls[0];
      const input = callArgs?.[1] as { transcripts: Array<{ id: string }> };
      expect(input.transcripts.length).toBe(1);
      expect(input.transcripts[0]?.id).toBe(TEST_IDS.transcript1);

      // Clean up
      await db.transcript.delete({ where: { id: orphanTranscriptId } });
    });
  });
});
