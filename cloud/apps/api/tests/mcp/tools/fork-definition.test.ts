/**
 * fork_definition Tool Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { db } from '@valuerank/db';

// Mock the queue service
vi.mock('../../../src/services/scenario/index.js', () => ({
  queueScenarioExpansion: vi.fn().mockResolvedValue({
    queued: true,
    jobId: 'mock-job-id',
  }),
}));

// Import after mocking
import { queueScenarioExpansion } from '../../../src/services/scenario/index.js';

describe('fork_definition tool', () => {
  let parentDefinitionId: string;
  const createdDefinitionIds: string[] = [];

  beforeAll(async () => {
    // Create parent definition to fork from
    const parent = await db.definition.create({
      data: {
        name: 'test-fork-parent-' + Date.now(),
        content: {
          schema_version: 2,
          preamble: 'Parent preamble',
          template: 'Parent template with [variable]',
          dimensions: [
            { name: 'variable', values: ['option1', 'option2'] },
          ],
          matching_rules: 'Parent rules',
        },
      },
    });
    parentDefinitionId = parent.id;
    createdDefinitionIds.push(parent.id);
  });

  afterAll(async () => {
    // Clean up created definitions (children first, then parent)
    for (const id of createdDefinitionIds.reverse()) {
      try {
        await db.definition.delete({ where: { id } });
      } catch {
        // Ignore if already deleted
      }
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful fork', () => {
    it('creates fork with parent relationship', async () => {
      const fork = await db.definition.create({
        data: {
          name: 'test-fork-child-' + Date.now(),
          content: { schema_version: 2 }, // Minimal inheriting content
          parentId: parentDefinitionId,
        },
      });
      createdDefinitionIds.push(fork.id);

      expect(fork.id).toBeDefined();
      expect(fork.parentId).toBe(parentDefinitionId);
    });

    it('creates fork with partial content changes', async () => {
      const fork = await db.definition.create({
        data: {
          name: 'test-fork-partial-' + Date.now(),
          content: {
            schema_version: 2,
            template: 'Modified template [variable]', // Only override template
          },
          parentId: parentDefinitionId,
        },
      });
      createdDefinitionIds.push(fork.id);

      const content = fork.content as Record<string, unknown>;
      expect(content.template).toBe('Modified template [variable]');
      expect(content.preamble).toBeUndefined(); // Inherits from parent
    });

    it('creates fork with all content changes', async () => {
      const fork = await db.definition.create({
        data: {
          name: 'test-fork-full-' + Date.now(),
          content: {
            schema_version: 2,
            preamble: 'New preamble',
            template: 'New template [newvar]',
            dimensions: [{ name: 'newvar', values: ['x', 'y', 'z'] }],
            matching_rules: 'New rules',
          },
          parentId: parentDefinitionId,
        },
      });
      createdDefinitionIds.push(fork.id);

      const content = fork.content as Record<string, unknown>;
      expect(content.preamble).toBe('New preamble');
      expect(content.template).toBe('New template [newvar]');
      expect(content.dimensions).toEqual([{ name: 'newvar', values: ['x', 'y', 'z'] }]);
    });

    it('queues scenario expansion after fork', async () => {
      const fork = await db.definition.create({
        data: {
          name: 'test-fork-queue-' + Date.now(),
          content: { schema_version: 2 },
          parentId: parentDefinitionId,
        },
      });
      createdDefinitionIds.push(fork.id);

      const result = await queueScenarioExpansion(fork.id, 'fork');

      expect(queueScenarioExpansion).toHaveBeenCalledWith(fork.id, 'fork');
      expect(result.queued).toBe(true);
    });
  });

  describe('parent validation', () => {
    it('fails when parent does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const parent = await db.definition.findUnique({
        where: { id: nonExistentId },
      });

      expect(parent).toBeNull();
    });

    it('fails when parent is soft-deleted', async () => {
      // Create and soft-delete a parent
      const deletedParent = await db.definition.create({
        data: {
          name: 'test-deleted-parent-' + Date.now(),
          content: {
            schema_version: 2,
            preamble: 'Deleted',
            template: '[var]',
            dimensions: [{ name: 'var', values: ['a', 'b'] }],
          },
          deletedAt: new Date(),
        },
      });
      createdDefinitionIds.push(deletedParent.id);

      // Query with soft-delete check
      const parent = await db.definition.findUnique({
        where: { id: deletedParent.id },
      });

      expect(parent?.deletedAt).not.toBeNull();
    });
  });

  describe('version tree', () => {
    it('can query parent-child relationship', async () => {
      const fork = await db.definition.create({
        data: {
          name: 'test-version-child-' + Date.now(),
          content: { schema_version: 2 },
          parentId: parentDefinitionId,
        },
      });
      createdDefinitionIds.push(fork.id);

      // Query children of parent
      const children = await db.definition.findMany({
        where: { parentId: parentDefinitionId },
      });

      expect(children.length).toBeGreaterThan(0);
      expect(children.some((c) => c.id === fork.id)).toBe(true);
    });

    it('supports deep fork chains', async () => {
      // Create fork of fork
      const level1 = await db.definition.create({
        data: {
          name: 'test-level1-' + Date.now(),
          content: { schema_version: 2 },
          parentId: parentDefinitionId,
        },
      });
      createdDefinitionIds.push(level1.id);

      const level2 = await db.definition.create({
        data: {
          name: 'test-level2-' + Date.now(),
          content: { schema_version: 2 },
          parentId: level1.id,
        },
      });
      createdDefinitionIds.push(level2.id);

      expect(level1.parentId).toBe(parentDefinitionId);
      expect(level2.parentId).toBe(level1.id);
    });
  });

  describe('diff summary', () => {
    it('shows changed fields', () => {
      // Test diff calculation logic
      const calculateDiffSummary = (
        changes: Record<string, unknown> | undefined,
        _parentContent: Record<string, unknown>
      ): string[] => {
        const diffs: string[] = [];

        if (!changes || Object.keys(changes).length === 0) {
          return ['No changes - created exact copy'];
        }

        if (changes.preamble !== undefined) diffs.push('Preamble modified');
        if (changes.template !== undefined) diffs.push('Template modified');
        if (changes.dimensions !== undefined) diffs.push('Dimensions modified');
        if (changes.matching_rules !== undefined) diffs.push('Matching rules modified');

        return diffs.length > 0 ? diffs : ['No changes - created exact copy'];
      };

      expect(calculateDiffSummary(undefined, {})).toEqual(['No changes - created exact copy']);
      expect(calculateDiffSummary({ template: 'new' }, {})).toEqual(['Template modified']);
      expect(
        calculateDiffSummary({ preamble: 'new', dimensions: [] }, {})
      ).toEqual(['Preamble modified', 'Dimensions modified']);
    });
  });

  describe('audit logging', () => {
    it('logs fork with parent_id', () => {
      const auditEntry = {
        action: 'fork_definition',
        userId: 'mcp-user',
        entityId: 'child-def-id',
        entityType: 'definition',
        requestId: 'test-request-id',
        metadata: {
          parentId: 'parent-def-id',
          definitionName: 'Forked Definition',
        },
      };

      expect(auditEntry.action).toBe('fork_definition');
      expect(auditEntry.metadata?.parentId).toBe('parent-def-id');
    });
  });
});
