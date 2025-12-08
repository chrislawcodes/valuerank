/**
 * Integration tests for definition query helpers.
 *
 * These tests require a running database.
 * Run with: DATABASE_URL="..." npm test
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createDefinition,
  getDefinitionById,
  getDefinitionWithContent,
  listDefinitions,
  updateDefinition,
  forkDefinition,
  getAncestors,
  getDescendants,
  getDefinitionTree,
} from '../src/queries/definitions.js';
import type { DefinitionContent } from '../src/types.js';

const prisma = new PrismaClient();

// Skip tests if no database URL
const skipIfNoDb = process.env.DATABASE_URL ? describe : describe.skip;

skipIfNoDb('Definition Queries (Integration)', () => {
  beforeEach(async () => {
    // Clean up test data in correct FK order
    await prisma.analysisResult.deleteMany();
    await prisma.runComparison.deleteMany();
    await prisma.runScenarioSelection.deleteMany();
    await prisma.transcript.deleteMany();
    await prisma.scenario.deleteMany();
    await prisma.run.deleteMany();
    await prisma.experiment.deleteMany();
    await prisma.definition.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('createDefinition', () => {
    it('creates a definition with valid content', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: 'Test preamble',
        template: 'Test {{variable}}',
        dimensions: [{ name: 'test', values: ['a', 'b'] }],
      };

      const result = await createDefinition({
        name: 'Test Definition',
        content,
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Definition');
      expect(result.parentId).toBeNull();
    });

    it('throws on empty name', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: '',
        template: '',
        dimensions: [],
      };

      await expect(
        createDefinition({ name: '', content })
      ).rejects.toThrow('Definition name is required');
    });

    it('throws on missing content', async () => {
      await expect(
        createDefinition({ name: 'Test', content: undefined as unknown as DefinitionContent })
      ).rejects.toThrow('Definition content is required');
    });
  });

  describe('getDefinitionById', () => {
    it('returns definition when exists', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: 'Test',
        template: 'Test',
        dimensions: [],
      };

      const created = await createDefinition({ name: 'Test', content });
      const result = await getDefinitionById(created.id);

      expect(result.id).toBe(created.id);
      expect(result.name).toBe('Test');
    });

    it('throws NotFoundError when not exists', async () => {
      await expect(
        getDefinitionById('non-existent-id')
      ).rejects.toThrow('Definition not found: non-existent-id');
    });
  });

  describe('getDefinitionWithContent', () => {
    it('returns definition with parsed content', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: 'Parsed preamble',
        template: 'Parsed template',
        dimensions: [{ name: 'd1', values: ['v1'] }],
      };

      const created = await createDefinition({ name: 'Test', content });
      const result = await getDefinitionWithContent(created.id);

      expect(result.parsedContent.schema_version).toBe(1);
      expect(result.parsedContent.preamble).toBe('Parsed preamble');
      expect(result.parsedContent.dimensions).toHaveLength(1);
    });
  });

  describe('listDefinitions', () => {
    it('returns all definitions', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: '',
        template: '',
        dimensions: [],
      };

      await createDefinition({ name: 'Def1', content });
      await createDefinition({ name: 'Def2', content });

      const result = await listDefinitions();

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by name (case insensitive)', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: '',
        template: '',
        dimensions: [],
      };

      await createDefinition({ name: 'Unique Name XYZ', content });

      const result = await listDefinitions({ name: 'unique' });

      expect(result.some((d) => d.name === 'Unique Name XYZ')).toBe(true);
    });

    it('filters by hasParent', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: '',
        template: '',
        dimensions: [],
      };

      const parent = await createDefinition({ name: 'Parent', content });
      await createDefinition({ name: 'Child', content, parentId: parent.id });

      const rootsOnly = await listDefinitions({ hasParent: false });
      const childrenOnly = await listDefinitions({ hasParent: true });

      expect(rootsOnly.every((d) => d.parentId === null)).toBe(true);
      expect(childrenOnly.every((d) => d.parentId !== null)).toBe(true);
    });

    it('supports pagination', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: '',
        template: '',
        dimensions: [],
      };

      await createDefinition({ name: 'Page1', content });
      await createDefinition({ name: 'Page2', content });
      await createDefinition({ name: 'Page3', content });

      const page1 = await listDefinitions({ limit: 2, offset: 0 });
      const page2 = await listDefinitions({ limit: 2, offset: 2 });

      expect(page1.length).toBeLessThanOrEqual(2);
    });
  });

  describe('updateDefinition', () => {
    it('updates definition name', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: '',
        template: '',
        dimensions: [],
      };

      const created = await createDefinition({ name: 'Original', content });
      const updated = await updateDefinition(created.id, { name: 'Updated' });

      expect(updated.name).toBe('Updated');
    });

    it('throws NotFoundError for non-existent id', async () => {
      await expect(
        updateDefinition('non-existent', { name: 'Test' })
      ).rejects.toThrow('Definition not found');
    });
  });

  describe('forkDefinition', () => {
    it('creates a child definition linked to parent', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: 'Parent content',
        template: '',
        dimensions: [],
      };

      const parent = await createDefinition({ name: 'Parent', content });
      const forked = await forkDefinition(parent.id, { name: 'Forked' });

      expect(forked.parentId).toBe(parent.id);
      expect(forked.name).toBe('Forked');
    });

    it('inherits parent content if not provided', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: 'Inherited',
        template: '',
        dimensions: [],
      };

      const parent = await createDefinition({ name: 'Parent', content });
      const forked = await forkDefinition(parent.id, {});

      const forkedContent = await getDefinitionWithContent(forked.id);
      expect(forkedContent.parsedContent.preamble).toBe('Inherited');
    });

    it('throws NotFoundError for non-existent parent', async () => {
      await expect(forkDefinition('non-existent', {})).rejects.toThrow(
        'Definition not found'
      );
    });
  });

  describe('Ancestry Queries', () => {
    it('getAncestors returns parent chain', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: '',
        template: '',
        dimensions: [],
      };

      const grandparent = await createDefinition({ name: 'Grandparent', content });
      const parent = await forkDefinition(grandparent.id, { name: 'Parent' });
      const child = await forkDefinition(parent.id, { name: 'Child' });

      const ancestors = await getAncestors(child.id);

      expect(ancestors.length).toBe(2);
      expect(ancestors.map((a) => a.name)).toContain('Parent');
      expect(ancestors.map((a) => a.name)).toContain('Grandparent');
    });

    it('getDescendants returns children chain', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: '',
        template: '',
        dimensions: [],
      };

      const root = await createDefinition({ name: 'Root', content });
      const child1 = await forkDefinition(root.id, { name: 'Child1' });
      const child2 = await forkDefinition(root.id, { name: 'Child2' });
      await forkDefinition(child1.id, { name: 'Grandchild' });

      const descendants = await getDescendants(root.id);

      expect(descendants.length).toBe(3);
    });

    it('getDefinitionTree returns hierarchical structure', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: '',
        template: '',
        dimensions: [],
      };

      const root = await createDefinition({ name: 'Root', content });
      await forkDefinition(root.id, { name: 'Child1' });
      await forkDefinition(root.id, { name: 'Child2' });

      const tree = await getDefinitionTree(root.id);

      expect(tree.id).toBe(root.id);
      expect(tree.name).toBe('Root');
      expect(tree.children.length).toBe(2);
    });
  });
});
