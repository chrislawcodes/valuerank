import { useQuery } from 'urql';
import {
  RUN_COUNT_QUERY,
  type RunCountQueryVariables,
  type RunCountQueryResult,
} from '../api/operations/runs';

type UseRunCountOptions = {
  definitionId?: string;
  status?: string;
  pause?: boolean;
};

type UseRunCountResult = {
  count: number | null;
  loading: boolean;
  error: Error | null;
};

/**
 * Hook to fetch the count of runs matching filters.
 * Useful for pagination UI (e.g., "Showing 1-10 of 247 runs").
 */
export function useRunCount(options: UseRunCountOptions = {}): UseRunCountResult {
  const { definitionId, status, pause = false } = options;

  const variables: RunCountQueryVariables = {
    definitionId: definitionId || undefined,
    status: status || undefined,
  };

  const [result] = useQuery<RunCountQueryResult, RunCountQueryVariables>({
    query: RUN_COUNT_QUERY,
    variables,
    pause,
    requestPolicy: 'cache-and-network',
  });

  return {
    count: result.data?.runCount ?? null,
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
  };
}
