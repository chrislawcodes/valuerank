import { useQuery } from 'urql';
import {
  SYSTEM_HEALTH_QUERY,
  type SystemHealth,
  type SystemHealthQueryResult,
  type SystemHealthQueryVariables,
} from '../api/operations/health';

type UseSystemHealthOptions = {
  pause?: boolean;
  pollInterval?: number;
};

type UseSystemHealthResult = {
  health: SystemHealth | null;
  loading: boolean;
  error: Error | null;
  refetch: (forceRefresh?: boolean) => void;
};

/**
 * Hook to fetch combined system health status.
 *
 * Returns provider health, queue health, and worker health in a single query.
 *
 * @param options.pause - Pause the query
 * @param options.pollInterval - Poll interval in ms (optional, for auto-refresh)
 */
export function useSystemHealth(options: UseSystemHealthOptions = {}): UseSystemHealthResult {
  const { pause = false, pollInterval } = options;

  const [result, reexecuteQuery] = useQuery<SystemHealthQueryResult, SystemHealthQueryVariables>({
    query: SYSTEM_HEALTH_QUERY,
    variables: { refresh: false },
    pause,
    requestPolicy: 'cache-and-network',
    ...(pollInterval ? { pollInterval } : {}),
  });

  return {
    health: result.data?.systemHealth ?? null,
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: (forceRefresh = true) =>
      reexecuteQuery({
        requestPolicy: 'network-only',
        variables: { refresh: forceRefresh },
      }),
  };
}
