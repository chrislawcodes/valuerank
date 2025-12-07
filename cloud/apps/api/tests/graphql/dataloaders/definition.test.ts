import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDefinitionLoader } from '../../../src/graphql/dataloaders/definition.js';
import { db } from '@valuerank/db';

// Mock Prisma client
vi.mock('@valuerank/db', () => ({
  db: {
    definition: {
      findMany: vi.fn(),
    },
  },
}));

describe('Definition DataLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createDefinitionLoader', () => {
    it('batches multiple load calls into single query', async () => {
      const mockDefinitions = [
        { id: 'def1', name: 'Definition 1', content: {}, parentId: null },
        { id: 'def2', name: 'Definition 2', content: {}, parentId: null },
        { id: 'def3', name: 'Definition 3', content: {}, parentId: null },
      ];

      vi.mocked(db.definition.findMany).mockResolvedValue(mockDefinitions as never);

      const loader = createDefinitionLoader();

      // Load multiple definitions - should batch into single query
      const [result1, result2, result3] = await Promise.all([
        loader.load('def1'),
        loader.load('def2'),
        loader.load('def3'),
      ]);

      // Verify results
      expect(result1?.id).toBe('def1');
      expect(result2?.id).toBe('def2');
      expect(result3?.id).toBe('def3');

      // Verify only one query was made
      expect(db.definition.findMany).toHaveBeenCalledTimes(1);
      expect(db.definition.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['def1', 'def2', 'def3'] }, deletedAt: null },
      });
    });

    it('returns null for non-existent IDs', async () => {
      vi.mocked(db.definition.findMany).mockResolvedValue([
        { id: 'def1', name: 'Definition 1', content: {}, parentId: null },
      ] as never);

      const loader = createDefinitionLoader();

      const [existing, missing] = await Promise.all([
        loader.load('def1'),
        loader.load('nonexistent'),
      ]);

      expect(existing?.id).toBe('def1');
      expect(missing).toBeNull();
    });

    it('returns results in correct order matching input IDs', async () => {
      // Return definitions in different order than requested
      const mockDefinitions = [
        { id: 'def3', name: 'Definition 3', content: {}, parentId: null },
        { id: 'def1', name: 'Definition 1', content: {}, parentId: null },
      ];

      vi.mocked(db.definition.findMany).mockResolvedValue(mockDefinitions as never);

      const loader = createDefinitionLoader();

      // Request in specific order: def1, def2, def3
      const [result1, result2, result3] = await Promise.all([
        loader.load('def1'),
        loader.load('def2'), // This one doesn't exist
        loader.load('def3'),
      ]);

      // Results should match request order, not DB return order
      expect(result1?.id).toBe('def1');
      expect(result2).toBeNull(); // Missing
      expect(result3?.id).toBe('def3');
    });

    it('caches results within same loader instance', async () => {
      const mockDefinition = { id: 'def1', name: 'Definition 1', content: {}, parentId: null };
      vi.mocked(db.definition.findMany).mockResolvedValue([mockDefinition] as never);

      const loader = createDefinitionLoader();

      // First load - should query DB
      await loader.load('def1');
      expect(db.definition.findMany).toHaveBeenCalledTimes(1);

      // Second load of same ID - should use cache
      await loader.load('def1');
      expect(db.definition.findMany).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('creates separate cache per loader instance (per-request isolation)', async () => {
      const mockDefinition = { id: 'def1', name: 'Definition 1', content: {}, parentId: null };
      vi.mocked(db.definition.findMany).mockResolvedValue([mockDefinition] as never);

      const loader1 = createDefinitionLoader();
      const loader2 = createDefinitionLoader();

      // Load from first loader
      await loader1.load('def1');
      expect(db.definition.findMany).toHaveBeenCalledTimes(1);

      // Load from second loader - should make new query (separate cache)
      await loader2.load('def1');
      expect(db.definition.findMany).toHaveBeenCalledTimes(2);
    });
  });
});
