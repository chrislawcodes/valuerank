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
  transcript1: 'test-transcript-1-' + Date.now(),
  transcript2: 'test-transcript-2-' + Date.now(),
};

// Mock analysis response from Python worker
const MOCK_ANALYSIS = {
  success: true,
  analysis: {
    status: 'STUB',
    message: 'Full analysis will be implemented in Stage 11',
    transcriptCount: 2,
    completedAt: '2024-01-01T00:00:01.000Z',
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

    await db.run.create({
      data: {
        id: TEST_IDS.run,
        definitionId: TEST_IDS.definition,
        status: 'COMPLETED',
        config: { models: ['gpt-4'] },
      },
    });
  });

  afterEach(async () => {
    // Clean up in correct order
    await db.analysisResult.deleteMany({ where: { runId: TEST_IDS.run } });
    await db.run.deleteMany({ where: { id: TEST_IDS.run } });
    await db.definition.deleteMany({ where: { id: TEST_IDS.definition } });
  });

  describe('successful analysis', () => {
    it('creates analysis_results record with placeholder output', async () => {
      const handler = createAnalyzeBasicHandler();
      await handler([createMockJob()]);

      // Verify analysis result was created
      const result = await db.analysisResult.findFirst({
        where: { runId: TEST_IDS.run },
      });

      expect(result).not.toBeNull();
      expect(result?.analysisType).toBe('basic');
      expect(result?.codeVersion).toBe('0.1.0-stub');
      expect(result?.status).toBe('CURRENT');

      // Verify output structure
      const output = result?.output as { status: string; message: string };
      expect(output.status).toBe('STUB');
      expect(output.message).toContain('Stage 11');
    });

    it('calls Python worker with correct input', async () => {
      const handler = createAnalyzeBasicHandler();
      await handler([createMockJob()]);

      expect(spawnPython).toHaveBeenCalledWith(
        'workers/analyze_basic.py',
        {
          runId: TEST_IDS.run,
          transcriptIds: [TEST_IDS.transcript1, TEST_IDS.transcript2],
        },
        expect.objectContaining({ timeout: 60000 })
      );
    });

    it('generates unique input hash for deduplication', async () => {
      const handler = createAnalyzeBasicHandler();

      // Process same job twice
      await handler([createMockJob()]);
      await handler([createMockJob()]);

      // Both should have same input hash (deterministic)
      const results = await db.analysisResult.findMany({
        where: { runId: TEST_IDS.run },
        orderBy: { createdAt: 'asc' },
      });

      expect(results.length).toBe(2);
      expect(results[0]?.inputHash).toBe(results[1]?.inputHash);
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
});
