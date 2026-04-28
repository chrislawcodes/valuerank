import { db, type Prisma } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { RunAnomalyRef } from '../types/refs.js';
import { RunAnomalyTypeEnum } from '../types/run-anomaly.js';

builder.queryField('openRunAnomalies', (t) =>
  t.field({
    type: [RunAnomalyRef],
    description: 'List anomalies that are currently open (resolvedAt IS NULL) across all runs. Optional filters: domainId scopes to anomalies whose run belongs to a definition in that domain; type scopes to a single RunAnomalyType.',
    args: {
      domainId: t.arg.id({ required: false }),
      type: t.arg({ type: RunAnomalyTypeEnum, required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (ctx.user == null) {
        throw new AuthenticationError('Authentication required');
      }

      const where: Prisma.RunAnomalyWhereInput = {
        resolvedAt: null,
      };

      if (args.type != null) {
        where.type = args.type;
      }

      if (args.domainId != null) {
        where.run = {
          definition: {
            domainId: String(args.domainId),
          },
        };
      }

      const anomalies = await db.runAnomaly.findMany({
        where,
        orderBy: { firstSeenAt: 'desc' },
      });

      return anomalies;
    },
  }),
);
