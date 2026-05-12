/**
 * Queue System Types
 *
 * Defines job types, data interfaces, and options for PgBoss queue.
 */

// Job type union
export type JobType =
  | 'probe_scenario'
  | 'top_up_probes'
  | 'summarize_transcript'
  | 'analyze_basic'
  | 'expand_scenarios'
  | 'compute_token_stats'
  | 'probe_dead_letter'
  | 'run_state_reconcile'
  | 'run_state_audit'
  | 'analysis_result_janitor'
  | 'aggregate_analysis'
  | 'refresh_domain_analysis_snapshot'
  | 'refresh_pressure_sensitivity_snapshot';

// Job data interfaces
export type ProbeScenarioJobData = {
  runId: string;
  scenarioId: string;
  modelId: string;
  modelVersion?: string;
  sampleIndex: number; // Index within sample set (0 to N-1) for multi-sample runs
  enqueuedAt?: string;
  config: {
    temperature?: number;
    seed?: number;
    maxTurns: number;
  };
  // Only set by the reprobeAnomalySlot mutation. Bypasses the isRunTerminal guard
  // so manual re-probes can execute on completed runs.
  manualReprobe?: boolean;
  // Set by reprobeAnomalySlot so the probe→summarize pipeline can track stage.
  anomalyId?: string;
};

export type TopUpProbesJobData = {
  runId: string;
};

export type SummarizeTranscriptJobData = {
  runId: string;
  transcriptId: string;
  summaryModelId?: string; // Optional: defaults to configured summary model
  forceSummarize?: boolean; // Optional: bypasses cache and summarization short-circuits
  anomalyId?: string; // Set by reprobe pipeline to track stage progression
  enqueuedAt?: string;
};

export type AnalyzeBasicJobData = {
  runId: string;
  transcriptIds?: string[]; // Optional: will be fetched from DB if not provided
  force?: boolean; // Force recomputation even if cached
  anomalyId?: string; // Set by reprobe pipeline to track stage progression
};

export type ExpandScenariosJobData = {
  definitionId: string;
  triggeredBy: 'create' | 'update' | 'fork';
};

export type ComputeTokenStatsJobData = {
  runId: string;
};

export type RunStateReconcileJobData = {
  runId: string;
};

export type RunStateAuditJobData = Record<string, never>;

export type AnalysisResultJanitorJobData = Record<string, never>;

export type AggregateAnalysisJobData = {
  definitionId: string;
  preambleVersionId: string | null;
  // Optional for backward compatibility with already-queued legacy jobs.
  definitionVersion?: number | null;
  // Optional for backward compatibility with already-queued legacy jobs.
  temperature?: number | null;
};

export type RefreshDomainAnalysisSnapshotJobData = {
  scope: 'DOMAIN' | 'ALL_DOMAINS' | 'DOMAIN_SET';
  domainId: string;
  domainIds?: string[];
  signature: string | null;
  reason: string;
};

export type RefreshPressureSensitivitySnapshotJobData = {
  domainId: string | null;
  signature: string;
  reason: string;
};

// Dead letter job data - same as probe scenario but handled separately for failed/expired jobs
export type ProbeDeadLetterJobData = ProbeScenarioJobData;

// Job data union type (ProbeDeadLetterJobData is same as ProbeScenarioJobData, so not duplicated here)
export type JobData =
  | ProbeScenarioJobData
  | TopUpProbesJobData
  | SummarizeTranscriptJobData
  | AnalyzeBasicJobData
  | ExpandScenariosJobData
  | ComputeTokenStatsJobData
  | RunStateReconcileJobData
  | RunStateAuditJobData
  | AnalysisResultJanitorJobData
  | AggregateAnalysisJobData
  | RefreshDomainAnalysisSnapshotJobData
  | RefreshPressureSensitivitySnapshotJobData;

// Job options interface
export type JobOptions = {
  priority?: number;
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  expireInSeconds?: number;
  singletonKey?: string;
};

// Default job options per type
export const DEFAULT_JOB_OPTIONS: Record<JobType, JobOptions> = {
  'probe_scenario': {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    // 23 hours. The zombie watchdog (services/run/recovery.ts) is the active-execution
    // timeout; this TTL just bounds how long a probe can sit in queue before PgBoss
    // expires it. Domain-level launches can submit tens of thousands of probes at once,
    // so queue wait can legitimately exceed an hour. PgBoss enforces a strict <24h cap
    // (86400 fails with "expiration cannot exceed 24 hours"), so we sit a comfortable
    // hour under the ceiling.
    expireInSeconds: 82800,
  },
  'top_up_probes': {
    retryLimit: 0,
    expireInSeconds: 60,
  },
  'summarize_transcript': {
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 600, // 10 minutes - covers 5m Python spawn timeout + buffer
  },
  'analyze_basic': {
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 600, // 10 minutes
  },
  'expand_scenarios': {
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 900, // 15 minutes
    singletonKey: 'definition', // Only one expansion per definition at a time
  },
  'compute_token_stats': {
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 120, // 2 minutes - stats computation is quick
    singletonKey: 'run', // Only one stats computation per run at a time
  },
  'run_state_reconcile': {
    retryLimit: 0,
    expireInSeconds: 120,
  },
  'run_state_audit': {
    retryLimit: 0,
    expireInSeconds: 1800,
  },
  'analysis_result_janitor': {
    retryLimit: 0,
    expireInSeconds: 600,
  },
  'aggregate_analysis': {
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 300, // 5 minutes
    // singletonKey is set dynamically based on definitionId
  },
  'refresh_domain_analysis_snapshot': {
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 300, // 5 minutes
  },
  'refresh_pressure_sensitivity_snapshot': {
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 600, // 10 minutes — PS computation is heavier than domain analysis
  },
  'probe_dead_letter': {
    retryLimit: 0, // Don't retry dead letter jobs - just log and record
    // 30 minutes. DLQ jobs run a single DB upsert; keep this generous so a brief DB
    // stall during a large fanout doesn't drop failure records on the floor. Well
    // under the PgBoss <24h cap.
    expireInSeconds: 1800,
  },
};

// Run progress tracking
export type RunProgress = {
  total: number;
  completed: number;
  failed: number;
  byModel?: Record<string, { completed: number; failed: number }>;
};

// Priority values mapping
export const PRIORITY_VALUES = {
  LOW: 0,
  NORMAL: 5,
  HIGH: 10,
} as const;

export type PriorityLevel = keyof typeof PRIORITY_VALUES;

// Task result for GraphQL
export type TaskResult = {
  scenarioId: string;
  modelId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  error?: string;
  completedAt?: Date;
};

// Job handler interface
export type JobHandler<T extends JobData> = {
  name: JobType;
  handler: (data: T) => Promise<void>;
  options: JobOptions;
};
