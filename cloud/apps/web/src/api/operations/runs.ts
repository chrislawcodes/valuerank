import type {
  RunFieldsFragment,
  RunWithTranscriptsFieldsFragment,
  RunsQuery,
  RunCountQuery,
  AnalysisFolderCountsQuery,
  RunQuery,
  StartRunMutation as GeneratedStartRunMutation,
  PauseRunMutation as GeneratedPauseRunMutation,
  ResumeRunMutation as GeneratedResumeRunMutation,
  CancelRunMutation as GeneratedCancelRunMutation,
  DeleteRunMutation as GeneratedDeleteRunMutation,
  UpdateRunMutation as GeneratedUpdateRunMutation,
  CancelSummarizationMutation as GeneratedCancelSummarizationMutation,
  RestartSummarizationMutation as GeneratedRestartSummarizationMutation,
  UpdateTranscriptDecisionMutation as GeneratedUpdateTranscriptDecisionMutation,
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
  StartRunInput as GeneratedStartRunInput,
  UpdateRunInput as GeneratedUpdateRunInput,
} from '../../generated/graphql';

import type { RunConfig, TranscriptDecisionModelV2 } from '../run-json-types';

// Re-export JSON scalar types so existing call sites keep working.
export type {
  RunConfig,
  TranscriptDecisionModelV2,
  TranscriptDecisionModelV2Canonical,
  TranscriptDecisionModelV2RawEvidence,
  AnalysisFolderCountOverrides,
} from '../run-json-types';

// ============================================================================
// DOCUMENTS
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
// ENUM-LIKE UNION TYPES
// Narrow the string fields from the generated fragment to their known values.
// ============================================================================

export type RunStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'SUMMARIZING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type RunCategory = 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION' | 'UNKNOWN_LEGACY';

// ============================================================================
// TYPES DERIVED FROM CODEGEN FRAGMENTS
// ============================================================================

export type RunProgress = NonNullable<RunFieldsFragment['runProgress']>;
export type RunDefinitionTag = RunFieldsFragment['tags'][number];

type BaseExecutionMetrics = NonNullable<RunWithTranscriptsFieldsFragment['executionMetrics']>;
export type ExecutionMetrics = BaseExecutionMetrics;
export type ProviderExecutionMetrics = BaseExecutionMetrics['providers'][number];
export type CompletionEvent = ProviderExecutionMetrics['recentCompletions'][number];
export type TaskResult = RunWithTranscriptsFieldsFragment['recentTasks'][number];

type BaseAnalysis = NonNullable<RunWithTranscriptsFieldsFragment['analysis']>;
export type ActualCost = NonNullable<BaseAnalysis['actualCost']>;
export type ActualModelCost = ActualCost['perModel'][number];

export type AnalysisFolderCounts = AnalysisFolderCountsQuery['analysisFolderCounts'];
export type AnalysisFolderTagCount = AnalysisFolderCounts['tagCounts'][number];

// ============================================================================
// RUN — narrows JSON scalar fields and optional-but-always-present fields
// from RunWithTranscriptsFieldsFragment.
//
// The codegen marks many fields optional (?:) because GraphQL fields can be
// absent in partial selections. We re-declare the ones that are always present
// in our queries as required-nullable (T | null) to preserve the old contract.
// ============================================================================

export type Run = Omit<
  RunWithTranscriptsFieldsFragment,
  | 'config' | 'status' | 'runCategory' | 'analysisStatus' | 'progress'
  | 'transcripts' | 'definition'
  | 'name' | 'startedAt' | 'completedAt'
  | 'runProgress' | 'summarizeProgress'
> & {
  config: RunConfig;
  status: RunStatus;
  runCategory: RunCategory;
  analysisStatus: 'pending' | 'computing' | 'completed' | 'failed' | null;
  progress: { total: number; completed: number; failed: number } | null;
  transcripts: Transcript[];
  definition: {
    id: string;
    name: string;
    version: number;
    content: unknown;
    tags: RunDefinitionTag[];
    domain?: { name: string } | null;
  };
  name: string | null;
  startedAt: string | null;
  completedAt: string | null;
  runProgress: RunProgress | null;
  summarizeProgress: RunProgress | null;
};

// ============================================================================
// TRANSCRIPT — narrows JSON scalar fields and optional-but-always-present
// fields from the fragment.
// ============================================================================

type BaseTranscript = RunWithTranscriptsFieldsFragment['transcripts'][number];

export type Transcript = Omit<
  BaseTranscript,
  'decisionModelV2' | 'dimensionValues' | 'decisionMetadata' | 'scenarioId'
> & {
  scenarioId: string | null;
  /** @deprecated Use decisionModelV2 instead */
  decisionCode?: string | null;
  /** @deprecated Use decisionModelV2 instead */
  decisionCodeSource?: string | null;
  decisionMetadata?: unknown;
  dimensionValues?: Record<string, string | number> | null;
  decisionModelV2?: TranscriptDecisionModelV2 | null;
};

// ============================================================================
// INPUT TYPES
// ============================================================================

export type StartRunInput = GeneratedStartRunInput;
export type UpdateRunInput = GeneratedUpdateRunInput;

// ============================================================================
// QUERY RESULT + VARIABLE TYPES
// ============================================================================

export type RunsQueryResult = Omit<RunsQuery, 'runs'> & { runs: Run[] };
export type RunsQueryVariables = GeneratedRunsQueryVariables;

export type RunCountQueryResult = RunCountQuery;
export type RunCountQueryVariables = GeneratedRunCountQueryVariables;

export type AnalysisFolderCountsQueryResult = AnalysisFolderCountsQuery;
export type AnalysisFolderCountsQueryVariables = GeneratedAnalysisFolderCountsQueryVariables;

export type RunQueryResult = Omit<RunQuery, 'run'> & { run: Run | null };
export type RunQueryVariables = GeneratedRunQueryVariables;

// ============================================================================
// MUTATION RESULT + VARIABLE TYPES
// ============================================================================

export type StartRunMutationResult = Omit<GeneratedStartRunMutation, 'startRun'> & {
  startRun: { run: Run; jobCount: number; pairedRunIds?: string[] | null };
};
export type StartRunMutationVariables = GeneratedStartRunMutationVariables;

export type PauseRunMutationResult = Omit<GeneratedPauseRunMutation, 'pauseRun'> & { pauseRun: Run };
export type PauseRunMutationVariables = GeneratedPauseRunMutationVariables;

export type ResumeRunMutationResult = Omit<GeneratedResumeRunMutation, 'resumeRun'> & { resumeRun: Run };
export type ResumeRunMutationVariables = GeneratedResumeRunMutationVariables;

export type CancelRunMutationResult = Omit<GeneratedCancelRunMutation, 'cancelRun'> & { cancelRun: Run };
export type CancelRunMutationVariables = GeneratedCancelRunMutationVariables;

export type DeleteRunMutationResult = GeneratedDeleteRunMutation;
export type DeleteRunMutationVariables = GeneratedDeleteRunMutationVariables;

export type UpdateRunMutationResult = Omit<GeneratedUpdateRunMutation, 'updateRun'> & { updateRun: Run };
export type UpdateRunMutationVariables = GeneratedUpdateRunMutationVariables;

export type CancelSummarizationMutationResult = Omit<GeneratedCancelSummarizationMutation, 'cancelSummarization'> & {
  cancelSummarization: { run: Run; cancelledCount: number };
};
export type CancelSummarizationMutationVariables = GeneratedCancelSummarizationMutationVariables;

export type RestartSummarizationMutationResult = Omit<GeneratedRestartSummarizationMutation, 'restartSummarization'> & {
  restartSummarization: { run: Run; queuedCount: number };
};
export type RestartSummarizationMutationVariables = GeneratedRestartSummarizationMutationVariables;

export type UpdateTranscriptDecisionMutationResult = Omit<
  GeneratedUpdateTranscriptDecisionMutation,
  'updateTranscriptDecision'
> & { updateTranscriptDecision: Transcript };
export type UpdateTranscriptDecisionMutationVariables = GeneratedUpdateTranscriptDecisionMutationVariables;
