/**
 * list_definitions Tool Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@valuerank/db';
import { formatDefinitionListItem } from '../../../src/services/mcp/formatters.js';

describe('list_definitions tool', () => {
  let testParentDefId: string;
  let testChildDefId: string;

  beforeAll(async () => {
    // Create parent definition
    const parentDef = await db.definition.create({
      data: {
        name: 'test-mcp-parent-definition',
        content: { scenario: 'parent scenario', versionLabel: 'baseline' },
      },
    });
    testParentDefId = parentDef.id;

    // Create child definition
    const childDef = await db.definition.create({
      data: {
        name: 'test-mcp-child-definition',
        parentId: testParentDefId,
        content: { scenario: 'child scenario', versionLabel: 'v1.1' },
      },
    });
    testChildDefId = childDef.id;
  });

  afterAll(async () => {
    // Clean up in correct order (child first)
    if (testChildDefId) {
      await db.definition.delete({ where: { id: testChildDefId } });
    }
    if (testParentDefId) {
      await db.definition.delete({ where: { id: testParentDefId } });
    }
  });

  describe('formatDefinitionListItem', () => {
    it('formats parent definition correctly', async () => {
      const def = await db.definition.findUnique({
        where: { id: testParentDefId },
      });

      const formatted = formatDefinitionListItem(def!);

      expect(formatted.id).toBe(testParentDefId);
      expect(formatted.name).toBe('test-mcp-parent-definition');
      expect(formatted.versionLabel).toBe('baseline');
      expect(formatted.parentId).toBeNull();
      expect(formatted.createdAt).toBeDefined();
    });

    it('formats child definition with parentId', async () => {
      const def = await db.definition.findUnique({
        where: { id: testChildDefId },
      });

      const formatted = formatDefinitionListItem(def!);

      expect(formatted.id).toBe(testChildDefId);
      expect(formatted.parentId).toBe(testParentDefId);
      expect(formatted.versionLabel).toBe('v1.1');
    });

    it('includes childCount when provided', async () => {
      const def = await db.definition.findUnique({
        where: { id: testParentDefId },
      });

      const formatted = formatDefinitionListItem(def!, 1);

      expect(formatted.childCount).toBe(1);
    });

    it('omits childCount when not provided', async () => {
      const def = await db.definition.findUnique({
        where: { id: testParentDefId },
      });

      const formatted = formatDefinitionListItem(def!);

      expect(formatted.childCount).toBeUndefined();
    });
  });

  describe('query behavior', () => {
    it('can filter definitions by name', async () => {
      const definitions = await db.definition.findMany({
        where: {
          deletedAt: null,
          name: { contains: 'test-mcp-parent' },
        },
      });

      expect(definitions.length).toBeGreaterThanOrEqual(1);
      expect(definitions.some((d) => d.id === testParentDefId)).toBe(true);
    });

    it('excludes soft-deleted definitions', async () => {
      // Create and soft-delete a definition
      const deletedDef = await db.definition.create({
        data: {
          name: 'test-mcp-deleted-definition',
          content: { scenario: 'deleted' },
          deletedAt: new Date(),
        },
      });

      try {
        const definitions = await db.definition.findMany({
          where: { deletedAt: null },
        });

        const ids = definitions.map((d) => d.id);
        expect(ids).not.toContain(deletedDef.id);
      } finally {
        await db.definition.delete({ where: { id: deletedDef.id } });
      }
    });

    it('can include child count', async () => {
      const definitions = await db.definition.findMany({
        where: { id: testParentDefId },
        include: {
          _count: { select: { children: true } },
        },
      });

      expect(definitions.length).toBe(1);
      expect(definitions[0]._count.children).toBe(1);
    });
  });
});
