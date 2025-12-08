/**
 * list_runs Tool Tests
 *
 * Tests for the list_runs MCP tool.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { db } from '@valuerank/db';
import { formatRunListItem } from '../../../src/services/mcp/formatters.js';

describe('list_runs tool', () => {
  // Test data IDs
  let testDefinitionId: string;
  let testRunIds: string[] = [];

  beforeAll(async () => {
    // Create a test definition
    const definition = await db.definition.create({
      data: {
        name: 'test-mcp-list-runs-definition',
        content: { scenario: 'test scenario content' },
      },
    });
    testDefinitionId = definition.id;

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
      db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'PENDING',
          config: { models: ['anthropic:claude-3'] },
        },
      }),
      db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'FAILED',
          config: { models: ['openai:gpt-4'] },
        },
      }),
    ]);
    testRunIds = runs.map((r) => r.id);
  });

  afterAll(async () => {
    // Clean up test data
    if (testRunIds.length > 0) {
      await db.run.deleteMany({
        where: { id: { in: testRunIds } },
      });
    }
    if (testDefinitionId) {
      await db.definition.delete({
        where: { id: testDefinitionId },
      });
    }
  });

  describe('formatRunListItem', () => {
    it('formats a completed run correctly', async () => {
      const run = await db.run.findUnique({
        where: { id: testRunIds[0] },
        include: { _count: { select: { transcripts: true } } },
      });

      expect(run).not.toBeNull();
      const formatted = formatRunListItem(run!);

      expect(formatted.id).toBe(testRunIds[0]);
      expect(formatted.status).toBe('completed');
      expect(formatted.models).toEqual(['openai:gpt-4', 'anthropic:claude-3']);
      expect(formatted.samplePercentage).toBe(100);
      expect(formatted.scenarioCount).toBe(0); // No transcripts created
      expect(formatted.createdAt).toBeDefined();
    });

    it('formats a running run correctly', async () => {
      const run = await db.run.findUnique({
        where: { id: testRunIds[1] },
        include: { _count: { select: { transcripts: true } } },
      });

      const formatted = formatRunListItem(run!);
      expect(formatted.status).toBe('running');
      expect(formatted.samplePercentage).toBe(50);
    });

    it('formats a pending run correctly', async () => {
      const run = await db.run.findUnique({
        where: { id: testRunIds[2] },
        include: { _count: { select: { transcripts: true } } },
      });

      const formatted = formatRunListItem(run!);
      expect(formatted.status).toBe('pending');
      expect(formatted.samplePercentage).toBeNull(); // Not set in config
    });

    it('formats a failed run correctly', async () => {
      const run = await db.run.findUnique({
        where: { id: testRunIds[3] },
        include: { _count: { select: { transcripts: true } } },
      });

      const formatted = formatRunListItem(run!);
      expect(formatted.status).toBe('failed');
    });

    it('includes ISO 8601 createdAt timestamp', async () => {
      const run = await db.run.findUnique({
        where: { id: testRunIds[0] },
        include: { _count: { select: { transcripts: true } } },
      });

      const formatted = formatRunListItem(run!);
      // Should be a valid ISO 8601 string
      expect(formatted.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(formatted.createdAt).toISOString()).toBe(formatted.createdAt);
    });
  });

  describe('query behavior', () => {
    it('can query runs by status', async () => {
      const completedRuns = await db.run.findMany({
        where: { status: 'COMPLETED', deletedAt: null },
        include: { _count: { select: { transcripts: true } } },
      });

      expect(completedRuns.length).toBeGreaterThanOrEqual(1);
      completedRuns.forEach((run) => {
        expect(run.status).toBe('COMPLETED');
      });
    });

    it('can query runs by definition_id', async () => {
      const runs = await db.run.findMany({
        where: { definitionId: testDefinitionId, deletedAt: null },
        include: { _count: { select: { transcripts: true } } },
      });

      expect(runs.length).toBe(4);
      runs.forEach((run) => {
        expect(run.definitionId).toBe(testDefinitionId);
      });
    });

    it('respects limit parameter', async () => {
      const runs = await db.run.findMany({
        where: { definitionId: testDefinitionId, deletedAt: null },
        take: 2,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { transcripts: true } } },
      });

      expect(runs.length).toBe(2);
    });

    it('excludes soft-deleted runs', async () => {
      // Create and soft-delete a run
      const softDeletedRun = await db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'COMPLETED',
          config: { models: [] },
          deletedAt: new Date(),
        },
      });

      try {
        const runs = await db.run.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });

        const ids = runs.map((r) => r.id);
        expect(ids).not.toContain(softDeletedRun.id);
      } finally {
        // Clean up
        await db.run.delete({ where: { id: softDeletedRun.id } });
      }
    });

    it('orders runs by createdAt descending', async () => {
      const runs = await db.run.findMany({
        where: { definitionId: testDefinitionId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { transcripts: true } } },
      });

      // Verify descending order
      for (let i = 0; i < runs.length - 1; i++) {
        const current = new Date(runs[i].createdAt).getTime();
        const next = new Date(runs[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('response format', () => {
    it('produces valid RunListItem shape', async () => {
      const run = await db.run.findUnique({
        where: { id: testRunIds[0] },
        include: { _count: { select: { transcripts: true } } },
      });

      const formatted = formatRunListItem(run!);

      // Verify all required fields are present
      expect(typeof formatted.id).toBe('string');
      expect(['pending', 'running', 'completed', 'failed']).toContain(formatted.status);
      expect(Array.isArray(formatted.models)).toBe(true);
      expect(typeof formatted.scenarioCount).toBe('number');
      expect(typeof formatted.createdAt).toBe('string');
      // samplePercentage can be number or null
      expect(formatted.samplePercentage === null || typeof formatted.samplePercentage === 'number').toBe(true);
    });
  });
});
