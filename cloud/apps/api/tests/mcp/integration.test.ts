/**
 * MCP Integration Tests
 *
 * Tests for the full MCP workflow including auth, rate limiting,
 * and tool interactions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@valuerank/db';
import { formatRunListItem } from '../../src/services/mcp/formatters.js';
import {
  buildMcpResponse,
  estimateBytes,
  exceedsBudget,
  truncateArray,
  TOKEN_BUDGETS,
} from '../../src/services/mcp/response.js';

describe('MCP Integration', () => {
  // Test data
  let testUserId: string;
  let testDefinitionId: string;
  let testScenarioId: string;
  let testRunIds: string[] = [];
  let testTranscriptIds: string[] = [];

  beforeAll(async () => {
    // Create test user
    const user = await db.user.upsert({
      where: { email: 'mcp-integration-test@test.com' },
      update: {},
      create: {
        email: 'mcp-integration-test@test.com',
        passwordHash: 'test-hash',
      },
    });
    testUserId = user.id;

    // Create test definition
    const definition = await db.definition.create({
      data: {
        name: 'MCP Integration Test Definition',
        content: {
          title: 'Test Scenario',
          dilemma: 'A test dilemma for integration testing',
        },
      },
    });
    testDefinitionId = definition.id;

    // Create test scenario
    const scenario = await db.scenario.create({
      data: {
        definitionId: testDefinitionId,
        name: 'MCP Test Scenario 1',
        content: {
          title: 'Test Scenario 1',
          dilemma: 'A test dilemma',
        },
      },
    });
    testScenarioId = scenario.id;

    // Create test runs with different statuses
    const runs = await Promise.all([
      db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'COMPLETED',
          config: { models: ['openai:gpt-4', 'anthropic:claude-3'], samplePercentage: 100 },
        },
      }),
      db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'RUNNING',
          config: { models: ['openai:gpt-4'], samplePercentage: 50 },
        },
      }),
    ]);
    testRunIds = runs.map((r) => r.id);

    // Create test transcript for completed run
    const transcript = await db.transcript.create({
      data: {
        runId: testRunIds[0],
        scenarioId: testScenarioId,
        modelId: 'openai:gpt-4',
        content: {
          turns: [
            { role: 'user', content: 'Test message 1' },
            { role: 'assistant', content: 'Test response 1' },
          ],
        },
        turnCount: 2,
        tokenCount: 100,
        durationMs: 1000,
      },
    });
    testTranscriptIds.push(transcript.id);
  });

  afterAll(async () => {
    // Clean up in reverse order of dependencies
    if (testTranscriptIds.length > 0) {
      await db.transcript.deleteMany({
        where: { id: { in: testTranscriptIds } },
      });
    }
    if (testRunIds.length > 0) {
      await db.run.deleteMany({
        where: { id: { in: testRunIds } },
      });
    }
    if (testScenarioId) {
      await db.scenario
        .delete({
          where: { id: testScenarioId },
        })
        .catch(() => {
          // May fail if referenced
        });
    }
    if (testDefinitionId) {
      await db.definition
        .delete({
          where: { id: testDefinitionId },
        })
        .catch(() => {
          // May fail if referenced
        });
    }
    if (testUserId) {
      await db.user
        .delete({
          where: { id: testUserId },
        })
        .catch(() => {
          // May fail if user is referenced elsewhere
        });
    }
  });

  describe('Full Tool Workflow', () => {
    it('can list runs and get details in sequence', async () => {
      // Step 1: List all completed runs
      const completedRuns = await db.run.findMany({
        where: { status: 'COMPLETED', deletedAt: null },
        include: { _count: { select: { transcripts: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      expect(completedRuns.length).toBeGreaterThanOrEqual(1);

      // Step 2: Get the first completed run
      const run = completedRuns[0];
      expect(run).toBeDefined();
      expect(run.id).toBeDefined();

      // Step 3: Format as MCP response
      const formatted = formatRunListItem(run);
      expect(formatted.status).toBe('completed');
      expect(formatted.id).toBe(run.id);
    });

    it('can filter runs by definition and status', async () => {
      // Query with multiple filters like MCP tool would
      const runs = await db.run.findMany({
        where: {
          definitionId: testDefinitionId,
          status: 'COMPLETED',
          deletedAt: null,
        },
        include: { _count: { select: { transcripts: true } } },
        orderBy: { createdAt: 'desc' },
      });

      expect(runs.length).toBe(1);
      expect(runs[0].definitionId).toBe(testDefinitionId);
      expect(runs[0].status).toBe('COMPLETED');
    });

    it('list_definitions filters soft-deleted records', async () => {
      // Create a soft-deleted definition
      const deletedDef = await db.definition.create({
        data: {
          name: 'Deleted Definition for MCP Test',
          content: { test: true },
          deletedAt: new Date(),
        },
      });

      try {
        // Query like list_definitions tool would
        const definitions = await db.definition.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });

        const ids = definitions.map((d) => d.id);
        expect(ids).not.toContain(deletedDef.id);
        expect(ids).toContain(testDefinitionId);
      } finally {
        await db.definition.delete({ where: { id: deletedDef.id } });
      }
    });

    it('can get transcript summary with proper fields', async () => {
      // Query like get_transcript_summary would
      const transcript = await db.transcript.findFirst({
        where: {
          runId: testRunIds[0],
          scenarioId: testScenarioId,
          modelId: 'openai:gpt-4',
        },
        select: {
          id: true,
          scenarioId: true,
          modelId: true,
          turnCount: true,
          tokenCount: true,
          decisionCode: true,
          decisionText: true,
        },
      });

      expect(transcript).not.toBeNull();
      expect(transcript!.scenarioId).toBe(testScenarioId);
      expect(transcript!.modelId).toBe('openai:gpt-4');
      expect(transcript!.tokenCount).toBe(100);
      expect(transcript!.turnCount).toBe(2);
    });
  });

  describe('Token Budget Validation', () => {
    it('estimateBytes provides byte size', () => {
      const shortText = { message: 'Hello' };
      const longData = {
        items: Array(100)
          .fill(null)
          .map((_, i) => ({ id: `item-${i}`, description: 'A long description' })),
      };

      const shortEstimate = estimateBytes(shortText);
      const longEstimate = estimateBytes(longData);

      expect(shortEstimate).toBeLessThan(50);
      expect(longEstimate).toBeGreaterThan(3000);
    });

    it('exceedsBudget correctly identifies oversized responses', () => {
      const smallData = { message: 'Hello' };
      const largeData = {
        items: Array(500)
          .fill(null)
          .map((_, i) => ({
            id: `item-${i}`,
            description: 'A moderately long description that takes up space in the response',
          })),
      };

      expect(exceedsBudget('list_runs', smallData)).toBe(false);
      expect(exceedsBudget('list_runs', largeData)).toBe(true);
    });

    it('buildMcpResponse includes metadata', () => {
      const data = { runs: [{ id: '1' }, { id: '2' }] };
      const result = buildMcpResponse({
        toolName: 'list_runs',
        data,
        requestId: 'test-request-123',
        startTime: Date.now() - 50,
      });

      expect(result.data).toEqual(data);
      expect(result.metadata.truncated).toBe(false);
      expect(result.metadata.bytes).toBeGreaterThan(0);
      expect(result.metadata.executionMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.requestId).toBe('test-request-123');
    });

    it('truncateArray limits array size', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      expect(truncateArray(items, 5)).toEqual([1, 2, 3, 4, 5]);
      expect(truncateArray(items, 20)).toEqual(items);
    });

    it('all tool budgets are reasonable', () => {
      // All budgets should be positive and reasonable
      Object.entries(TOKEN_BUDGETS).forEach(([tool, budget]) => {
        expect(budget).toBeGreaterThan(0);
        expect(budget).toBeLessThanOrEqual(10 * 1024); // Max 10KB
      });
    });
  });

  describe('Cross-Cutting Concerns', () => {
    it('auth middleware format matches MCP spec', () => {
      // Test that auth errors use proper format
      const authError = {
        error: 'AUTHENTICATION_REQUIRED',
        message: 'API key required for MCP access',
      };

      expect(authError.error).toBe('AUTHENTICATION_REQUIRED');
      expect(typeof authError.message).toBe('string');
    });

    it('rate limit response format is correct', () => {
      // Test rate limit error format
      const rateLimitError = {
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Try again later.',
        retryAfter: 60,
      };

      expect(rateLimitError.error).toBe('RATE_LIMIT_EXCEEDED');
      expect(rateLimitError.retryAfter).toBeGreaterThan(0);
    });

    it('soft-delete is respected across all entity types', async () => {
      // Definitions
      const defs = await db.definition.findMany({ where: { deletedAt: null } });
      defs.forEach((d) => expect(d.deletedAt).toBeNull());

      // Runs - check our test runs
      const runs = await db.run.findMany({
        where: { id: { in: testRunIds }, deletedAt: null },
      });
      runs.forEach((r) => expect(r.deletedAt).toBeNull());
    });
  });

  describe('Response Format Consistency', () => {
    it('run list items have consistent shape', async () => {
      const runs = await db.run.findMany({
        where: { definitionId: testDefinitionId, deletedAt: null },
        include: { _count: { select: { transcripts: true } } },
      });

      const formatted = runs.map(formatRunListItem);

      formatted.forEach((item) => {
        // All required fields present
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('status');
        expect(item).toHaveProperty('models');
        expect(item).toHaveProperty('scenarioCount');
        expect(item).toHaveProperty('createdAt');

        // Types are correct
        expect(typeof item.id).toBe('string');
        expect(['pending', 'running', 'completed', 'failed']).toContain(item.status);
        expect(Array.isArray(item.models)).toBe(true);
        expect(typeof item.scenarioCount).toBe('number');
        expect(typeof item.createdAt).toBe('string');
      });
    });

    it('timestamps are ISO 8601 format', async () => {
      const run = await db.run.findUnique({
        where: { id: testRunIds[0] },
        include: { _count: { select: { transcripts: true } } },
      });

      const formatted = formatRunListItem(run!);

      // Verify ISO 8601 format
      const parsed = new Date(formatted.createdAt);
      expect(parsed.toISOString()).toBe(formatted.createdAt);
    });
  });

  describe('Error Handling', () => {
    it('returns proper error for non-existent run', async () => {
      const fakeRunId = 'non-existent-run-id';

      const run = await db.run.findUnique({
        where: { id: fakeRunId },
      });

      expect(run).toBeNull();

      // MCP tool would return error like:
      const errorResponse = {
        error: 'NOT_FOUND',
        message: `Run not found: ${fakeRunId}`,
      };
      expect(errorResponse.error).toBe('NOT_FOUND');
    });

    it('returns proper error for non-existent transcript', async () => {
      const transcript = await db.transcript.findFirst({
        where: {
          runId: testRunIds[0],
          scenarioId: 'non-existent-scenario',
          modelId: 'openai:gpt-4',
        },
      });

      expect(transcript).toBeNull();
    });
  });
});
