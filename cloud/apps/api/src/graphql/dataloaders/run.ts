import DataLoader from 'dataloader';
import { db } from '@valuerank/db';
import type { Run } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('dataloader:run');

/**
 * Creates a DataLoader for batching Run lookups by ID.
 * Each request gets its own loader instance for proper cache isolation.
 */
export function createRunLoader(): DataLoader<string, Run | null> {
  return new DataLoader<string, Run | null>(
    async (ids: readonly string[]) => {
      log.debug({ ids: [...ids] }, 'Batching run load');

      const runs = await db.run.findMany({
        where: { id: { in: [...ids] }, deletedAt: null },
      });

      // Create lookup map for O(1) access
      const runMap = new Map(runs.map((r) => [r.id, r]));

      // Return results in same order as input IDs, null for missing
      return ids.map((id) => runMap.get(id) ?? null);
    },
    { cache: true }
  );
}
