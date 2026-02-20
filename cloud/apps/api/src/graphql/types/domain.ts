import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { DomainRef, DefinitionRef } from './refs.js';

export { DomainRef };

builder.objectType(DomainRef, {
  description: 'A single domain used to group vignettes',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    definitionCount: t.field({
      type: 'Int',
      resolve: async (domain) => {
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
