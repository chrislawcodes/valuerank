/**
 * Unit tests for Scenario Expansion Service
 *
 * Tests LLM-based scenario generation via Python worker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@valuerank/db';
import { expandScenarios, type ExpandScenariosResult } from '../../../src/services/scenario/expand.js';

// Mock the spawn utility
vi.mock('../../../src/queue/spawn.js', () => ({
  spawnPython: vi.fn(),
}));

// Mock the infra-models module
vi.mock('../../../src/services/infra-models.js', () => ({
  getScenarioExpansionModel: vi.fn().mockResolvedValue({
    modelId: 'deepseek-chat',
    providerId: 'deepseek',
    providerName: 'deepseek',
    displayName: 'DeepSeek Chat',
  }),
}));

// Import mocked functions
import { spawnPython } from '../../../src/queue/spawn.js';

const mockedSpawnPython = vi.mocked(spawnPython);

describe('Scenario Expansion Service', () => {
  // Track created test data for cleanup
  let testDefinitionId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create test definition
    const definition = await db.definition.create({
      data: {
        name: `test-expand-${Date.now()}`,
        content: {},
      },
    });
    testDefinitionId = definition.id;
  });

  afterEach(async () => {
    // Clean up test data
    await db.scenario.deleteMany({
      where: { definitionId: testDefinitionId },
    });
    await db.definition.deleteMany({
      where: { id: testDefinitionId },
    });
  });

  describe('expandScenarios', () => {
    describe('when content has no dimensions', () => {
      it('creates a single default scenario with template as prompt', async () => {
        const content = {
          template: 'A doctor must decide whether to save one patient or another.',
          preamble: 'You are participating in a research study.',
        };

        const result = await expandScenarios(testDefinitionId, content);

        expect(result.created).toBe(1);
        expect(mockedSpawnPython).not.toHaveBeenCalled();

        // Verify scenario was created
        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect(scenarios).toHaveLength(1);
        expect(scenarios[0].name).toBe('Default Scenario');
        expect((scenarios[0].content as { prompt: string }).prompt).toBe(content.template);
        expect((scenarios[0].content as { preamble: string }).preamble).toBe(content.preamble);
      });

      it('creates default scenario when dimensions array is empty', async () => {
        const content = {
          template: 'Test template',
          dimensions: [],
        };

        const result = await expandScenarios(testDefinitionId, content);

        expect(result.created).toBe(1);
        expect(mockedSpawnPython).not.toHaveBeenCalled();
      });

      it('handles empty preamble by setting it to undefined', async () => {
        const content = {
          template: 'Test template',
          preamble: '   ', // whitespace only
        };

        await expandScenarios(testDefinitionId, content);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect((scenarios[0].content as { preamble?: string }).preamble).toBeUndefined();
      });
    });

    describe('when content has dimensions with levels', () => {
      const contentWithDimensions = {
        template: 'A [Stakes] situation with [Certainty] outcomes.',
        preamble: 'Test preamble',
        dimensions: [
          {
            name: 'Stakes',
            levels: [
              { score: 1, label: 'Low', options: ['minor', 'small'] },
              { score: 2, label: 'Medium', options: ['significant', 'notable'] },
              { score: 3, label: 'High', options: ['major', 'critical'] },
            ],
          },
          {
            name: 'Certainty',
            levels: [
              { score: 1, label: 'Uncertain', options: ['uncertain', 'possible'] },
              { score: 2, label: 'Likely', options: ['probable', 'likely'] },
              { score: 3, label: 'Certain', options: ['definite', 'guaranteed'] },
            ],
          },
        ],
      };

      it('spawns Python worker with correct input', async () => {
        mockedSpawnPython.mockResolvedValue({
          success: true,
          data: {
            success: true,
            scenarios: [
              {
                name: 'Low stakes uncertain',
                content: {
                  preamble: 'Test preamble',
                  prompt: 'A minor situation with uncertain outcomes.',
                  dimensions: { Stakes: 1, Certainty: 1 },
                },
              },
              {
                name: 'High stakes certain',
                content: {
                  preamble: 'Test preamble',
                  prompt: 'A critical situation with guaranteed outcomes.',
                  dimensions: { Stakes: 3, Certainty: 3 },
                },
              },
            ],
            metadata: {
              inputTokens: 500,
              outputTokens: 1000,
              modelVersion: 'deepseek-chat-v1',
            },
          },
        });

        const result = await expandScenarios(testDefinitionId, contentWithDimensions);

        // Verify Python worker was called
        expect(mockedSpawnPython).toHaveBeenCalledOnce();

        // Verify input structure
        const [workerPath, workerInput, options] = mockedSpawnPython.mock.calls[0];
        expect(workerPath).toContain('generate_scenarios.py');
        expect(workerInput.definitionId).toBe(testDefinitionId);
        expect(workerInput.modelId).toBe('deepseek:deepseek-chat');
        expect(workerInput.content.template).toBe(contentWithDimensions.template);
        expect(workerInput.content.dimensions).toEqual(contentWithDimensions.dimensions);
        expect(workerInput.config.temperature).toBe(0.7);
        expect(options.timeout).toBe(300000);

        // Verify scenarios created
        expect(result.created).toBe(2);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect(scenarios).toHaveLength(2);
      });

      it('handles Python worker spawn failure with fallback', async () => {
        mockedSpawnPython.mockResolvedValue({
          success: false,
          error: 'Failed to spawn process: Python not found',
          stderr: 'python3: command not found',
        });

        const result = await expandScenarios(testDefinitionId, contentWithDimensions);

        // Should create fallback scenario
        expect(result.created).toBe(1);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect(scenarios).toHaveLength(1);
        expect(scenarios[0].name).toBe('Default Scenario');
      });

      it('handles Python worker error response with retryable error', async () => {
        mockedSpawnPython.mockResolvedValue({
          success: true,
          data: {
            success: false,
            error: {
              message: 'Rate limit exceeded',
              code: 'RATE_LIMIT',
              retryable: true,
            },
          },
        });

        // Should throw to trigger job retry
        await expect(expandScenarios(testDefinitionId, contentWithDimensions))
          .rejects.toThrow('LLM generation failed: Rate limit exceeded');
      });

      it('handles Python worker error response with non-retryable error', async () => {
        mockedSpawnPython.mockResolvedValue({
          success: true,
          data: {
            success: false,
            error: {
              message: 'Invalid API key',
              code: 'AUTH_ERROR',
              retryable: false,
            },
          },
        });

        const result = await expandScenarios(testDefinitionId, contentWithDimensions);

        // Should create fallback scenario
        expect(result.created).toBe(1);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect(scenarios[0].name).toBe('Default Scenario');
      });

      it('handles empty scenarios response from worker', async () => {
        mockedSpawnPython.mockResolvedValue({
          success: true,
          data: {
            success: true,
            scenarios: [],
            metadata: {
              inputTokens: 0,
              outputTokens: 0,
              modelVersion: null,
            },
          },
        });

        const result = await expandScenarios(testDefinitionId, contentWithDimensions);

        // Should create default scenario
        expect(result.created).toBe(1);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect(scenarios[0].name).toBe('Default Scenario');
      });
    });

    describe('scenario deletion', () => {
      it('soft deletes existing scenarios before creating new ones', async () => {
        // Create existing scenario
        await db.scenario.create({
          data: {
            definitionId: testDefinitionId,
            name: 'Old Scenario',
            content: { prompt: 'Old content', dimensions: {} },
          },
        });

        const content = {
          template: 'New template',
        };

        const result = await expandScenarios(testDefinitionId, content);

        expect(result.deleted).toBe(1);
        expect(result.created).toBe(1);

        // Verify old scenario is soft deleted
        const allScenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId },
        });
        expect(allScenarios).toHaveLength(2);

        const activeScenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect(activeScenarios).toHaveLength(1);
        expect(activeScenarios[0].name).toBe('Default Scenario');
      });
    });
  });
});
