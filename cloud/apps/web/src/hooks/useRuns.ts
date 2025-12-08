import { useQuery } from 'urql';
import {
  RUNS_QUERY,
  type Run,
  type RunsQueryVariables,
  type RunsQueryResult,
} from '../api/operations/runs';

type UseRunsOptions = {
  definitionId?: string;
  status?: string;
  limit?: number;
  offset?: number;
  pause?: boolean;
};

type UseRunsResult = {
  runs: Run[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * Hook to fetch list of runs with optional filtering.
 */
export function useRuns(options: UseRunsOptions = {}): UseRunsResult {
  const { definitionId, status, limit = 20, offset = 0, pause = false } = options;

  const variables: RunsQueryVariables = {
    definitionId: definitionId || undefined,
    status: status || undefined,
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
