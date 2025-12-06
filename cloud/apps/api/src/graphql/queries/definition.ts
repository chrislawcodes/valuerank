import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { DefinitionRef } from '../types/definition.js';

// Query: definition(id: ID!) - Fetch single definition by ID
builder.queryField('definition', (t) =>
  t.field({
    type: DefinitionRef,
    nullable: true,
    description: 'Fetch a single definition by ID. Returns null if not found.',
    args: {
      id: t.arg.id({ required: true, description: 'Definition ID' }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      ctx.log.debug({ definitionId: id }, 'Fetching definition');

      const definition = await db.definition.findUnique({
        where: { id },
      });

      if (!definition) {
        ctx.log.debug({ definitionId: id }, 'Definition not found');
        return null;
      }

      return definition;
    },
  })
);
