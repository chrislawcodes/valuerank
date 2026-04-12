import type {
  RunsQueryVariables as GeneratedRunsQueryVariables,
  RunCountQueryVariables as GeneratedRunCountQueryVariables,
  AnalysisFolderCountsQueryVariables as GeneratedAnalysisFolderCountsQueryVariables,
  RunQueryVariables as GeneratedRunQueryVariables,
  StartRunMutationVariables as GeneratedStartRunMutationVariables,
  PauseRunMutationVariables as GeneratedPauseRunMutationVariables,
  ResumeRunMutationVariables as GeneratedResumeRunMutationVariables,
  CancelRunMutationVariables as GeneratedCancelRunMutationVariables,
  DeleteRunMutationVariables as GeneratedDeleteRunMutationVariables,
  UpdateRunMutationVariables as GeneratedUpdateRunMutationVariables,
  CancelSummarizationMutationVariables as GeneratedCancelSummarizationMutationVariables,
  RestartSummarizationMutationVariables as GeneratedRestartSummarizationMutationVariables,
  UpdateTranscriptDecisionMutationVariables as GeneratedUpdateTranscriptDecisionMutationVariables,
} from '../../generated/graphql';

// ============================================================================
// TYPES — JSON scalar fields require manual types; codegen types them as unknown
// ============================================================================

export type RunStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'SUMMARIZING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type RunCategory = 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION' | 'UNKNOWN_LEGACY';

export type RunProgress = {
  total: number;
  completed: number;
  failed: number;
  percentComplete: number;
  byModel?: Array<{ modelId: string; completed: number; failed: number }>;
};

export type TaskResult = {
  scenarioId: string;
  modelId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  error: string | null;
  completedAt: string | null;
};

export type CompletionEvent = {
  modelId: string;
  scenarioId: string;
  success: boolean;
  completedAt: string;
  durationMs: number;
};

export type ProviderExecutionMetrics = {
  provider: string;
  activeJobs: number;
  queuedJobs: number;
  maxParallel: number;
  requestsPerMinute: number;
  recentCompletions: CompletionEvent[];
  activeModelIds: string[];
};

export type ExecutionMetrics = {
  providers: ProviderExecutionMetrics[];
  totalActive: number;
  totalQueued: number;
  estimatedSecondsRemaining: number | null;
  totalRetries: number;
};

export type TranscriptDecisionModelV2RawEvidence = {
  matchedText: string | null;
  matchedLabel: string | null;
  parseClass: 'exact' | 'fallback_resolved' | 'ambiguous' | 'unparseable' | null;
  parsePath: string | null;
  parserVersion: string | null;
  responseExcerpt: string | null;
  manualOverride: {
    previousValue: string | null;
    overriddenAt: string | null;
    overriddenByUserId: string | null;
  } | null;
};

export type TranscriptDecisionModelV2Canonical = {
  favoredValueKey: string | null;
  opposedValueKey: string | null;
  direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown';
  strength: 'strong' | 'lean' | 'neutral' | 'unknown';
  normalizationApplied: boolean;
  normalizationReason: 'orientation_flipped' | null;
  source: 'deterministic' | 'manual' | 'error' | 'unknown';
};

export type TranscriptDecisionModelV2LegacyCompat = {
  rawScore: 1 | 2 | 3 | 4 | 5 | null;
  canonicalScore: 1 | 2 | 3 | 4 | 5 | null;
};

export type TranscriptDecisionModelV2 = {
  raw: TranscriptDecisionModelV2RawEvidence;
  canonical: TranscriptDecisionModelV2Canonical;
  legacy: TranscriptDecisionModelV2LegacyCompat;
};

export type Transcript = {
  id: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  content: unknown;
  /** @deprecated Use decisionModelV2 instead */
  decisionCode?: string | null;
  /** @deprecated Use decisionModelV2 instead */
  decisionCodeSource?: string | null;
  decisionMetadata?: unknown;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  estimatedCost: number | null;
  createdAt: string;
  lastAccessedAt: string | null;
  dimensionValues?: Record<string, string | number> | null;
  decisionModelV2?: TranscriptDecisionModelV2 | null;
};

export type RunConfig = {
  models: string[];
  samplePercentage?: number;
  sampleSeed?: number;
  temperature?: number | null;
  priority?: string;
  companionRunId?: string | null;
  jobChoiceLaunchMode?: 'PAIRED_BATCH' | 'AD_HOC_BATCH' | 'STANDARD' | null;
  jobChoiceBatchGroupId?: string | null;
  jobChoiceValueFirst?: string | null;
  isAggregate?: boolean;
  sourceRunIds?: string[];
  methodologySafe?: boolean | null;
};

export type RunDefinitionTag = {
  id: string;
  name: string;
};

export type AnalysisFolderTagCount = {
  tagId: string;
  name: string;
  count: number;
};

export type AnalysisFolderCounts = {
  aggregateCount: number;
  untaggedCount: number;
  aggregateUntaggedCount: number;
  tagCounts: AnalysisFolderTagCount[];
  aggregateTagCounts: AnalysisFolderTagCount[];
};

export type AnalysisFolderCountOverrides = {
  aggregateCount: number;
  untaggedCount: number;
  aggregateUntaggedCount: number;
  tagCounts: Record<string, number>;
  aggregateTagCounts: Record<string, number>;
};

export type ActualModelCost = {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  probeCount: number;
};

export type ActualCost = {
  total: number;
  perModel: ActualModelCost[];
};

export type Run = {
  id: string;
  name: string | null;
  definitionId: string;
  definitionVersion: number | null;
  experimentId: string | null;
  companionRunId: string | null;
  status: RunStatus;
  runCategory: RunCategory;
  config: RunConfig;
  stalledModels: string[];
  batchCount?: number;
  pairedBatchGroupId?: string | null;
  progress: { total: number; completed: number; failed: number } | null;
  runProgress: RunProgress | null;
  summarizeProgress: RunProgress | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  transcripts: Transcript[];
  transcriptCount: number;
  recentTasks: TaskResult[];
  failedProbes?: Array<{
    modelId: string;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
  analysisStatus: 'pending' | 'computing' | 'completed' | 'failed' | null;
  executionMetrics: ExecutionMetrics | null;
  analysis: {
    actualCost: ActualCost | null;
  } | null;
  definition: {
    id: string;
    name: string;
    version: number;
    tags: RunDefinitionTag[];
    content: unknown;
    domain?: {
      name: string;
    } | null;
  };
  tags: {
    id: string;
    name: string;
  }[];
};

// ============================================================================
// INPUT TYPES
// ============================================================================

export type StartRunInput = {
  definitionId: string;
  models: string[];
  samplePercentage?: number;
  samplesPerScenario?: number;
  temperature?: number;
  scenarioIds?: string[];
  sampleSeed?: number;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
  runCategory?: RunCategory;
  experimentId?: string;
  finalTrial?: boolean;
  launchMode?: 'STANDARD' | 'PAIRED_BATCH' | 'AD_HOC_BATCH';
};

export type UpdateRunInput = {
  name?: string | null;
};

// ============================================================================
// FRAGMENTS + DOCUMENTS — re-exported from generated
// ============================================================================

export {
  RunFieldsFragmentDoc as RUN_FRAGMENT,
  RunWithTranscriptsFieldsFragmentDoc as RUN_WITH_TRANSCRIPTS_FRAGMENT,
  RunsDocument as RUNS_QUERY,
  RunCountDocument as RUN_COUNT_QUERY,
  AnalysisFolderCountsDocument as ANALYSIS_FOLDER_COUNTS_QUERY,
  RunDocument as RUN_QUERY,
  StartRunDocument as START_RUN_MUTATION,
  PauseRunDocument as PAUSE_RUN_MUTATION,
  ResumeRunDocument as RESUME_RUN_MUTATION,
  CancelRunDocument as CANCEL_RUN_MUTATION,
  DeleteRunDocument as DELETE_RUN_MUTATION,
  UpdateRunDocument as UPDATE_RUN_MUTATION,
  CancelSummarizationDocument as CANCEL_SUMMARIZATION_MUTATION,
  RestartSummarizationDocument as RESTART_SUMMARIZATION_MUTATION,
  UpdateTranscriptDecisionDocument as UPDATE_TRANSCRIPT_DECISION_MUTATION,
} from '../../generated/graphql';

// ============================================================================
// QUERY VARIABLE TYPES
// ============================================================================

export type RunsQueryVariables = GeneratedRunsQueryVariables;
export type RunCountQueryVariables = GeneratedRunCountQueryVariables;
export type AnalysisFolderCountsQueryVariables = GeneratedAnalysisFolderCountsQueryVariables;
export type RunQueryVariables = GeneratedRunQueryVariables;

// ============================================================================
// QUERY RESULT TYPES
// Redefine result types to use our typed Run/Transcript instead of generated unknown fields.
// ============================================================================

export type RunsQueryResult = {
  runs: Run[];
};

export type RunCountQueryResult = {
  runCount: number;
};

export type AnalysisFolderCountsQueryResult = {
  analysisFolderCounts: AnalysisFolderCounts;
};

export type RunQueryResult = {
  run: Run | null;
};

// ============================================================================
// MUTATION VARIABLE TYPES
// ============================================================================

export type StartRunMutationVariables = GeneratedStartRunMutationVariables;
export type PauseRunMutationVariables = GeneratedPauseRunMutationVariables;
export type ResumeRunMutationVariables = GeneratedResumeRunMutationVariables;
export type CancelRunMutationVariables = GeneratedCancelRunMutationVariables;
export type DeleteRunMutationVariables = GeneratedDeleteRunMutationVariables;
export type UpdateRunMutationVariables = GeneratedUpdateRunMutationVariables;
export type CancelSummarizationMutationVariables = GeneratedCancelSummarizationMutationVariables;
export type RestartSummarizationMutationVariables = GeneratedRestartSummarizationMutationVariables;
export type UpdateTranscriptDecisionMutationVariables =
  GeneratedUpdateTranscriptDecisionMutationVariables;

// ============================================================================
// MUTATION RESULT TYPES
// Redefine result types to use our typed Run/Transcript instead of generated unknown fields.
// ============================================================================

export type StartRunMutationResult = {
  startRun: {
    run: Run;
    jobCount: number;
    pairedRunIds?: string[] | null;
  };
};

export type PauseRunMutationResult = {
  pauseRun: Run;
};

export type ResumeRunMutationResult = {
  resumeRun: Run;
};

export type CancelRunMutationResult = {
  cancelRun: Run;
};

export type DeleteRunMutationResult = {
  deleteRun: boolean;
};

export type UpdateRunMutationResult = {
  updateRun: Run;
};

export type CancelSummarizationMutationResult = {
  cancelSummarization: {
    run: Run;
    cancelledCount: number;
  };
};

export type RestartSummarizationMutationResult = {
  restartSummarization: {
    run: Run;
    queuedCount: number;
  };
};

export type UpdateTranscriptDecisionMutationResult = {
  updateTranscriptDecision: Transcript;
};
