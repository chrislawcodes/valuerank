/**
 * RunProgress and TaskResult GraphQL Types
 *
 * Structured types for run progress tracking.
 */

import { builder } from '../builder.js';

// TaskStatus enum
builder.enumType('TaskStatus', {
  values: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const,
  description: 'Status of an individual task/job',
});

// TaskResult - result of a completed/failed task
export const TaskResult = builder.objectRef<{
  scenarioId: string;
  modelId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  error?: string | null;
  completedAt?: Date | null;
}>('TaskResult').implement({
  description: 'Result of an individual scenario evaluation task',
  fields: (t) => ({
    scenarioId: t.exposeString('scenarioId'),
    modelId: t.exposeString('modelId'),
    status: t.exposeString('status', {
      description: 'Current status of the task',
    }),
    error: t.exposeString('error', {
      nullable: true,
      description: 'Error message if task failed',
    }),
    completedAt: t.expose('completedAt', {
      type: 'DateTime',
      nullable: true,
      description: 'When the task completed',
    }),
  }),
});

// ByModelProgress - per-model breakdown
export const ByModelProgress = builder.objectRef<{
  modelId: string;
  completed: number;
  failed: number;
}>('ByModelProgress').implement({
  description: 'Progress breakdown for a specific model',
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    completed: t.exposeInt('completed'),
    failed: t.exposeInt('failed'),
  }),
});

// RunProgress - structured progress information
export const RunProgress = builder.objectRef<{
  total: number;
  completed: number;
  failed: number;
  percentComplete: number;
  byModel?: Array<{ modelId: string; completed: number; failed: number }>;
}>('RunProgress').implement({
  description: 'Progress information for a run',
  fields: (t) => ({
    total: t.exposeInt('total', {
      description: 'Total number of tasks in the run',
    }),
    completed: t.exposeInt('completed', {
      description: 'Number of successfully completed tasks',
    }),
    failed: t.exposeInt('failed', {
      description: 'Number of failed tasks',
    }),
    percentComplete: t.exposeFloat('percentComplete', {
      description: 'Completion percentage (0-100)',
    }),
    byModel: t.field({
      type: [ByModelProgress],
      nullable: true,
      description: 'Progress breakdown by model',
      resolve: (parent) => parent.byModel ?? null,
    }),
  }),
});
