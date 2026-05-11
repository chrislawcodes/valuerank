// ============================================================================
// TYPES (manual — JSON scalar fields need typed shapes)
// ============================================================================

export type ProviderHealthStatus = {
  id: string;
  name: string;
  configured: boolean;
  connected: boolean;
  error: string | null;
  remainingBudgetUsd: number | null;
  lastChecked: string | null;
};

export type ProviderHealth = {
  providers: ProviderHealthStatus[];
  checkedAt: string;
};

export type JobTypeStatus = {
  type: string;
  pending: number;
  active: number;
  completed: number;
  failed: number;
};

export type QueueHealth = {
  isHealthy: boolean;
  isRunning: boolean;
  isPaused: boolean;
  activeJobs: number;
  pendingJobs: number;
  completedLast24h: number;
  completedLast30m: number;
  failedLast24h: number;
  successRate: number | null;
  jobTypes: JobTypeStatus[];
  error: string | null;
  checkedAt: string;
};

export type WorkerHealth = {
  isHealthy: boolean;
  pythonVersion: string | null;
  packages: Record<string, string>;
  apiKeys: Record<string, boolean>;
  warnings: string[];
  error: string | null;
  checkedAt: string;
};

export type SystemHealth = {
  providers: ProviderHealth;
  queue: QueueHealth;
  worker: WorkerHealth;
};

// ============================================================================
// QUERIES
// ============================================================================

export { SystemHealthDocument as SYSTEM_HEALTH_QUERY } from '../../generated/graphql';

// ============================================================================
// RESULT TYPES (manual — preserves app-level types without __typename)
// ============================================================================

export type SystemHealthQueryResult = {
  systemHealth: SystemHealth;
};

export type SystemHealthQueryVariables = {
  refresh?: boolean;
};
