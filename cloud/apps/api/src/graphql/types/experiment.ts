import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { ExperimentRef, RunRef } from './refs.js';

// Re-export for backward compatibility
export { ExperimentRef };

builder.objectType(ExperimentRef, {
  description: 'An experiment grouping multiple runs for comparison',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    hypothesis: t.exposeString('hypothesis', { nullable: true }),
    analysisPlan: t.expose('analysisPlan', { type: 'JSON', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),

    // Relation: runs (excludes soft-deleted)
    runs: t.field({
      type: [RunRef],
      resolve: async (experiment) => {
        return db.run.findMany({
          where: { experimentId: experiment.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),

    // Computed: run count (excludes soft-deleted)
    runCount: t.field({
      type: 'Int',
      resolve: async (experiment) => {
        return db.run.count({
          where: { experimentId: experiment.id, deletedAt: null },
        });
      },
    }),
  }),
});
