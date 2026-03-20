import { builder } from '../builder.js';
import { db, type LevelPresetVersion, type PreambleVersion, type DomainContext } from '@valuerank/db';
import { DomainRef, DefinitionRef, LevelPresetVersionRef, PreambleVersionRef, DomainContextRef } from './refs.js';

export { DomainRef };

type DomainWithDefaults = {
  defaultLevelPresetVersion?: LevelPresetVersion | null;
  defaultPreambleVersion?: PreambleVersion | null;
  defaultContext?: DomainContext | null;
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
      resolve: async (domain) => {
        const preloaded = (domain as DomainWithDefaults).defaultLevelPresetVersion;
        if (preloaded !== undefined) return preloaded;
        if (domain.defaultLevelPresetVersionId == null) return null;
        return db.levelPresetVersion.findUnique({ where: { id: domain.defaultLevelPresetVersionId } });
      },
    }),
    defaultPreambleVersionId: t.exposeString('defaultPreambleVersionId', { nullable: true }),
    defaultPreambleVersion: t.field({
      type: PreambleVersionRef,
      nullable: true,
      resolve: async (domain) => {
        const preloaded = (domain as DomainWithDefaults).defaultPreambleVersion;
        if (preloaded !== undefined) return preloaded;
        if (domain.defaultPreambleVersionId == null) return null;
        return db.preambleVersion.findUnique({ where: { id: domain.defaultPreambleVersionId } });
      },
    }),
    defaultContextId: t.exposeString('defaultContextId', { nullable: true }),
    defaultContext: t.field({
      type: DomainContextRef,
      nullable: true,
      resolve: async (domain) => {
        const preloaded = (domain as DomainWithDefaults).defaultContext;
        if (preloaded !== undefined) return preloaded;
        if (domain.defaultContextId == null) return null;
        return db.domainContext.findUnique({ where: { id: domain.defaultContextId } });
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
