import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { TagRef, DefinitionRef } from './refs.js';
import { UserRef } from './user.js';

// Re-export for backward compatibility
export { TagRef };

builder.objectType(TagRef, {
  description: 'A tag for organizing and categorizing definitions',
  fields: (t) => ({
    // Scalar fields
    id: t.exposeID('id', { description: 'Unique identifier' }),
    name: t.exposeString('name', { description: 'Tag name (lowercase, 1-50 characters)' }),
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
      description: 'When this tag was created',
    }),

    // Audit field: who created this tag
    createdBy: t.field({
      type: UserRef,
      nullable: true,
      description: 'User who created this tag',
      resolve: async (tag) => {
        if (!tag.createdByUserId) return null;
        return db.user.findUnique({
          where: { id: tag.createdByUserId },
        });
      },
    }),

    // Relation: definitions using this tag
    definitions: t.field({
      type: [DefinitionRef],
      description: 'Definitions using this tag',
      resolve: async (tag) => {
        const definitionTags = await db.definitionTag.findMany({
          where: { tagId: tag.id },
          include: { definition: true },
          orderBy: { createdAt: 'desc' },
        });
        return definitionTags.map((dt) => dt.definition);
      },
    }),

    // Computed: count of definitions using this tag
    definitionCount: t.field({
      type: 'Int',
      description: 'Number of definitions using this tag',
      resolve: async (tag) => {
        return db.definitionTag.count({
          where: { tagId: tag.id },
        });
      },
    }),
  }),
});
