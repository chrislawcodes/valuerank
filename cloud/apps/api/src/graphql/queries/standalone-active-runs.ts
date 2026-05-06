import { db } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { RunRef } from '../types/run.js';
import { ACTIVE_RUN_STATUSES } from './domain/evaluation/types.js';

const STANDALONE_ACTIVE_RUN_STATUSES = [...ACTIVE_RUN_STATUSES];

builder.queryField('standaloneActiveRuns', (t) =>
  t.field({
    type: [RunRef],
    description:
      'List runs in PENDING, RUNNING, PAUSED, or SUMMARIZING status that are not members of any DomainEvaluation. Used by the /status page to surface ad-hoc runs.',
    resolve: async (_root, _args, ctx) => {
      if (ctx.user == null) {
        throw new AuthenticationError('Authentication required');
      }

      return db.run.findMany({
        where: {
          status: { in: STANDALONE_ACTIVE_RUN_STATUSES },
          deletedAt: null,
          domainEvaluationMembership: null,
        },
        orderBy: { createdAt: 'desc' },
      });
    },
  }),
);
