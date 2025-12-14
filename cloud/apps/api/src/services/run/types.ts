/**
 * Run Service Types
 *
 * Shared type definitions for run-related services.
 */

// ============================================================================
// JOB QUEUE TYPES (Feature #018)
// ============================================================================

/**
 * Job counts by state for a specific job type
 */
export type JobTypeCounts = {
  pending: number;
  running: number;
  completed: number;
  failed: number;
};

/**
 * Information about a failed job
 */
export type JobFailure = {
  jobId: string;
  jobType: string;
  error: string;
  failedAt: string;
  transcriptId?: string;
  scenarioId?: string;
  modelId?: string;
};

/**
 * Job queue status for a run
 */
export type JobQueueStatus = {
  runId: string;
  byJobType: {
    probe_scenario?: JobTypeCounts;
    summarize_transcript?: JobTypeCounts;
    analyze_basic?: JobTypeCounts;
  };
  totalPending: number;
  totalRunning: number;
  totalCompleted: number;
  totalFailed: number;
  recentFailures?: JobFailure[];
};

/**
 * Options for querying job queue status
 */
export type JobQueueStatusOptions = {
  includeRecentFailures?: boolean;
  failureLimit?: number;
};

// ============================================================================
// RE-EXPORTS FROM RECOVERY
// ============================================================================

export type { OrphanedRunInfo, RecoveryResult } from './recovery.js';
