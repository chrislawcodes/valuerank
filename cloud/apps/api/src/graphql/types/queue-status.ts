/**
 * QueueStatus GraphQL Type
 *
 * Exposes queue statistics and health information.
 */

import { builder } from '../builder.js';

// JobTypeStatus - counts for a specific job type
export const JobTypeStatus = builder.objectRef<{
  type: string;
  pending: number;
  active: number;
  completed: number;
  failed: number;
}>('JobTypeStatus').implement({
  description: 'Job counts for a specific job type',
  fields: (t) => ({
    type: t.exposeString('type', {
      description: 'Job type name (e.g., probe:scenario)',
    }),
    pending: t.exposeInt('pending', {
      description: 'Number of jobs waiting to be processed',
    }),
    active: t.exposeInt('active', {
      description: 'Number of jobs currently being processed',
    }),
    completed: t.exposeInt('completed', {
      description: 'Number of completed jobs (from recent archive)',
    }),
    failed: t.exposeInt('failed', {
      description: 'Number of failed jobs',
    }),
  }),
});

// QueueStatus - overall queue health
export const QueueStatus = builder.objectRef<{
  isPaused: boolean;
  jobs: Array<{
    type: string;
    pending: number;
    active: number;
    completed: number;
    failed: number;
  }>;
  totalPending: number;
  totalActive: number;
}>('QueueStatus').implement({
  description: 'Overall queue status and statistics',
  fields: (t) => ({
    isPaused: t.exposeBoolean('isPaused', {
      description: 'Whether the queue is currently paused',
    }),
    jobs: t.field({
      type: [JobTypeStatus],
      description: 'Job counts by type',
      resolve: (parent) => parent.jobs,
    }),
    totalPending: t.exposeInt('totalPending', {
      description: 'Total pending jobs across all types',
    }),
    totalActive: t.exposeInt('totalActive', {
      description: 'Total active jobs across all types',
    }),
  }),
});
