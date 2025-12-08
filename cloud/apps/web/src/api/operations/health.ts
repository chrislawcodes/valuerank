import { gql } from 'urql';

// ============================================================================
// TYPES
// ============================================================================

export type ProviderHealthStatus = {
  id: string;
  name: string;
  configured: boolean;
  connected: boolean;
  error: string | null;
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

export const PROVIDER_HEALTH_QUERY = gql`
  query ProviderHealth($refresh: Boolean) {
    providerHealth(refresh: $refresh) {
      providers {
        id
        name
        configured
        connected
        error
        lastChecked
      }
      checkedAt
    }
  }
`;

export const QUEUE_HEALTH_QUERY = gql`
  query QueueHealth {
    queueHealth {
      isHealthy
      isRunning
      isPaused
      activeJobs
      pendingJobs
      completedLast24h
      failedLast24h
      successRate
      jobTypes {
        type
        pending
        active
        completed
        failed
      }
      error
      checkedAt
    }
  }
`;

export const WORKER_HEALTH_QUERY = gql`
  query WorkerHealth($refresh: Boolean) {
    workerHealth(refresh: $refresh) {
      isHealthy
      pythonVersion
      packages
      apiKeys
      warnings
      error
      checkedAt
    }
  }
`;

export const SYSTEM_HEALTH_QUERY = gql`
  query SystemHealth($refresh: Boolean) {
    systemHealth(refresh: $refresh) {
      providers {
        providers {
          id
          name
          configured
          connected
          error
          lastChecked
        }
        checkedAt
      }
      queue {
        isHealthy
        isRunning
        isPaused
        activeJobs
        pendingJobs
        completedLast24h
        failedLast24h
        successRate
        jobTypes {
          type
          pending
          active
          completed
          failed
        }
        error
        checkedAt
      }
      worker {
        isHealthy
        pythonVersion
        packages
        apiKeys
        warnings
        error
        checkedAt
      }
    }
  }
`;

// ============================================================================
// RESULT TYPES
// ============================================================================

export type ProviderHealthQueryResult = {
  providerHealth: ProviderHealth;
};

export type ProviderHealthQueryVariables = {
  refresh?: boolean;
};

export type QueueHealthQueryResult = {
  queueHealth: QueueHealth;
};

export type WorkerHealthQueryResult = {
  workerHealth: WorkerHealth;
};

export type WorkerHealthQueryVariables = {
  refresh?: boolean;
};

export type SystemHealthQueryResult = {
  systemHealth: SystemHealth;
};

export type SystemHealthQueryVariables = {
  refresh?: boolean;
};
