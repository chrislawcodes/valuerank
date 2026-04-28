import { db, type Prisma } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { DomainEvaluationRef } from './domain/evaluation/types.js';
import { evaluationInclude, toShape } from './domain/evaluation/helpers.js';

builder.queryField('activeEvaluations', (t) =>
  t.field({
    type: [DomainEvaluationRef],
    description: 'List DomainEvaluations that have at least one member run currently in RUNNING or SUMMARIZING status. Optional domainId filter scopes to one domain. Used by the cross-domain /status page.',
    args: {
      domainId: t.arg.id({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (ctx.user == null) {
        throw new AuthenticationError('Authentication required');
      }

      const where: Prisma.DomainEvaluationWhereInput = {
        deletedAt: null,
        members: {
          some: {
            run: {
              status: { in: ['RUNNING', 'SUMMARIZING'] },
              deletedAt: null,
            },
          },
        },
      };

      if (args.domainId != null) {
        where.domainId = String(args.domainId);
      }

      const evaluations = await db.domainEvaluation.findMany({
        where,
        include: evaluationInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      return evaluations.map(toShape);
    },
  }),
);
