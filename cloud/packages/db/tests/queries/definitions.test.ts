/**
 * Tests for definition query helpers
 *
 * Tests CRUD operations, ancestry queries, and soft delete behavior.
 */

import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/client.js';
import {
  createDefinition,
  forkDefinition,
  getDefinitionById,
  getDefinitionWithContent,
  resolveDefinitionContent,
  listDefinitions,
  updateDefinition,
  getAncestors,
  getDescendants,
  getDefinitionTree,
  getDefinitionTreeIds,
  softDeleteDefinition,
  touchDefinition,
  touchDefinitions,
  type CreateDefinitionInput,
  type DefinitionFilters,
} from '../../src/queries/definitions.js';
import { NotFoundError, ValidationError } from '@valuerank/shared';

describe('definition queries', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];

  afterEach(async () => {
    // Clean up runs first
    if (createdRunIds.length > 0) {
      await db.run.deleteMany({
        where: { id: { in: createdRunIds } },
      });
      createdRunIds.length = 0;
    }

    // Hard delete definitions for test cleanup (cascade tags, scenarios)
    if (createdDefinitionIds.length > 0) {
      await db.definitionTag.deleteMany({
        where: { definitionId: { in: createdDefinitionIds } },
      });
      await db.scenario.deleteMany({
        where: { definitionId: { in: createdDefinitionIds } },
      });
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
  });

  const testContent = {
    schema_version: 2 as const,
    preamble: 'Test preamble',
    template: 'Test template with [variable]',
    dimensions: [
      {
        name: 'variable',
        levels: [
          { score: 1, label: 'low' },
          { score: 2, label: 'high' },
        ],
      },
    ],
  };

  describe('createDefinition', () => {
    it('creates a definition with valid input', async () => {
      const input: CreateDefinitionInput = {
        name: 'Test Definition ' + Date.now(),
        content: testContent,
      };

      const definition = await createDefinition(input);
      createdDefinitionIds.push(definition.id);

      expect(definition.id).toBeDefined();
      expect(definition.name).toBe(input.name);
      expect(definition.parentId).toBeNull();
    });

    it('creates a definition with parentId', async () => {
      // Create parent
      const parent = await createDefinition({
        name: 'Parent Definition ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      // Create child
      const child = await createDefinition({
        name: 'Child Definition ' + Date.now(),
        content: testContent,
        parentId: parent.id,
      });
      createdDefinitionIds.push(child.id);

      expect(child.parentId).toBe(parent.id);
    });

    it('throws ValidationError for empty name', async () => {
      await expect(
        createDefinition({
          name: '',
          content: testContent,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for whitespace-only name', async () => {
      await expect(
        createDefinition({
          name: '   ',
          content: testContent,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for missing content', async () => {
      await expect(
        createDefinition({
          name: 'Test',
          content: undefined as unknown as typeof testContent,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('forkDefinition', () => {
    it('creates a fork linked to parent', async () => {
      const parent = await createDefinition({
        name: 'Parent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      const fork = await forkDefinition(parent.id, {
        name: 'Fork ' + Date.now(),
      });
      createdDefinitionIds.push(fork.id);

      expect(fork.parentId).toBe(parent.id);
      expect(fork.name).toContain('Fork');
    });

    it('uses default fork name if not provided', async () => {
      const parent = await createDefinition({
        name: 'Parent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      const fork = await forkDefinition(parent.id, {});
      createdDefinitionIds.push(fork.id);

      expect(fork.name).toContain('(fork)');
    });

    it('allows overriding content in fork', async () => {
      const parent = await createDefinition({
        name: 'Parent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      const newContent = {
        ...testContent,
        preamble: 'New preamble for fork',
      };

      const fork = await forkDefinition(parent.id, {
        content: newContent,
      });
      createdDefinitionIds.push(fork.id);

      expect(fork.content).toMatchObject({ preamble: 'New preamble for fork' });
    });

    it('throws NotFoundError for non-existent parent', async () => {
      await expect(
        forkDefinition('non-existent-id', { name: 'Fork' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getDefinitionById', () => {
    it('returns definition when exists', async () => {
      const created = await createDefinition({
        name: 'Test ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(created.id);

      const fetched = await getDefinitionById(created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe(created.name);
    });

    it('throws NotFoundError for non-existent id', async () => {
      await expect(getDefinitionById('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for soft-deleted definition', async () => {
      const created = await createDefinition({
        name: 'Test ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(created.id);

      // Soft delete
      await db.definition.update({
        where: { id: created.id },
        data: { deletedAt: new Date() },
      });

      await expect(getDefinitionById(created.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getDefinitionWithContent', () => {
    it('returns definition with parsed content', async () => {
      const created = await createDefinition({
        name: 'Test ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(created.id);

      const result = await getDefinitionWithContent(created.id);

      expect(result.id).toBe(created.id);
      expect(result.parsedContent).toBeDefined();
      expect(result.parsedContent.preamble).toBe(testContent.preamble);
    });
  });

  describe('resolveDefinitionContent', () => {
    it('returns content directly for root definition', async () => {
      const created = await createDefinition({
        name: 'Root ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(created.id);

      const result = await resolveDefinitionContent(created.id);

      expect(result.isForked).toBe(false);
      expect(result.resolvedContent.preamble).toBe(testContent.preamble);
    });

    it('merges content from parent for forked definition', async () => {
      const parent = await createDefinition({
        name: 'Parent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      const childContent = {
        ...testContent,
        preamble: 'Child preamble',
      };

      const child = await forkDefinition(parent.id, {
        name: 'Child ' + Date.now(),
        content: childContent,
      });
      createdDefinitionIds.push(child.id);

      const result = await resolveDefinitionContent(child.id);

      expect(result.isForked).toBe(true);
      expect(result.resolvedContent.preamble).toBe('Child preamble');
    });

    it('tracks overrides correctly', async () => {
      const parent = await createDefinition({
        name: 'Parent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      const child = await forkDefinition(parent.id, {
        name: 'Child ' + Date.now(),
        content: {
          ...testContent,
          preamble: 'Overridden preamble',
        },
      });
      createdDefinitionIds.push(child.id);

      const result = await resolveDefinitionContent(child.id);

      expect(result.overrides).toBeDefined();
    });
  });

  describe('listDefinitions', () => {
    it('returns all non-deleted definitions', async () => {
      const def1 = await createDefinition({
        name: 'List Test 1 ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(def1.id);

      const def2 = await createDefinition({
        name: 'List Test 2 ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(def2.id);

      const results = await listDefinitions();

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.find((d) => d.id === def1.id)).toBeDefined();
      expect(results.find((d) => d.id === def2.id)).toBeDefined();
    });

    it('excludes soft-deleted definitions', async () => {
      const def = await createDefinition({
        name: 'Deleted Test ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(def.id);

      // Soft delete
      await db.definition.update({
        where: { id: def.id },
        data: { deletedAt: new Date() },
      });

      const results = await listDefinitions();

      expect(results.find((d) => d.id === def.id)).toBeUndefined();
    });

    it('filters by name', async () => {
      const uniqueName = 'UniqueFilterName' + Date.now();
      const def = await createDefinition({
        name: uniqueName,
        content: testContent,
      });
      createdDefinitionIds.push(def.id);

      const results = await listDefinitions({ name: uniqueName });

      expect(results.length).toBe(1);
      expect(results[0].name).toBe(uniqueName);
    });

    it('filters by hasParent=true', async () => {
      const parent = await createDefinition({
        name: 'Parent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      const child = await forkDefinition(parent.id, {
        name: 'Child ' + Date.now(),
      });
      createdDefinitionIds.push(child.id);

      const results = await listDefinitions({ hasParent: true });

      expect(results.find((d) => d.id === child.id)).toBeDefined();
      expect(results.find((d) => d.id === parent.id)).toBeUndefined();
    });

    it('filters by hasParent=false', async () => {
      const root = await createDefinition({
        name: 'Root ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(root.id);

      const results = await listDefinitions({ hasParent: false });

      expect(results.find((d) => d.id === root.id)).toBeDefined();
    });

    it('respects limit', async () => {
      // Create a few definitions
      for (let i = 0; i < 3; i++) {
        const def = await createDefinition({
          name: `Limit Test ${i} ` + Date.now(),
          content: testContent,
        });
        createdDefinitionIds.push(def.id);
      }

      const results = await listDefinitions({ limit: 2 });

      expect(results.length).toBe(2);
    });

    it('respects offset', async () => {
      const results1 = await listDefinitions({ limit: 5 });
      const results2 = await listDefinitions({ limit: 5, offset: 2 });

      // Offset results should skip first 2
      if (results1.length > 2) {
        expect(results2[0]?.id).not.toBe(results1[0]?.id);
      }
    });
  });

  describe('updateDefinition', () => {
    it('updates name', async () => {
      const created = await createDefinition({
        name: 'Original ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(created.id);

      const newName = 'Updated ' + Date.now();
      const updated = await updateDefinition(created.id, { name: newName });

      expect(updated.name).toBe(newName);
    });

    it('updates content', async () => {
      const created = await createDefinition({
        name: 'Content Test ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(created.id);

      const newContent = {
        ...testContent,
        preamble: 'Updated preamble',
      };

      const updated = await updateDefinition(created.id, { content: newContent });

      expect(updated.content).toMatchObject({ preamble: 'Updated preamble' });
    });

    it('throws NotFoundError for non-existent definition', async () => {
      await expect(
        updateDefinition('non-existent', { name: 'New name' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getAncestors', () => {
    it('returns empty array for root definition', async () => {
      const root = await createDefinition({
        name: 'Root ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(root.id);

      const ancestors = await getAncestors(root.id);

      expect(ancestors).toEqual([]);
    });

    it('returns parent for forked definition', async () => {
      const parent = await createDefinition({
        name: 'Parent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      const child = await forkDefinition(parent.id, { name: 'Child ' + Date.now() });
      createdDefinitionIds.push(child.id);

      const ancestors = await getAncestors(child.id);

      expect(ancestors.length).toBe(1);
      expect(ancestors[0].id).toBe(parent.id);
    });

    it('returns full ancestor chain for deeply nested fork', async () => {
      const grandparent = await createDefinition({
        name: 'Grandparent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(grandparent.id);

      const parent = await forkDefinition(grandparent.id, { name: 'Parent ' + Date.now() });
      createdDefinitionIds.push(parent.id);

      const child = await forkDefinition(parent.id, { name: 'Child ' + Date.now() });
      createdDefinitionIds.push(child.id);

      const ancestors = await getAncestors(child.id);

      expect(ancestors.length).toBe(2);
      // Ordered from oldest to newest
      expect(ancestors[0].id).toBe(grandparent.id);
      expect(ancestors[1].id).toBe(parent.id);
    });

    it('excludes soft-deleted ancestors', async () => {
      const parent = await createDefinition({
        name: 'Parent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      const child = await forkDefinition(parent.id, { name: 'Child ' + Date.now() });
      createdDefinitionIds.push(child.id);

      // Soft delete parent
      await db.definition.update({
        where: { id: parent.id },
        data: { deletedAt: new Date() },
      });

      const ancestors = await getAncestors(child.id);

      expect(ancestors.length).toBe(0);
    });
  });

  describe('getDescendants', () => {
    it('returns empty array for leaf definition', async () => {
      const leaf = await createDefinition({
        name: 'Leaf ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(leaf.id);

      const descendants = await getDescendants(leaf.id);

      expect(descendants).toEqual([]);
    });

    it('returns children for parent definition', async () => {
      const parent = await createDefinition({
        name: 'Parent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      const child1 = await forkDefinition(parent.id, { name: 'Child 1 ' + Date.now() });
      createdDefinitionIds.push(child1.id);

      const child2 = await forkDefinition(parent.id, { name: 'Child 2 ' + Date.now() });
      createdDefinitionIds.push(child2.id);

      const descendants = await getDescendants(parent.id);

      expect(descendants.length).toBe(2);
    });

    it('returns full descendant tree', async () => {
      const root = await createDefinition({
        name: 'Root ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(root.id);

      const child = await forkDefinition(root.id, { name: 'Child ' + Date.now() });
      createdDefinitionIds.push(child.id);

      const grandchild = await forkDefinition(child.id, { name: 'Grandchild ' + Date.now() });
      createdDefinitionIds.push(grandchild.id);

      const descendants = await getDescendants(root.id);

      expect(descendants.length).toBe(2);
    });

    it('excludes soft-deleted descendants', async () => {
      const parent = await createDefinition({
        name: 'Parent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      const child = await forkDefinition(parent.id, { name: 'Child ' + Date.now() });
      createdDefinitionIds.push(child.id);

      // Soft delete child
      await db.definition.update({
        where: { id: child.id },
        data: { deletedAt: new Date() },
      });

      const descendants = await getDescendants(parent.id);

      expect(descendants.length).toBe(0);
    });
  });

  describe('getDefinitionTree', () => {
    it('builds tree structure from root', async () => {
      const root = await createDefinition({
        name: 'Tree Root ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(root.id);

      const child1 = await forkDefinition(root.id, { name: 'Tree Child 1 ' + Date.now() });
      createdDefinitionIds.push(child1.id);

      const child2 = await forkDefinition(root.id, { name: 'Tree Child 2 ' + Date.now() });
      createdDefinitionIds.push(child2.id);

      const tree = await getDefinitionTree(root.id);

      expect(tree.id).toBe(root.id);
      expect(tree.children.length).toBe(2);
      expect(tree.children.map((c) => c.id)).toContain(child1.id);
      expect(tree.children.map((c) => c.id)).toContain(child2.id);
    });

    it('throws NotFoundError for non-existent root', async () => {
      await expect(getDefinitionTree('non-existent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getDefinitionTreeIds', () => {
    it('returns all IDs in tree', async () => {
      const root = await createDefinition({
        name: 'IDs Root ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(root.id);

      const child = await forkDefinition(root.id, { name: 'IDs Child ' + Date.now() });
      createdDefinitionIds.push(child.id);

      const grandchild = await forkDefinition(child.id, { name: 'IDs Grandchild ' + Date.now() });
      createdDefinitionIds.push(grandchild.id);

      const ids = await getDefinitionTreeIds(root.id);

      expect(ids).toContain(root.id);
      expect(ids).toContain(child.id);
      expect(ids).toContain(grandchild.id);
      expect(ids.length).toBe(3);
    });
  });

  describe('softDeleteDefinition', () => {
    it('soft deletes a definition', async () => {
      const def = await createDefinition({
        name: 'Soft Delete Test ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(def.id);

      const result = await softDeleteDefinition(def.id);

      expect(result.definitionIds).toContain(def.id);
      expect(result.deletedCount.definitions).toBe(1);

      // Verify in database
      const deleted = await db.definition.findUnique({ where: { id: def.id } });
      expect(deleted?.deletedAt).not.toBeNull();
    });

    it('cascades to scenarios', async () => {
      const def = await createDefinition({
        name: 'Cascade Scenario Test ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(def.id);

      // Create scenario
      const scenario = await db.scenario.create({
        data: {
          definitionId: def.id,
          name: 'Test Scenario',
          content: {
            schema_version: 1,
            prompt: 'Test scenario body',
            dimension_values: {},
          },
        },
      });

      const result = await softDeleteDefinition(def.id);

      expect(result.deletedCount.scenarios).toBeGreaterThanOrEqual(1);

      // Verify scenario is soft deleted
      const deletedScenario = await db.scenario.findUnique({ where: { id: scenario.id } });
      expect(deletedScenario?.deletedAt).not.toBeNull();
    });

    it('cascades to descendants', async () => {
      const parent = await createDefinition({
        name: 'Cascade Parent ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(parent.id);

      const child = await forkDefinition(parent.id, { name: 'Cascade Child ' + Date.now() });
      createdDefinitionIds.push(child.id);

      const result = await softDeleteDefinition(parent.id);

      expect(result.definitionIds).toContain(parent.id);
      expect(result.definitionIds).toContain(child.id);
      expect(result.deletedCount.definitions).toBe(2);
    });

    it('throws NotFoundError for non-existent definition', async () => {
      await expect(softDeleteDefinition('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError for already deleted definition', async () => {
      const def = await createDefinition({
        name: 'Already Deleted Test ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(def.id);

      // First delete
      await softDeleteDefinition(def.id);

      // Second delete should fail
      await expect(softDeleteDefinition(def.id)).rejects.toThrow(ValidationError);
    });

    it('blocks deletion when run is RUNNING', async () => {
      const def = await createDefinition({
        name: 'Running Run Test ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(def.id);

      // Create a running run
      const run = await db.run.create({
        data: {
          definitionId: def.id,
          status: 'RUNNING',
          config: { models: ['test'] },
          progress: { total: 10, completed: 5, failed: 0 },
        },
      });
      createdRunIds.push(run.id);

      await expect(softDeleteDefinition(def.id)).rejects.toThrow(ValidationError);
    });
  });

  describe('touchDefinition', () => {
    it('updates lastAccessedAt timestamp', async () => {
      const def = await createDefinition({
        name: 'Touch Test ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(def.id);

      const beforeTouch = await db.definition.findUnique({ where: { id: def.id } });
      const beforeTimestamp = beforeTouch?.lastAccessedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await touchDefinition(def.id);

      const afterTouch = await db.definition.findUnique({ where: { id: def.id } });

      expect(afterTouch?.lastAccessedAt).not.toEqual(beforeTimestamp);
    });
  });

  describe('touchDefinitions', () => {
    it('updates lastAccessedAt for multiple definitions', async () => {
      const def1 = await createDefinition({
        name: 'Touch Multi 1 ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(def1.id);

      const def2 = await createDefinition({
        name: 'Touch Multi 2 ' + Date.now(),
        content: testContent,
      });
      createdDefinitionIds.push(def2.id);

      await touchDefinitions([def1.id, def2.id]);

      const updated1 = await db.definition.findUnique({ where: { id: def1.id } });
      const updated2 = await db.definition.findUnique({ where: { id: def2.id } });

      expect(updated1?.lastAccessedAt).not.toBeNull();
      expect(updated2?.lastAccessedAt).not.toBeNull();
    });

    it('handles empty array', async () => {
      // Should not throw
      await expect(touchDefinitions([])).resolves.toBeUndefined();
    });
  });
});
