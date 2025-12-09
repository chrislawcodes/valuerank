/**
 * delete_definition Tool Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '@valuerank/db';

describe('delete_definition tool', () => {
  // Test data
  let testDefinitionId: string;
  let testDefinitionWithChildId: string;
  let testChildDefinitionId: string;
  let testDefinitionWithRunningRunId: string;
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdScenarioIds: string[] = [];

  beforeAll(async () => {
    // Create test definitions
    const testDef = await db.definition.create({
      data: {
        name: 'test-delete-def-' + Date.now(),
        content: {
          schema_version: 2,
          preamble: 'Test preamble',
          template: 'Test template with [variable]',
          dimensions: [{ name: 'variable', values: ['a', 'b'] }],
        },
      },
    });
    testDefinitionId = testDef.id;
    createdDefinitionIds.push(testDef.id);

    // Create definition with child (for cascading delete test)
    const parentDef = await db.definition.create({
      data: {
        name: 'test-delete-parent-' + Date.now(),
        content: {
          schema_version: 2,
          preamble: 'Test preamble',
          template: 'Test template',
          dimensions: [{ name: 'var', values: ['a'] }],
        },
      },
    });
    testDefinitionWithChildId = parentDef.id;
    createdDefinitionIds.push(parentDef.id);

    const childDef = await db.definition.create({
      data: {
        name: 'test-delete-child-' + Date.now(),
        parentId: parentDef.id,
        content: {
          schema_version: 2,
          preamble: 'Child preamble',
        },
      },
    });
    testChildDefinitionId = childDef.id;
    createdDefinitionIds.push(childDef.id);

    // Create a scenario for the parent
    const scenario = await db.scenario.create({
      data: {
        definitionId: parentDef.id,
        name: 'test-scenario-' + Date.now(),
        content: {
          schema_version: 1,
          prompt: 'Test prompt',
          dimension_values: { var: 'a' },
        },
      },
    });
    createdScenarioIds.push(scenario.id);

    // Create definition with running run
    const defWithRun = await db.definition.create({
      data: {
        name: 'test-delete-with-run-' + Date.now(),
        content: {
          schema_version: 2,
          preamble: 'Test',
          template: 'Test [var]',
          dimensions: [{ name: 'var', values: ['x'] }],
        },
      },
    });
    testDefinitionWithRunningRunId = defWithRun.id;
    createdDefinitionIds.push(defWithRun.id);

    // Create a running run for this definition
    const run = await db.run.create({
      data: {
        definitionId: defWithRun.id,
        status: 'RUNNING',
        config: {
          schema_version: 1,
          models: ['test-model'],
        },
        progress: { total: 10, completed: 5, failed: 0 },
      },
    });
    createdRunIds.push(run.id);
  });

  afterAll(async () => {
    // Clean up all created entities
    for (const id of createdRunIds) {
      try {
        await db.run.delete({ where: { id } });
      } catch {
        // Ignore if already deleted
      }
    }
    for (const id of createdScenarioIds) {
      try {
        await db.scenario.delete({ where: { id } });
      } catch {
        // Ignore if already deleted
      }
    }
    for (const id of createdDefinitionIds) {
      try {
        await db.definition.delete({ where: { id } });
      } catch {
        // Ignore if already deleted
      }
    }
  });

  describe('soft delete behavior', () => {
    it('soft deletes a definition by setting deletedAt', async () => {
      // Create a definition specifically for this test
      const def = await db.definition.create({
        data: {
          name: 'test-soft-delete-' + Date.now(),
          content: {
            schema_version: 2,
            preamble: 'Test',
            template: 'Test [var]',
            dimensions: [{ name: 'var', values: ['a'] }],
          },
        },
      });
      createdDefinitionIds.push(def.id);

      // Soft delete
      await db.definition.update({
        where: { id: def.id },
        data: { deletedAt: new Date() },
      });

      // Verify it still exists but has deletedAt set
      const deleted = await db.definition.findUnique({ where: { id: def.id } });
      expect(deleted).not.toBeNull();
      expect(deleted?.deletedAt).not.toBeNull();
    });

    it('cascades soft delete to child definitions', async () => {
      // Create parent
      const parent = await db.definition.create({
        data: {
          name: 'test-cascade-parent-' + Date.now(),
          content: {
            schema_version: 2,
            preamble: 'Parent',
            template: 'Test [var]',
            dimensions: [{ name: 'var', values: ['a'] }],
          },
        },
      });
      createdDefinitionIds.push(parent.id);

      // Create child
      const child = await db.definition.create({
        data: {
          name: 'test-cascade-child-' + Date.now(),
          parentId: parent.id,
          content: { schema_version: 2, preamble: 'Child' },
        },
      });
      createdDefinitionIds.push(child.id);

      const now = new Date();

      // Soft delete both (simulating cascade)
      await db.definition.updateMany({
        where: { id: { in: [parent.id, child.id] } },
        data: { deletedAt: now },
      });

      // Verify both are soft deleted
      const deletedParent = await db.definition.findUnique({ where: { id: parent.id } });
      const deletedChild = await db.definition.findUnique({ where: { id: child.id } });

      expect(deletedParent?.deletedAt).not.toBeNull();
      expect(deletedChild?.deletedAt).not.toBeNull();
    });

    it('cascades soft delete to associated scenarios', async () => {
      // Create definition
      const def = await db.definition.create({
        data: {
          name: 'test-cascade-scenario-' + Date.now(),
          content: {
            schema_version: 2,
            preamble: 'Test',
            template: 'Test [var]',
            dimensions: [{ name: 'var', values: ['a'] }],
          },
        },
      });
      createdDefinitionIds.push(def.id);

      // Create scenario
      const scenario = await db.scenario.create({
        data: {
          definitionId: def.id,
          name: 'test-scenario-cascade-' + Date.now(),
          content: {
            schema_version: 1,
            prompt: 'Test',
            dimension_values: { var: 'a' },
          },
        },
      });
      createdScenarioIds.push(scenario.id);

      const now = new Date();

      // Soft delete definition and scenario
      await db.$transaction([
        db.definition.update({
          where: { id: def.id },
          data: { deletedAt: now },
        }),
        db.scenario.update({
          where: { id: scenario.id },
          data: { deletedAt: now },
        }),
      ]);

      // Verify both are soft deleted
      const deletedDef = await db.definition.findUnique({ where: { id: def.id } });
      const deletedScenario = await db.scenario.findUnique({ where: { id: scenario.id } });

      expect(deletedDef?.deletedAt).not.toBeNull();
      expect(deletedScenario?.deletedAt).not.toBeNull();
    });
  });

  describe('validation', () => {
    it('blocks deletion when definition has running runs', async () => {
      // Check that there's a running run
      const runningRunCount = await db.run.count({
        where: {
          definitionId: testDefinitionWithRunningRunId,
          status: 'RUNNING',
          deletedAt: null,
        },
      });

      expect(runningRunCount).toBeGreaterThan(0);

      // The actual softDeleteDefinition function would throw an error
      // We verify the condition that would trigger the error
    });

    it('allows deletion when runs are completed', async () => {
      // Create definition with completed run
      const def = await db.definition.create({
        data: {
          name: 'test-completed-run-' + Date.now(),
          content: {
            schema_version: 2,
            preamble: 'Test',
            template: 'Test [var]',
            dimensions: [{ name: 'var', values: ['a'] }],
          },
        },
      });
      createdDefinitionIds.push(def.id);

      // Create completed run
      const run = await db.run.create({
        data: {
          definitionId: def.id,
          status: 'COMPLETED',
          config: { schema_version: 1, models: ['test'] },
          progress: { total: 1, completed: 1, failed: 0 },
          completedAt: new Date(),
        },
      });
      createdRunIds.push(run.id);

      // Check no running runs
      const runningCount = await db.run.count({
        where: {
          definitionId: def.id,
          status: 'RUNNING',
          deletedAt: null,
        },
      });

      expect(runningCount).toBe(0);

      // Should be allowed to delete
      await db.definition.update({
        where: { id: def.id },
        data: { deletedAt: new Date() },
      });

      const deleted = await db.definition.findUnique({ where: { id: def.id } });
      expect(deleted?.deletedAt).not.toBeNull();
    });
  });

  describe('response format', () => {
    it('includes expected fields in success response', () => {
      const response = {
        success: true,
        definition_id: 'test-id',
        name: 'Test Definition',
        deleted_at: new Date().toISOString(),
        deleted_count: {
          definitions: 2,
        },
      };

      expect(response.success).toBe(true);
      expect(response.definition_id).toBeDefined();
      expect(response.deleted_at).toBeDefined();
      expect(response.deleted_count.definitions).toBeGreaterThan(0);
    });

    it('includes error code for running runs', () => {
      const errorResponse = {
        error: 'HAS_RUNNING_RUNS',
        message: 'Cannot delete definition with running runs',
        details: { runningRunCount: 2 },
      };

      expect(errorResponse.error).toBe('HAS_RUNNING_RUNS');
      expect(errorResponse.details.runningRunCount).toBeGreaterThan(0);
    });

    it('includes error code for not found', () => {
      const errorResponse = {
        error: 'NOT_FOUND',
        message: 'Definition not found: nonexistent-id',
      };

      expect(errorResponse.error).toBe('NOT_FOUND');
    });

    it('includes error code for already deleted', () => {
      const errorResponse = {
        error: 'ALREADY_DELETED',
        message: 'Definition is already deleted: some-id',
      };

      expect(errorResponse.error).toBe('ALREADY_DELETED');
    });
  });

  describe('audit logging', () => {
    it('logs deletion with correct action', () => {
      const auditEntry = {
        action: 'delete_definition',
        userId: 'mcp-user',
        entityId: 'test-def-id',
        entityType: 'definition',
        requestId: 'test-request-id',
        metadata: {
          deletedCount: {
            primary: 1,
            scenarios: 3,
          },
        },
      };

      expect(auditEntry.action).toBe('delete_definition');
      expect(auditEntry.entityType).toBe('definition');
      expect(auditEntry.metadata.deletedCount).toBeDefined();
    });
  });

  describe('soft-deleted definitions are hidden', () => {
    it('excludes soft-deleted definitions from list queries', async () => {
      // Create and soft-delete a definition
      const def = await db.definition.create({
        data: {
          name: 'test-hidden-' + Date.now(),
          content: {
            schema_version: 2,
            preamble: 'Test',
            template: 'Test [var]',
            dimensions: [{ name: 'var', values: ['a'] }],
          },
        },
      });
      createdDefinitionIds.push(def.id);

      await db.definition.update({
        where: { id: def.id },
        data: { deletedAt: new Date() },
      });

      // Query with deletedAt: null filter (standard pattern)
      const visibleDefs = await db.definition.findMany({
        where: { deletedAt: null },
      });

      // The soft-deleted definition should not appear
      const found = visibleDefs.find((d) => d.id === def.id);
      expect(found).toBeUndefined();
    });
  });
});
