import { builder } from '../../builder.js';
import { db } from '@valuerank/db';
import { DomainConfigSnapshotRef } from '../../types/domain.js';

builder.queryFields((t) => ({
  domainConfigSnapshots: t.field({
    type: [DomainConfigSnapshotRef],
    args: {
      domainId: t.arg.id({ required: true }),
      limit: t.arg.int({ required: false, defaultValue: 20 }),
      offset: t.arg.int({ required: false, defaultValue: 0 }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = String(args.domainId);
      ctx.log.debug({ domainId }, 'Fetching domain config snapshots');
      return db.domainConfigSnapshot.findMany({
        where: { domainId },
        orderBy: { createdAt: 'desc' },
        take: args.limit ?? 20,
        skip: args.offset ?? 0,
      });
    },
  }),
}));
