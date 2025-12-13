/**
 * Queue System Types
 *
 * Defines job types, data interfaces, and options for PgBoss queue.
 */

// Job type union
export type JobType = 'probe_scenario' | 'summarize_transcript' | 'analyze_basic' | 'analyze_deep' | 'expand_scenarios' | 'compute_token_stats';

// Job data interfaces
export type ProbeScenarioJobData = {
  runId: string;
  scenarioId: string;
  modelId: string;
  modelVersion?: string;
  config: {
    temperature: number;
    maxTurns: number;
  };
};

export type SummarizeTranscriptJobData = {
  runId: string;
  transcriptId: string;
  summaryModelId?: string; // Optional: defaults to configured summary model
};

export type AnalyzeBasicJobData = {
  runId: string;
  transcriptIds?: string[]; // Optional: will be fetched from DB if not provided
  force?: boolean; // Force recomputation even if cached
};

export type AnalyzeDeepJobData = {
  runId: string;
  analysisType: 'correlations' | 'pca' | 'outliers';
};

export type ExpandScenariosJobData = {
  definitionId: string;
  triggeredBy: 'create' | 'update' | 'fork';
};

export type ComputeTokenStatsJobData = {
  runId: string;
};

// Job data union type
export type JobData = ProbeScenarioJobData | SummarizeTranscriptJobData | AnalyzeBasicJobData | AnalyzeDeepJobData | ExpandScenariosJobData | ComputeTokenStatsJobData;

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
    expireInSeconds: 300, // 5 minutes
  },
  'summarize_transcript': {
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 120, // 2 minutes (summaries are quick)
  },
  'analyze_basic': {
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 600, // 10 minutes
  },
  'analyze_deep': {
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 1800, // 30 minutes
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
