import { builder } from '../builder.js';
import type { Run } from '@valuerank/db';

// Run GraphQL object type - stub for Phase 3, fully implemented in Phase 5
export const RunRef = builder.objectRef<Run>('Run');

builder.objectType(RunRef, {
  description: 'A run execution against a definition',
  fields: (t) => ({
    id: t.exposeID('id'),
    status: t.exposeString('status', {
      description: 'Current status of the run (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)',
    }),
    config: t.expose('config', { type: 'JSON' }),
    progress: t.expose('progress', { type: 'JSON', nullable: true }),
    startedAt: t.expose('startedAt', { type: 'DateTime', nullable: true }),
    completedAt: t.expose('completedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    // Full relations added in Phase 5
  }),
});
