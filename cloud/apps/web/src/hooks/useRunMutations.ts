import { useMutation } from 'urql';
import { useCallback } from 'react';
import {
  START_RUN_MUTATION,
  PAUSE_RUN_MUTATION,
  RESUME_RUN_MUTATION,
  CANCEL_RUN_MUTATION,
  type Run,
  type StartRunInput,
  type StartRunMutationVariables,
  type StartRunMutationResult,
  type PauseRunMutationVariables,
  type PauseRunMutationResult,
  type ResumeRunMutationVariables,
  type ResumeRunMutationResult,
  type CancelRunMutationVariables,
  type CancelRunMutationResult,
} from '../api/operations/runs';

type StartRunResult = {
  run: Run;
  jobCount: number;
};

type UseRunMutationsResult = {
  startRun: (input: StartRunInput) => Promise<StartRunResult>;
  pauseRun: (runId: string) => Promise<Run>;
  resumeRun: (runId: string) => Promise<Run>;
  cancelRun: (runId: string) => Promise<Run>;
  loading: boolean;
  error: Error | null;
};

/**
 * Hook for run mutations: start, pause, resume, cancel.
 */
export function useRunMutations(): UseRunMutationsResult {
  const [startRunResult, executeStartRun] = useMutation<
    StartRunMutationResult,
    StartRunMutationVariables
  >(START_RUN_MUTATION);

  const [pauseRunResult, executePauseRun] = useMutation<
    PauseRunMutationResult,
    PauseRunMutationVariables
  >(PAUSE_RUN_MUTATION);

  const [resumeRunResult, executeResumeRun] = useMutation<
    ResumeRunMutationResult,
    ResumeRunMutationVariables
  >(RESUME_RUN_MUTATION);

  const [cancelRunResult, executeCancelRun] = useMutation<
    CancelRunMutationResult,
    CancelRunMutationVariables
  >(CANCEL_RUN_MUTATION);

  const startRun = useCallback(
    async (input: StartRunInput): Promise<StartRunResult> => {
      const result = await executeStartRun({ input });
      if (result.error) {
        throw new Error(result.error.message);
      }
      if (!result.data?.startRun) {
        throw new Error('Failed to start run');
      }
      return result.data.startRun;
    },
    [executeStartRun]
  );

  const pauseRun = useCallback(
    async (runId: string): Promise<Run> => {
      const result = await executePauseRun({ runId });
      if (result.error) {
        throw new Error(result.error.message);
      }
      if (!result.data?.pauseRun) {
        throw new Error('Failed to pause run');
      }
      return result.data.pauseRun;
    },
    [executePauseRun]
  );

  const resumeRun = useCallback(
    async (runId: string): Promise<Run> => {
      const result = await executeResumeRun({ runId });
      if (result.error) {
        throw new Error(result.error.message);
      }
      if (!result.data?.resumeRun) {
        throw new Error('Failed to resume run');
      }
      return result.data.resumeRun;
    },
    [executeResumeRun]
  );

  const cancelRun = useCallback(
    async (runId: string): Promise<Run> => {
      const result = await executeCancelRun({ runId });
      if (result.error) {
        throw new Error(result.error.message);
      }
      if (!result.data?.cancelRun) {
        throw new Error('Failed to cancel run');
      }
      return result.data.cancelRun;
    },
    [executeCancelRun]
  );

  // Combine loading and error states
  const loading =
    startRunResult.fetching ||
    pauseRunResult.fetching ||
    resumeRunResult.fetching ||
    cancelRunResult.fetching;

  const error =
    startRunResult.error ||
    pauseRunResult.error ||
    resumeRunResult.error ||
    cancelRunResult.error;

  return {
    startRun,
    pauseRun,
    resumeRun,
    cancelRun,
    loading,
    error: error ? new Error(error.message) : null,
  };
}
