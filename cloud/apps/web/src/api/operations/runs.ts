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
  definitionId: string;
  experimentId: string | null;
  status: RunStatus;
  config: RunConfig;
  progress: { total: number; completed: number; failed: number } | null;
  runProgress: RunProgress | null;
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
    tags: RunDefinitionTag[];
  };
};

// ============================================================================
// FRAGMENTS
// ============================================================================

export const RUN_FRAGMENT = gql`
  fragment RunFields on Run {
    id
    definitionId
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
    startedAt
    completedAt
    createdAt
    updatedAt
    lastAccessedAt
    transcriptCount
    analysisStatus
    definition {
      id
      name
      tags {
        id
        name
      }
    }
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
    $status: String
    $hasAnalysis: Boolean
    $analysisStatus: String
    $limit: Int
    $offset: Int
  ) {
    runs(
      definitionId: $definitionId
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

// ============================================================================
// INPUT TYPES
// ============================================================================

export type StartRunInput = {
  definitionId: string;
  models: string[];
  samplePercentage?: number;
  sampleSeed?: number;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
  experimentId?: string;
};

// ============================================================================
// RESULT TYPES
// ============================================================================

export type RunsQueryVariables = {
  definitionId?: string;
  status?: string;
  hasAnalysis?: boolean;
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
  limit?: number;
  offset?: number;
};

export type RunsQueryResult = {
  runs: Run[];
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
