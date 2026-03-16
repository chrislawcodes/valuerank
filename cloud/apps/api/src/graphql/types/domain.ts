import { builder } from '../builder.js';
import { db, type LevelPresetVersion } from '@valuerank/db';
import { DomainRef, DefinitionRef, LevelPresetVersionRef } from './refs.js';

export { DomainRef };

type DomainWithDefaultPreset = {
  defaultLevelPresetVersion?: LevelPresetVersion | null;
};

builder.objectType(DomainRef, {
  description: 'A single domain used to group vignettes',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    normalizedName: t.exposeString('normalizedName'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    defaultLevelPresetVersionId: t.exposeString('defaultLevelPresetVersionId', { nullable: true }),
    defaultLevelPresetVersion: t.field({
      type: LevelPresetVersionRef,
      nullable: true,
      description: 'Compatibility field for older clients that still read domain default level presets',
      resolve: async (domain) => {
        const preloadedDefaultLevelPresetVersion = (domain as DomainWithDefaultPreset).defaultLevelPresetVersion;
        if (preloadedDefaultLevelPresetVersion !== undefined) {
          return preloadedDefaultLevelPresetVersion;
        }
        if (domain.defaultLevelPresetVersionId == null) return null;
        return db.levelPresetVersion.findUnique({
          where: { id: domain.defaultLevelPresetVersionId },
        });
      },
    }),
    definitionCount: t.field({
      type: 'Int',
      resolve: async (domain) => {
        if ('definitionCount' in domain && typeof domain.definitionCount === 'number') {
          return domain.definitionCount;
        }
        return db.definition.count({
          where: { domainId: domain.id, deletedAt: null },
        });
      },
    }),
    definitions: t.field({
      type: [DefinitionRef],
      resolve: async (domain) => {
        return db.definition.findMany({
          where: { domainId: domain.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),
  }),
});
