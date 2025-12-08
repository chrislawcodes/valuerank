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
  createdAt: string;
  lastAccessedAt: string | null;
};

export type RunConfig = {
  models: string[];
  samplePercentage?: number;
  sampleSeed?: number;
  priority?: string;
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
  definition: {
    id: string;
    name: string;
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
    definition {
      id
      name
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
      createdAt
      lastAccessedAt
    }
    recentTasks(limit: 10) {
      scenarioId
      modelId
      status
      error
      completedAt
    }
  }
  ${RUN_FRAGMENT}
`;

// ============================================================================
// QUERIES
// ============================================================================

export const RUNS_QUERY = gql`
  query Runs($definitionId: String, $status: String, $limit: Int, $offset: Int) {
    runs(definitionId: $definitionId, status: $status, limit: $limit, offset: $offset) {
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
