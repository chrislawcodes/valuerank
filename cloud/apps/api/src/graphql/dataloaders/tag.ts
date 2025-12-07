import DataLoader from 'dataloader';
import { db, type Tag } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('graphql:dataloader:tag');

// Create a new Tag DataLoader instance
// Must be created per-request to prevent cache leakage between requests
export function createTagLoader(): DataLoader<string, Tag | null> {
  return new DataLoader<string, Tag | null>(
    async (ids: readonly string[]) => {
      log.debug({ ids: [...ids] }, 'Batching tag load');

      const tags = await db.tag.findMany({
        where: { id: { in: [...ids] } },
      });

      // Create a map for O(1) lookup
      const tagMap = new Map(tags.map((t) => [t.id, t]));

      // Return results in the same order as input ids
      // DataLoader requires this for proper caching
      return ids.map((id) => tagMap.get(id) ?? null);
    },
    {
      // Enable caching within the same request
      cache: true,
    }
  );
}

// DataLoader for tags by definition ID (many-to-many relation)
export function createTagsByDefinitionLoader(): DataLoader<string, Tag[]> {
  return new DataLoader<string, Tag[]>(
    async (definitionIds: readonly string[]) => {
      log.debug({ definitionIds: [...definitionIds] }, 'Batching tags by definition load');

      const definitionTags = await db.definitionTag.findMany({
        where: { definitionId: { in: [...definitionIds] } },
        include: { tag: true },
        orderBy: { createdAt: 'asc' },
      });

      // Group tags by definition ID
      const tagsByDefinition = new Map<string, Tag[]>();
      for (const dt of definitionTags) {
        const existing = tagsByDefinition.get(dt.definitionId) ?? [];
        existing.push(dt.tag);
        tagsByDefinition.set(dt.definitionId, existing);
      }

      // Return results in the same order as input ids
      return definitionIds.map((id) => tagsByDefinition.get(id) ?? []);
    },
    {
      cache: true,
    }
  );
}
