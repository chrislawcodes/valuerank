import { useQuery, useMutation } from 'urql';
import { useCallback, useEffect, useRef } from 'react';
import {
  ANALYSIS_QUERY,
  RECOMPUTE_ANALYSIS_MUTATION,
  type AnalysisResult,
  type AnalysisQueryVariables,
  type AnalysisQueryResult,
  type RecomputeAnalysisMutationVariables,
  type RecomputeAnalysisMutationResult,
} from '../api/operations/analysis';

type UseAnalysisOptions = {
  runId: string;
  pause?: boolean;
  /** Enable polling when analysis status is pending/computing. Polls every 3 seconds. */
  enablePolling?: boolean;
  /** Analysis status from run query - used to determine if polling is needed */
  analysisStatus?: string | null;
};

type UseAnalysisResult = {
  analysis: AnalysisResult | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  recompute: () => Promise<void>;
  recomputing: boolean;
};

/**
 * Check if analysis is still pending or computing.
 */
function isAnalysisPending(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'computing';
}

/**
 * Hook to fetch analysis results for a run.
 *
 * @param options.runId - Run ID to fetch analysis for
 * @param options.pause - Pause the query
 * @param options.enablePolling - Enable 3-second polling when analysis is pending/computing
 * @param options.analysisStatus - Analysis status from run (used to determine polling)
 */
export function useAnalysis({
  runId,
  pause = false,
  enablePolling = true,
  analysisStatus,
}: UseAnalysisOptions): UseAnalysisResult {
  const [result, reexecuteQuery] = useQuery<AnalysisQueryResult, AnalysisQueryVariables>({
    query: ANALYSIS_QUERY,
    variables: { runId },
    pause,
    requestPolicy: 'cache-and-network',
  });

  const [recomputeResult, executeRecompute] = useMutation<
    RecomputeAnalysisMutationResult,
    RecomputeAnalysisMutationVariables
  >(RECOMPUTE_ANALYSIS_MUTATION);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const analysis = result.data?.analysis ?? null;

  // Determine if we should poll:
  // - analysisStatus is pending/computing (from run query)
  // - OR we have no analysis yet and the run might be processing
  const shouldPoll = isAnalysisPending(analysisStatus);

  // Set up polling for pending/computing analysis
  useEffect(() => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Start polling if enabled and analysis is pending
    if (enablePolling && shouldPoll && !pause) {
      pollIntervalRef.current = setInterval(() => {
        reexecuteQuery({ requestPolicy: 'network-only' });
      }, 3000); // Poll every 3 seconds
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [enablePolling, shouldPoll, pause, reexecuteQuery]);

  const refetch = useCallback(() => {
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery]);

  const recompute = useCallback(async () => {
    await executeRecompute({ runId });
    // Refetch after recompute
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [runId, executeRecompute, reexecuteQuery]);

  return {
    analysis,
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch,
    recompute,
    recomputing: recomputeResult.fetching,
  };
}
