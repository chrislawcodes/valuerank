import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import type { Prisma } from '@valuerank/db';
import { DefinitionRef } from '../types/definition.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

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

// Query: definitions(rootOnly, limit, offset) - List definitions with filtering
builder.queryField('definitions', (t) =>
  t.field({
    type: [DefinitionRef],
    description: 'List definitions with optional filtering and pagination.',
    args: {
      rootOnly: t.arg.boolean({
        required: false,
        description: 'If true, return only root definitions (no parent)',
      }),
      limit: t.arg.int({
        required: false,
        description: `Maximum number of results (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
      }),
      offset: t.arg.int({
        required: false,
        description: 'Number of results to skip for pagination (default: 0)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      // Validate and apply defaults
      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = args.offset ?? 0;

      ctx.log.debug({ rootOnly: args.rootOnly, limit, offset }, 'Listing definitions');

      // Build where clause
      const where: Prisma.DefinitionWhereInput = {};
      if (args.rootOnly) {
        where.parentId = null;
      }

      const definitions = await db.definition.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      });

      ctx.log.debug({ count: definitions.length }, 'Definitions fetched');
      return definitions;
    },
  })
);
