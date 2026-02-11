import { useQuery } from 'urql';
import {
  RUN_CONDITION_GRID_QUERY,
  type RunConditionGrid,
  type RunConditionGridQueryResult,
  type RunConditionGridQueryVariables,
} from '../api/operations/scenarios';

type UseRunConditionGridOptions = {
  definitionId: string;
  pause?: boolean;
};

type UseRunConditionGridResult = {
  grid: RunConditionGrid | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useRunConditionGrid(options: UseRunConditionGridOptions): UseRunConditionGridResult {
  const { definitionId, pause = false } = options;
  const [result, reexecuteQuery] = useQuery<RunConditionGridQueryResult, RunConditionGridQueryVariables>({
    query: RUN_CONDITION_GRID_QUERY,
    variables: { definitionId },
    pause: pause || !definitionId,
    requestPolicy: 'cache-and-network',
  });

  return {
    grid: result.data?.runConditionGrid ?? null,
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: () => reexecuteQuery({ requestPolicy: 'network-only' }),
  };
}
