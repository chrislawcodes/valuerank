import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { TagRef } from '../types/refs.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

// Query: tags - List all tags with optional search
builder.queryField('tags', (t) =>
  t.field({
    type: [TagRef],
    description: 'List all tags, optionally filtered by name search.',
    args: {
      search: t.arg.string({
        required: false,
        description: 'Search tags by name (contains match)',
      }),
      limit: t.arg.int({
        required: false,
        description: `Maximum number of results (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
      }),
      offset: t.arg.int({
        required: false,
        description: 'Number of results to skip (default: 0)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = args.offset ?? 0;

      ctx.log.debug({ search: args.search, limit, offset }, 'Listing tags');

      const where = args.search
        ? { name: { contains: args.search.toLowerCase(), mode: 'insensitive' as const } }
        : {};

      const tags = await db.tag.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { name: 'asc' },
      });

      ctx.log.debug({ count: tags.length }, 'Tags fetched');
      return tags;
    },
  })
);

// Query: tag(id) - Get a single tag by ID
builder.queryField('tag', (t) =>
  t.field({
    type: TagRef,
    nullable: true,
    description: 'Get a single tag by ID.',
    args: {
      id: t.arg.id({
        required: true,
        description: 'Tag ID',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      ctx.log.debug({ tagId: id }, 'Fetching tag');

      const tag = await db.tag.findUnique({
        where: { id },
      });

      if (!tag) {
        ctx.log.debug({ tagId: id }, 'Tag not found');
        return null;
      }

      return tag;
    },
  })
);

// Query: tagCount - Get count of tags matching filters
builder.queryField('tagCount', (t) =>
  t.field({
    type: 'Int',
    description: 'Get the count of tags matching the specified filters. Useful for pagination.',
    args: {
      search: t.arg.string({
        required: false,
        description: 'Search tags by name (contains match)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ search: args.search }, 'Counting tags');

      const where = args.search
        ? { name: { contains: args.search.toLowerCase(), mode: 'insensitive' as const } }
        : {};

      const count = await db.tag.count({ where });

      ctx.log.debug({ count }, 'Tag count fetched');
      return count;
    },
  })
);
