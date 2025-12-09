/**
 * Execution Metrics GraphQL Types
 *
 * Real-time metrics for monitoring parallel execution during runs.
 * Shows per-provider concurrency, rate limits, and recent completions.
 */

import { builder } from '../builder.js';

// CompletionEvent - recent job completion
export const CompletionEvent = builder.objectRef<{
  modelId: string;
  scenarioId: string;
  success: boolean;
  completedAt: Date;
  durationMs: number;
}>('CompletionEvent').implement({
  description: 'A recent job completion event',
  fields: (t) => ({
    modelId: t.exposeString('modelId', {
      description: 'The model that was probed',
    }),
    scenarioId: t.exposeString('scenarioId', {
      description: 'The scenario that was evaluated',
    }),
    success: t.exposeBoolean('success', {
      description: 'Whether the probe succeeded',
    }),
    completedAt: t.expose('completedAt', {
      type: 'DateTime',
      description: 'When the probe completed',
    }),
    durationMs: t.exposeInt('durationMs', {
      description: 'How long the probe took in milliseconds',
    }),
  }),
});

// ProviderExecutionMetrics - per-provider metrics
export const ProviderExecutionMetrics = builder.objectRef<{
  provider: string;
  activeJobs: number;
  queuedJobs: number;
  maxParallel: number;
  requestsPerMinute: number;
  recentCompletions: Array<{
    modelId: string;
    scenarioId: string;
    success: boolean;
    completedAt: Date;
    durationMs: number;
  }>;
}>('ProviderExecutionMetrics').implement({
  description: 'Execution metrics for a specific LLM provider',
  fields: (t) => ({
    provider: t.exposeString('provider', {
      description: 'Provider name (e.g., "anthropic", "openai")',
    }),
    activeJobs: t.exposeInt('activeJobs', {
      description: 'Number of jobs currently being processed',
    }),
    queuedJobs: t.exposeInt('queuedJobs', {
      description: 'Number of jobs waiting in the rate limiter queue',
    }),
    maxParallel: t.exposeInt('maxParallel', {
      description: 'Maximum concurrent requests allowed for this provider',
    }),
    requestsPerMinute: t.exposeInt('requestsPerMinute', {
      description: 'Rate limit (requests per minute) for this provider',
    }),
    recentCompletions: t.field({
      type: [CompletionEvent],
      description: 'Recent job completions (last 10)',
      resolve: (parent) => parent.recentCompletions,
    }),
  }),
});

// ExecutionMetrics - aggregate metrics across all providers
export const ExecutionMetrics = builder.objectRef<{
  providers: Array<{
    provider: string;
    activeJobs: number;
    queuedJobs: number;
    maxParallel: number;
    requestsPerMinute: number;
    recentCompletions: Array<{
      modelId: string;
      scenarioId: string;
      success: boolean;
      completedAt: Date;
      durationMs: number;
    }>;
  }>;
  totalActive: number;
  totalQueued: number;
  estimatedSecondsRemaining: number | null;
}>('ExecutionMetrics').implement({
  description: 'Real-time execution metrics for monitoring parallel processing',
  fields: (t) => ({
    providers: t.field({
      type: [ProviderExecutionMetrics],
      description: 'Metrics for each LLM provider',
      resolve: (parent) => parent.providers,
    }),
    totalActive: t.exposeInt('totalActive', {
      description: 'Total jobs actively being processed across all providers',
    }),
    totalQueued: t.exposeInt('totalQueued', {
      description: 'Total jobs queued across all providers',
    }),
    estimatedSecondsRemaining: t.exposeInt('estimatedSecondsRemaining', {
      nullable: true,
      description: 'Estimated seconds until all pending jobs complete',
    }),
  }),
});
