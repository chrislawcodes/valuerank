import '../types/domain-context.js';
import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { DomainContextRef } from '../types/refs.js';

builder.queryFields((t) => ({
  domainContexts: t.field({
    type: [DomainContextRef],
    args: {
      domainId: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ domainId: args.domainId }, 'Listing domain contexts');
      return db.domainContext.findMany({
        where: args.domainId != null ? { domainId: args.domainId } : undefined,
        orderBy: { updatedAt: 'desc' },
      });
    },
  }),
  domainContext: t.field({
    type: DomainContextRef,
    nullable: true,
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ id: String(args.id) }, 'Fetching domain context');
      return db.domainContext.findUnique({ where: { id: String(args.id) } });
    },
  }),
}));
