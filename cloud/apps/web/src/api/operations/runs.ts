import { gql } from 'urql';

// ============================================================================
// TYPES
// ============================================================================

export type RunStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'SUMMARIZING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type RunProgress = {
  total: number;
  completed: number;
  failed: number;
  percentComplete: number;
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
};

export type Transcript = {
  id: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  content: unknown;
  decisionCode: string | null;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  estimatedCost: number | null;
  createdAt: string;
  lastAccessedAt: string | null;
};

export type RunConfig = {
  models: string[];
  samplePercentage?: number;
  sampleSeed?: number;
  priority?: string;
};

export type RunDefinitionTag = {
  id: string;
  name: string;
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
  definitionVersion: number | null; // Added
  experimentId: string | null;
  status: RunStatus;
  config: RunConfig;
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
  };
  tags: {
    id: string;
    name: string;
  }[];
};

// ============================================================================
// FRAGMENTS
// ============================================================================

export const RUN_FRAGMENT = gql`
  fragment RunFields on Run {
    id
    name
    definitionId
    definitionVersion
    experimentId
    status
    config
    progress
    runProgress {
      total
      completed
      failed
      percentComplete
    }
    summarizeProgress {
      total
      completed
      failed
      percentComplete
    }
    startedAt
    completedAt
    createdAt
    updatedAt
    lastAccessedAt
    transcriptCount
    analysisStatus
    tags {
      id
      name
    }
    definition {
      id
      name
      version
      tags: allTags {
        id
        name
      }
      content
    }
    definitionSnapshot
  }
`;

export const RUN_WITH_TRANSCRIPTS_FRAGMENT = gql`
  fragment RunWithTranscriptsFields on Run {
    ...RunFields
    transcripts {
      id
      runId
      scenarioId
      modelId
      modelVersion
      content
      decisionCode
      turnCount
      tokenCount
      durationMs
      estimatedCost
      createdAt
      lastAccessedAt
    }
    analysis {
      actualCost {
        total
        perModel {
          modelId
          inputTokens
          outputTokens
          cost
          probeCount
        }
      }
    }
    recentTasks(limit: 10) {
      scenarioId
      modelId
      status
      error
      completedAt
    }
    executionMetrics {
      providers {
        provider
        activeJobs
        queuedJobs
        maxParallel
        requestsPerMinute
        activeModelIds
        recentCompletions {
          modelId
          scenarioId
          success
          completedAt
          durationMs
        }
      }
      totalActive
      totalQueued
      estimatedSecondsRemaining
    }
  }
  ${RUN_FRAGMENT}
`;

// ============================================================================
// QUERIES
// ============================================================================

export const RUNS_QUERY = gql`
  query Runs(
    $definitionId: String
    $experimentId: String
    $status: String
    $hasAnalysis: Boolean
    $analysisStatus: String
    $limit: Int
    $offset: Int
  ) {
    runs(
      definitionId: $definitionId
      experimentId: $experimentId
      status: $status
      hasAnalysis: $hasAnalysis
      analysisStatus: $analysisStatus
      limit: $limit
      offset: $offset
    ) {
      ...RunFields
    }
  }
  ${RUN_FRAGMENT}
`;

export const RUN_COUNT_QUERY = gql`
  query RunCount(
    $definitionId: String
    $experimentId: String
    $status: String
    $hasAnalysis: Boolean
    $analysisStatus: String
  ) {
    runCount(
      definitionId: $definitionId
      experimentId: $experimentId
      status: $status
      hasAnalysis: $hasAnalysis
      analysisStatus: $analysisStatus
    )
  }
`;

export const RUN_QUERY = gql`
  query Run($id: ID!) {
    run(id: $id) {
      ...RunWithTranscriptsFields
    }
  }
  ${RUN_WITH_TRANSCRIPTS_FRAGMENT}
`;

// ============================================================================
// MUTATIONS
// ============================================================================

export const START_RUN_MUTATION = gql`
  mutation StartRun($input: StartRunInput!) {
    startRun(input: $input) {
      run {
        ...RunFields
      }
      jobCount
    }
  }
  ${RUN_FRAGMENT}
`;

export const PAUSE_RUN_MUTATION = gql`
  mutation PauseRun($runId: ID!) {
    pauseRun(runId: $runId) {
      ...RunFields
    }
  }
  ${RUN_FRAGMENT}
`;

export const RESUME_RUN_MUTATION = gql`
  mutation ResumeRun($runId: ID!) {
    resumeRun(runId: $runId) {
      ...RunFields
    }
  }
  ${RUN_FRAGMENT}
`;

export const CANCEL_RUN_MUTATION = gql`
  mutation CancelRun($runId: ID!) {
    cancelRun(runId: $runId) {
      ...RunFields
    }
  }
  ${RUN_FRAGMENT}
`;

export const DELETE_RUN_MUTATION = gql`
  mutation DeleteRun($runId: ID!) {
    deleteRun(runId: $runId)
  }
`;

export const UPDATE_RUN_MUTATION = gql`
  mutation UpdateRun($runId: ID!, $input: UpdateRunInput!) {
    updateRun(runId: $runId, input: $input) {
      ...RunFields
    }
  }
  ${RUN_FRAGMENT}
`;

export const CANCEL_SUMMARIZATION_MUTATION = gql`
  mutation CancelSummarization($runId: ID!) {
    cancelSummarization(runId: $runId) {
      run {
        ...RunFields
      }
      cancelledCount
    }
  }
  ${RUN_FRAGMENT}
`;

export const RESTART_SUMMARIZATION_MUTATION = gql`
  mutation RestartSummarization($runId: ID!, $force: Boolean) {
    restartSummarization(runId: $runId, force: $force) {
      run {
        ...RunFields
      }
      queuedCount
    }
  }
  ${RUN_FRAGMENT}
`;

export const UPDATE_TRANSCRIPT_DECISION_MUTATION = gql`
  mutation UpdateTranscriptDecision($transcriptId: ID!, $decisionCode: String!) {
    updateTranscriptDecision(transcriptId: $transcriptId, decisionCode: $decisionCode) {
      id
      runId
      scenarioId
      modelId
      modelVersion
      content
      decisionCode
      turnCount
      tokenCount
      durationMs
      estimatedCost
      createdAt
      lastAccessedAt
    }
  }
`;

// ============================================================================
// INPUT TYPES
// ============================================================================

export type StartRunInput = {
  definitionId: string;
  models: string[];
  samplePercentage?: number;
  samplesPerScenario?: number;
  scenarioIds?: string[];
  sampleSeed?: number;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
  experimentId?: string;
  finalTrial?: boolean;
};

// ============================================================================
// RESULT TYPES
// ============================================================================

export type RunsQueryVariables = {
  definitionId?: string;
  experimentId?: string;
  status?: string;
  hasAnalysis?: boolean;
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
  limit?: number;
  offset?: number;
};

export type RunsQueryResult = {
  runs: Run[];
};

export type RunCountQueryVariables = {
  definitionId?: string;
  experimentId?: string;
  status?: string;
  hasAnalysis?: boolean;
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
};

export type RunCountQueryResult = {
  runCount: number;
};

export type RunQueryVariables = {
  id: string;
};

export type RunQueryResult = {
  run: Run | null;
};

export type StartRunMutationVariables = {
  input: StartRunInput;
};

export type StartRunMutationResult = {
  startRun: {
    run: Run;
    jobCount: number;
  };
};

export type PauseRunMutationVariables = {
  runId: string;
};

export type PauseRunMutationResult = {
  pauseRun: Run;
};

export type ResumeRunMutationVariables = {
  runId: string;
};

export type ResumeRunMutationResult = {
  resumeRun: Run;
};

export type CancelRunMutationVariables = {
  runId: string;
};

export type CancelRunMutationResult = {
  cancelRun: Run;
};

export type DeleteRunMutationVariables = {
  runId: string;
};

export type DeleteRunMutationResult = {
  deleteRun: boolean;
};

export type UpdateRunInput = {
  name?: string | null;
};

export type UpdateRunMutationVariables = {
  runId: string;
  input: UpdateRunInput;
};

export type UpdateRunMutationResult = {
  updateRun: Run;
};

export type CancelSummarizationMutationVariables = {
  runId: string;
};

export type CancelSummarizationMutationResult = {
  cancelSummarization: {
    run: Run;
    cancelledCount: number;
  };
};

export type RestartSummarizationMutationVariables = {
  runId: string;
  force?: boolean;
};

export type RestartSummarizationMutationResult = {
  restartSummarization: {
    run: Run;
    queuedCount: number;
  };
};

export type UpdateTranscriptDecisionMutationVariables = {
  transcriptId: string;
  decisionCode: string;
};

export type UpdateTranscriptDecisionMutationResult = {
  updateTranscriptDecision: Transcript;
};
