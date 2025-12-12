import { useQuery } from 'urql';
import {
  RUNS_QUERY,
  type Run,
  type RunsQueryVariables,
  type RunsQueryResult,
} from '../api/operations/runs';

type UseRunsWithAnalysisOptions = {
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
  definitionId?: string;
  limit?: number;
  offset?: number;
  pause?: boolean;
};

type UseRunsWithAnalysisResult = {
  runs: Run[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * Hook to fetch runs that have analysis results.
 * Wraps useRuns with hasAnalysis:true filter by default.
 *
 * @param options.analysisStatus - Filter by analysis status (CURRENT or SUPERSEDED)
 * @param options.definitionId - Filter by definition ID
 * @param options.limit - Maximum number of results (default: 20)
 * @param options.offset - Pagination offset (default: 0)
 * @param options.pause - Pause the query
 */
export function useRunsWithAnalysis(options: UseRunsWithAnalysisOptions = {}): UseRunsWithAnalysisResult {
  const { analysisStatus, definitionId, limit = 20, offset = 0, pause = false } = options;

  const variables: RunsQueryVariables = {
    hasAnalysis: true,
    analysisStatus: analysisStatus || undefined,
    definitionId: definitionId || undefined,
    limit,
    offset,
  };

  const [result, reexecuteQuery] = useQuery<RunsQueryResult, RunsQueryVariables>({
    query: RUNS_QUERY,
    variables,
    pause,
    requestPolicy: 'cache-and-network',
  });

  return {
    runs: result.data?.runs ?? [],
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: () => reexecuteQuery({ requestPolicy: 'network-only' }),
  };
}
