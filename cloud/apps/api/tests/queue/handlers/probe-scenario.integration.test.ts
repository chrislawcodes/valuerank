/**
 * Integration tests for probe-scenario handler
 *
 * Tests the full flow: job processing -> Python worker -> transcript creation
 * Uses mocked Python worker responses to test database integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import { createProbeScenarioHandler, resetHealthCheck } from '../../../src/queue/handlers/probe-scenario.js';
import type { ProbeScenarioJobData } from '../../../src/queue/types.js';
import type { Job } from 'pg-boss';

// Mock the spawn module
vi.mock('../../../src/queue/spawn.js', () => ({
  spawnPython: vi.fn(),
}));

// Import the mocked function
import { spawnPython } from '../../../src/queue/spawn.js';

// Mock health check response
const MOCK_HEALTH_CHECK = {
  success: true,
  health: {
    pythonVersion: '3.12.0',
    packages: { requests: '2.31.0', pyyaml: '6.0' },
    apiKeys: { openai: true, anthropic: false },
    warnings: [],
  },
};

// Test IDs - use UUIDs to avoid conflicts
const TEST_IDS = {
  definition: 'test-def-' + Date.now(),
  scenario: 'test-scenario-' + Date.now(),
  run: 'test-run-' + Date.now(),
};

// Sample probe transcript response from Python worker
const MOCK_TRANSCRIPT = {
  turns: [
    {
      turnNumber: 1,
      promptLabel: 'initial',
      probePrompt: 'What would you do in this situation?',
      targetResponse: 'I would consider the ethical implications carefully.',
      inputTokens: 10,
      outputTokens: 50,
    },
  ],
  totalInputTokens: 10,
  totalOutputTokens: 50,
  modelVersion: 'gpt-4-0613',
  startedAt: '2024-01-01T00:00:00.000Z',
  completedAt: '2024-01-01T00:00:01.000Z',
};

// Mock job factory
function createMockJob(data: Partial<ProbeScenarioJobData> = {}): Job<ProbeScenarioJobData> {
  return {
    id: 'job-' + Date.now(),
    name: 'probe_scenario',
    data: {
      runId: TEST_IDS.run,
      scenarioId: TEST_IDS.scenario,
      modelId: 'gpt-4',
      config: {
        temperature: 0.7,
        maxTurns: 3,
      },
      ...data,
    },
    createdOn: new Date(),
    startedOn: new Date(),
  } as Job<ProbeScenarioJobData>;
}

describe('probe-scenario integration', () => {
  beforeEach(async () => {
    // Reset mocks and health check state
    vi.clearAllMocks();
    resetHealthCheck();

    // Default mock: health check passes, then probe worker is called
    // The mock implementation will be overridden per test for probe responses
    vi.mocked(spawnPython).mockImplementation((script: string) => {
      if (script.includes('health_check.py')) {
        return Promise.resolve({
          success: true,
          data: MOCK_HEALTH_CHECK,
          stderr: '',
        });
      }
      // Default probe response - will be overridden in each test
      return Promise.resolve({
        success: true,
        data: { success: true, transcript: MOCK_TRANSCRIPT },
        stderr: '',
      });
    });

    // Create test data
    await db.definition.create({
      data: {
        id: TEST_IDS.definition,
        name: 'Test Definition',
        content: {
          preamble: 'You are being evaluated on ethical reasoning.',
        },
      },
    });

    await db.scenario.create({
      data: {
        id: TEST_IDS.scenario,
        definitionId: TEST_IDS.definition,
        name: 'Test Scenario',
        content: {
          prompt: 'A trolley is heading toward five people...',
          followups: [],
        },
      },
    });

    await db.run.create({
      data: {
        id: TEST_IDS.run,
        definitionId: TEST_IDS.definition,
        status: 'RUNNING',
        config: {
          models: ['gpt-4'],
          temperature: 0.7,
          maxTurns: 3,
        },
        progress: {
          total: 1,
          completed: 0,
          failed: 0,
        },
      },
    });
  });

  afterEach(async () => {
    // Clean up test data in correct order (respect FK constraints)
    await db.transcript.deleteMany({ where: { runId: TEST_IDS.run } });
    await db.run.deleteMany({ where: { id: TEST_IDS.run } });
    await db.scenario.deleteMany({ where: { id: TEST_IDS.scenario } });
    await db.definition.deleteMany({ where: { id: TEST_IDS.definition } });
  });

  describe('successful probe completion', () => {
    it('creates transcript with correct fields', async () => {
      // Using default mock from beforeEach
      const handler = createProbeScenarioHandler();
      await handler([createMockJob()]);

      // Verify transcript was created
      const transcript = await db.transcript.findFirst({
        where: { runId: TEST_IDS.run },
      });

      expect(transcript).not.toBeNull();
      expect(transcript?.modelId).toBe('gpt-4');
      expect(transcript?.modelVersion).toBe('gpt-4-0613');
      expect(transcript?.turnCount).toBe(1);
      expect(transcript?.tokenCount).toBe(60); // 10 + 50
      expect(transcript?.durationMs).toBe(1000); // 1 second
    });

    it('increments progress.completed after transcript save', async () => {
      // Using default mock from beforeEach
      const handler = createProbeScenarioHandler();
      await handler([createMockJob()]);

      // Verify progress was updated
      const run = await db.run.findUnique({
        where: { id: TEST_IDS.run },
      });

      const progress = run?.progress as { completed: number; failed: number; total: number };
      expect(progress.completed).toBe(1);
      expect(progress.failed).toBe(0);
    });

    it('stores definition snapshot in transcript', async () => {
      // Using default mock from beforeEach
      const handler = createProbeScenarioHandler();
      await handler([createMockJob()]);

      const transcript = await db.transcript.findFirst({
        where: { runId: TEST_IDS.run },
      });

      const snapshot = transcript?.definitionSnapshot as Record<string, unknown>;
      expect(snapshot).not.toBeNull();
      expect(snapshot.preamble).toBe('You are being evaluated on ethical reasoning.');
    });
  });

  describe('concurrent job handling', () => {
    it('handles concurrent job completions without race conditions', async () => {
      // Create additional scenarios and update run total
      const scenario2Id = 'test-scenario-2-' + Date.now();
      const scenario3Id = 'test-scenario-3-' + Date.now();

      await db.scenario.createMany({
        data: [
          {
            id: scenario2Id,
            definitionId: TEST_IDS.definition,
            name: 'Test Scenario 2',
            content: { prompt: 'Scenario 2 prompt', followups: [] },
          },
          {
            id: scenario3Id,
            definitionId: TEST_IDS.definition,
            name: 'Test Scenario 3',
            content: { prompt: 'Scenario 3 prompt', followups: [] },
          },
        ],
      });

      await db.run.update({
        where: { id: TEST_IDS.run },
        data: {
          progress: { total: 3, completed: 0, failed: 0 },
        },
      });

      // Using default mock from beforeEach (handles both health check and probe)
      const handler = createProbeScenarioHandler();

      // Process jobs concurrently
      await Promise.all([
        handler([createMockJob({ scenarioId: TEST_IDS.scenario })]),
        handler([createMockJob({ scenarioId: scenario2Id })]),
        handler([createMockJob({ scenarioId: scenario3Id })]),
      ]);

      // Verify all transcripts created
      const transcripts = await db.transcript.findMany({
        where: { runId: TEST_IDS.run },
      });
      expect(transcripts.length).toBe(3);

      // Verify final progress
      const run = await db.run.findUnique({
        where: { id: TEST_IDS.run },
      });
      const progress = run?.progress as { completed: number; failed: number; total: number };
      expect(progress.completed).toBe(3);
      expect(progress.failed).toBe(0);

      // Clean up additional scenarios
      await db.scenario.deleteMany({
        where: { id: { in: [scenario2Id, scenario3Id] } },
      });
    });
  });

  describe('error handling', () => {
    it('handles rate limit errors as retryable', async () => {
      vi.mocked(spawnPython).mockImplementation((script: string) => {
        if (script.includes('health_check.py')) {
          return Promise.resolve({ success: true, data: MOCK_HEALTH_CHECK, stderr: '' });
        }
        return Promise.resolve({
          success: true,
          data: {
            success: false,
            error: { message: 'Rate limit exceeded', code: 'RATE_LIMIT', retryable: true },
          },
          stderr: '',
        });
      });

      const handler = createProbeScenarioHandler();

      // Should throw to trigger retry
      await expect(handler([createMockJob()])).rejects.toThrow('RATE_LIMIT');

      // Progress should NOT be incremented (will retry)
      const run = await db.run.findUnique({ where: { id: TEST_IDS.run } });
      const progress = run?.progress as { completed: number; failed: number };
      expect(progress.completed).toBe(0);
      expect(progress.failed).toBe(0);
    });

    it('handles auth errors as non-retryable', async () => {
      vi.mocked(spawnPython).mockImplementation((script: string) => {
        if (script.includes('health_check.py')) {
          return Promise.resolve({ success: true, data: MOCK_HEALTH_CHECK, stderr: '' });
        }
        return Promise.resolve({
          success: true,
          data: {
            success: false,
            error: { message: 'Invalid API key', code: 'AUTH_ERROR', retryable: false },
          },
          stderr: '',
        });
      });

      const handler = createProbeScenarioHandler();

      // Should NOT throw (no retry)
      await handler([createMockJob()]);

      // Progress.failed should be incremented
      const run = await db.run.findUnique({ where: { id: TEST_IDS.run } });
      const progress = run?.progress as { completed: number; failed: number };
      expect(progress.completed).toBe(0);
      expect(progress.failed).toBe(1);
    });

    it('handles Python crash with stderr captured', async () => {
      vi.mocked(spawnPython).mockImplementation((script: string) => {
        if (script.includes('health_check.py')) {
          return Promise.resolve({ success: true, data: MOCK_HEALTH_CHECK, stderr: '' });
        }
        return Promise.resolve({
          success: false,
          error: 'Python process exited with code 1',
          stderr: 'Traceback (most recent call last):\n  File "probe.py", line 42\nSyntaxError: invalid syntax',
        });
      });

      const handler = createProbeScenarioHandler();

      // Should throw to trigger retry
      await expect(handler([createMockJob()])).rejects.toThrow('Python worker failed');

      // No transcript should be created
      const transcript = await db.transcript.findFirst({
        where: { runId: TEST_IDS.run },
      });
      expect(transcript).toBeNull();
    });
  });

  describe('run state handling', () => {
    it('skips job when run is completed', async () => {
      // Mark run as completed
      await db.run.update({
        where: { id: TEST_IDS.run },
        data: { status: 'COMPLETED' },
      });

      const handler = createProbeScenarioHandler();
      await handler([createMockJob()]);

      // Python should not be called
      expect(spawnPython).not.toHaveBeenCalled();

      // No transcript created
      const transcript = await db.transcript.findFirst({
        where: { runId: TEST_IDS.run },
      });
      expect(transcript).toBeNull();
    });

    it('skips job when run is cancelled', async () => {
      await db.run.update({
        where: { id: TEST_IDS.run },
        data: { status: 'CANCELLED' },
      });

      const handler = createProbeScenarioHandler();
      await handler([createMockJob()]);

      expect(spawnPython).not.toHaveBeenCalled();
    });

    it('defers job when run is paused', async () => {
      await db.run.update({
        where: { id: TEST_IDS.run },
        data: { status: 'PAUSED' },
      });

      const handler = createProbeScenarioHandler();

      // Should throw with RUN_PAUSED prefix
      await expect(handler([createMockJob()])).rejects.toThrow('RUN_PAUSED');

      expect(spawnPython).not.toHaveBeenCalled();
    });
  });

  describe('multi-provider support', () => {
    it('handles multiple providers in same run', async () => {
      // Update run to have 3 model/scenario pairs
      await db.run.update({
        where: { id: TEST_IDS.run },
        data: {
          config: {
            models: ['gpt-4', 'claude-3-sonnet', 'gemini-1.5-pro'],
            temperature: 0.7,
            maxTurns: 3,
          },
          progress: { total: 3, completed: 0, failed: 0 },
        },
      });

      // Mock responses based on model in input
      const transcriptsByModel: Record<string, typeof MOCK_TRANSCRIPT> = {
        'gpt-4': { ...MOCK_TRANSCRIPT, modelVersion: 'gpt-4-0613' },
        'claude-3-sonnet': { ...MOCK_TRANSCRIPT, modelVersion: 'claude-3-sonnet-20240229' },
        'gemini-1.5-pro': { ...MOCK_TRANSCRIPT, modelVersion: 'gemini-1.5-pro-001' },
      };

      vi.mocked(spawnPython).mockImplementation((script: string, input: unknown) => {
        if (script.includes('health_check.py')) {
          return Promise.resolve({ success: true, data: MOCK_HEALTH_CHECK, stderr: '' });
        }
        // Get model from input
        const data = input as { modelId?: string };
        const transcript = transcriptsByModel[data.modelId ?? 'gpt-4'] ?? MOCK_TRANSCRIPT;
        return Promise.resolve({
          success: true,
          data: { success: true, transcript },
          stderr: '',
        });
      });

      const handler = createProbeScenarioHandler();

      // Process jobs for each provider
      await handler([createMockJob({ modelId: 'gpt-4' })]);
      await handler([createMockJob({ modelId: 'claude-3-sonnet' })]);
      await handler([createMockJob({ modelId: 'gemini-1.5-pro' })]);

      // Verify all transcripts created with correct model versions
      const transcripts = await db.transcript.findMany({
        where: { runId: TEST_IDS.run },
        orderBy: { createdAt: 'asc' },
      });

      expect(transcripts.length).toBe(3);
      expect(transcripts[0]?.modelId).toBe('gpt-4');
      expect(transcripts[0]?.modelVersion).toBe('gpt-4-0613');
      expect(transcripts[1]?.modelId).toBe('claude-3-sonnet');
      expect(transcripts[1]?.modelVersion).toBe('claude-3-sonnet-20240229');
      expect(transcripts[2]?.modelId).toBe('gemini-1.5-pro');
      expect(transcripts[2]?.modelVersion).toBe('gemini-1.5-pro-001');

      // Verify progress
      const run = await db.run.findUnique({ where: { id: TEST_IDS.run } });
      const progress = run?.progress as { completed: number; failed: number; total: number };
      expect(progress.completed).toBe(3);
    });
  });
});
