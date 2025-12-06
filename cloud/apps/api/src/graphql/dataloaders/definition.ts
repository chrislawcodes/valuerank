import DataLoader from 'dataloader';
import { db, type Definition } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('graphql:dataloader:definition');

// Create a new Definition DataLoader instance
// Must be created per-request to prevent cache leakage between requests
export function createDefinitionLoader(): DataLoader<string, Definition | null> {
  return new DataLoader<string, Definition | null>(
    async (ids: readonly string[]) => {
      log.debug({ ids: [...ids] }, 'Batching definition load');

      const definitions = await db.definition.findMany({
        where: { id: { in: [...ids] } },
      });

      // Create a map for O(1) lookup
      const definitionMap = new Map(definitions.map((d) => [d.id, d]));

      // Return results in the same order as input ids
      // DataLoader requires this for proper caching
      return ids.map((id) => definitionMap.get(id) ?? null);
    },
    {
      // Enable caching within the same request
      cache: true,
    }
  );
}
