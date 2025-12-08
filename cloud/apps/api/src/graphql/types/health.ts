/**
 * Health GraphQL Types
 *
 * Exposes system health information for providers, queue, and workers.
 */

import { builder } from '../builder.js';
import { JobTypeStatus } from './queue-status.js';

// ProviderHealthStatus - health status for a single LLM provider
export const ProviderHealthStatusType = builder.objectRef<{
  id: string;
  name: string;
  configured: boolean;
  connected: boolean;
  error: string | null;
  lastChecked: Date | null;
}>('ProviderHealthStatus').implement({
  description: 'Health status for an LLM provider',
  fields: (t) => ({
    id: t.exposeString('id', {
      description: 'Provider identifier (e.g., "openai")',
    }),
    name: t.exposeString('name', {
      description: 'Provider display name (e.g., "OpenAI")',
    }),
    configured: t.exposeBoolean('configured', {
      description: 'Whether the API key is configured',
    }),
    connected: t.exposeBoolean('connected', {
      description: 'Whether the API is reachable (health check passed)',
    }),
    error: t.exposeString('error', {
      nullable: true,
      description: 'Error message if health check failed',
    }),
    lastChecked: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'When this provider was last checked',
      resolve: (parent) => parent.lastChecked,
    }),
  }),
});

// ProviderHealth - overall provider health result
export const ProviderHealthType = builder.objectRef<{
  providers: Array<{
    id: string;
    name: string;
    configured: boolean;
    connected: boolean;
    error: string | null;
    lastChecked: Date | null;
  }>;
  checkedAt: Date;
}>('ProviderHealth').implement({
  description: 'Health status for all LLM providers',
  fields: (t) => ({
    providers: t.field({
      type: [ProviderHealthStatusType],
      description: 'Health status for each provider',
      resolve: (parent) => parent.providers.map((p) => ({
        ...p,
        error: p.error ?? null,
      })),
    }),
    checkedAt: t.field({
      type: 'DateTime',
      description: 'When the health check was performed',
      resolve: (parent) => parent.checkedAt,
    }),
  }),
});

// QueueHealthStatus - queue health information
export const QueueHealthType = builder.objectRef<{
  isHealthy: boolean;
  isRunning: boolean;
  isPaused: boolean;
  activeJobs: number;
  pendingJobs: number;
  completedLast24h: number;
  failedLast24h: number;
  successRate: number | null;
  error: string | null;
  checkedAt: Date;
  jobTypes?: Array<{
    type: string;
    pending: number;
    active: number;
    completed: number;
    failed: number;
  }>;
}>('QueueHealth').implement({
  description: 'Health status for the job queue',
  fields: (t) => ({
    isHealthy: t.exposeBoolean('isHealthy', {
      description: 'Whether the queue is healthy',
    }),
    isRunning: t.exposeBoolean('isRunning', {
      description: 'Whether queue workers are running',
    }),
    isPaused: t.exposeBoolean('isPaused', {
      description: 'Whether the queue is paused',
    }),
    activeJobs: t.exposeInt('activeJobs', {
      description: 'Number of currently processing jobs',
    }),
    pendingJobs: t.exposeInt('pendingJobs', {
      description: 'Number of jobs waiting to be processed',
    }),
    completedLast24h: t.exposeInt('completedLast24h', {
      description: 'Jobs completed in the last 24 hours',
    }),
    failedLast24h: t.exposeInt('failedLast24h', {
      description: 'Jobs failed in the last 24 hours',
    }),
    successRate: t.exposeFloat('successRate', {
      nullable: true,
      description: 'Success rate (completed / total processed), null if no jobs',
    }),
    error: t.exposeString('error', {
      nullable: true,
      description: 'Error message if queue health check failed',
    }),
    checkedAt: t.field({
      type: 'DateTime',
      description: 'When the health check was performed',
      resolve: (parent) => parent.checkedAt,
    }),
    jobTypes: t.field({
      type: [JobTypeStatus],
      nullable: true,
      description: 'Job counts by type',
      resolve: (parent) => parent.jobTypes ?? [],
    }),
  }),
});

// WorkerHealthStatus - Python worker health information
export const WorkerHealthType = builder.objectRef<{
  isHealthy: boolean;
  pythonVersion: string | null;
  packages: Record<string, string>;
  apiKeys: Record<string, boolean>;
  warnings: string[];
  error: string | null;
  checkedAt: Date;
}>('WorkerHealth').implement({
  description: 'Health status for Python workers',
  fields: (t) => ({
    isHealthy: t.exposeBoolean('isHealthy', {
      description: 'Whether the Python workers are healthy',
    }),
    pythonVersion: t.exposeString('pythonVersion', {
      nullable: true,
      description: 'Python version running the workers',
    }),
    packages: t.field({
      type: 'JSON',
      description: 'Installed Python packages with versions',
      resolve: (parent) => parent.packages,
    }),
    apiKeys: t.field({
      type: 'JSON',
      description: 'API key configuration status by provider',
      resolve: (parent) => parent.apiKeys,
    }),
    warnings: t.exposeStringList('warnings', {
      description: 'Health check warnings',
    }),
    error: t.exposeString('error', {
      nullable: true,
      description: 'Error message if health check failed',
    }),
    checkedAt: t.field({
      type: 'DateTime',
      description: 'When the health check was performed',
      resolve: (parent) => parent.checkedAt,
    }),
  }),
});

// SystemHealth - combined health status
export const SystemHealthType = builder.objectRef<{
  providers: {
    providers: Array<{
      id: string;
      name: string;
      configured: boolean;
      connected: boolean;
      error: string | null;
      lastChecked: Date | null;
    }>;
    checkedAt: Date;
  };
  queue: {
    isHealthy: boolean;
    isRunning: boolean;
    isPaused: boolean;
    activeJobs: number;
    pendingJobs: number;
    completedLast24h: number;
    failedLast24h: number;
    successRate: number | null;
    error: string | null;
    checkedAt: Date;
    jobTypes?: Array<{
      type: string;
      pending: number;
      active: number;
      completed: number;
      failed: number;
    }>;
  };
  worker: {
    isHealthy: boolean;
    pythonVersion: string | null;
    packages: Record<string, string>;
    apiKeys: Record<string, boolean>;
    warnings: string[];
    error: string | null;
    checkedAt: Date;
  };
}>('SystemHealth').implement({
  description: 'Combined system health status',
  fields: (t) => ({
    providers: t.field({
      type: ProviderHealthType,
      description: 'LLM provider health',
      resolve: (parent) => parent.providers,
    }),
    queue: t.field({
      type: QueueHealthType,
      description: 'Job queue health',
      resolve: (parent) => parent.queue,
    }),
    worker: t.field({
      type: WorkerHealthType,
      description: 'Python worker health',
      resolve: (parent) => parent.worker,
    }),
  }),
});
