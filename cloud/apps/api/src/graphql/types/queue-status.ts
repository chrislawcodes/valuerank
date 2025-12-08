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
      description: 'Job type name (e.g., probe_scenario)',
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

// QueueTotals - aggregate counts across all job types
export const QueueTotals = builder.objectRef<{
  pending: number;
  active: number;
  completed: number;
  failed: number;
}>('QueueTotals').implement({
  description: 'Aggregate job counts across all types',
  fields: (t) => ({
    pending: t.exposeInt('pending', {
      description: 'Total pending jobs across all types',
    }),
    active: t.exposeInt('active', {
      description: 'Total active jobs across all types',
    }),
    completed: t.exposeInt('completed', {
      description: 'Total completed jobs (last 24h)',
    }),
    failed: t.exposeInt('failed', {
      description: 'Total failed jobs',
    }),
  }),
});

// QueueStatus - overall queue health
export const QueueStatus = builder.objectRef<{
  isRunning: boolean;
  isPaused: boolean;
  jobTypes: Array<{
    type: string;
    pending: number;
    active: number;
    completed: number;
    failed: number;
  }>;
  totals: {
    pending: number;
    active: number;
    completed: number;
    failed: number;
  };
}>('QueueStatus').implement({
  description: 'Overall queue status and statistics',
  fields: (t) => ({
    isRunning: t.exposeBoolean('isRunning', {
      description: 'Whether the queue workers are running',
    }),
    isPaused: t.exposeBoolean('isPaused', {
      description: 'Whether the queue is currently paused',
    }),
    jobTypes: t.field({
      type: [JobTypeStatus],
      description: 'Job counts by type',
      resolve: (parent) => parent.jobTypes,
    }),
    totals: t.field({
      type: QueueTotals,
      description: 'Aggregate counts across all job types',
      resolve: (parent) => parent.totals,
    }),
  }),
});
