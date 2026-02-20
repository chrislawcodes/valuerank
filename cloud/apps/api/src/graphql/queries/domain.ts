import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { DomainRef } from '../types/domain.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

builder.queryField('domains', (t) =>
  t.field({
    type: [DomainRef],
    args: {
      search: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
    },
    resolve: async (_root, args) => {
      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = args.offset ?? 0;
      const search = args.search?.trim();

      const hasSearch = search !== undefined && search !== null && search !== '';

      return db.domain.findMany({
        where: hasSearch ? { name: { contains: search, mode: 'insensitive' } } : undefined,
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      });
    },
  })
);

builder.queryField('domain', (t) =>
  t.field({
    type: DomainRef,
    nullable: true,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args) => {
      return db.domain.findUnique({ where: { id: String(args.id) } });
    },
  })
);
