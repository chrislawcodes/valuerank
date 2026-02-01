import { useQuery } from 'urql';
import { useEffect, useRef } from 'react';
import {
  RUN_QUERY,
  type Run,
  type RunQueryVariables,
  type RunQueryResult,
} from '../api/operations/runs';

type UseRunOptions = {
  id: string;
  pause?: boolean;
  /** Enable polling when run is active. Polls every 5 seconds. */
  enablePolling?: boolean;
};

type UseRunResult = {
  run: Run | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * Check if a run is in an active (non-terminal) state.
 * Includes SUMMARIZING since it's still processing and should continue polling.
 */
function isActiveRun(status: string | undefined): boolean {
  return status === 'PENDING' || status === 'RUNNING' || status === 'SUMMARIZING';
}

/**
 * Hook to fetch a single run with optional polling for active runs.
 *
 * @param options.id - Run ID to fetch
 * @param options.pause - Pause the query
 * @param options.enablePolling - Enable 5-second polling when run is active
 */
export function useRun({ id, pause = false, enablePolling = true }: UseRunOptions): UseRunResult {
  const [result, reexecuteQuery] = useQuery<RunQueryResult, RunQueryVariables>({
    query: RUN_QUERY,
    variables: { id },
    pause,
    requestPolicy: 'cache-and-network',
  });

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const run = result.data?.run ?? null;
  const isActive = isActiveRun(run?.status);

  // Set up polling for active runs
  useEffect(() => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Start polling if enabled and run is active
    if (enablePolling && isActive && !pause) {
      pollIntervalRef.current = setInterval(() => {
        reexecuteQuery({ requestPolicy: 'network-only' });
      }, 5000); // Poll every 5 seconds
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [enablePolling, isActive, pause, reexecuteQuery]);

  return {
    run,
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: () => reexecuteQuery({ requestPolicy: 'network-only' }),
  };
}
