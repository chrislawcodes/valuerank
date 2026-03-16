import DataLoader from 'dataloader';
import { db, type LevelPresetVersion } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('graphql:dataloader:level-preset');

export function createLevelPresetVersionLoader(): DataLoader<string, LevelPresetVersion | null> {
  return new DataLoader<string, LevelPresetVersion | null>(
    async (ids: readonly string[]) => {
      log.debug({ ids: [...ids] }, 'Batching level preset version load');

      const versions = await db.levelPresetVersion.findMany({
        where: { id: { in: [...ids] } },
      });

      const versionMap = new Map(versions.map((version) => [version.id, version]));
      return ids.map((id) => versionMap.get(id) ?? null);
    },
    { cache: true },
  );
}
