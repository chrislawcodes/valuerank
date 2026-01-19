import { useQuery } from 'urql';
import {
  ESTIMATE_COST_QUERY,
  type CostEstimate,
  type EstimateCostQueryResult,
  type EstimateCostInput,
} from '../api/operations/costs';

type UseCostEstimateOptions = EstimateCostInput & {
  pause?: boolean;
};

type UseCostEstimateResult = {
  costEstimate: CostEstimate | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * Hook to fetch cost estimate for a run.
 *
 * @param options.definitionId - Definition to estimate cost for
 * @param options.models - Model IDs to include in estimate
 * @param options.samplePercentage - Optional sample percentage (default 100)
 * @param options.pause - Pause the query
 */
export function useCostEstimate(options: UseCostEstimateOptions): UseCostEstimateResult {
  const { definitionId, models, samplePercentage = 100, samplesPerScenario = 1, pause = false } = options;

  // Pause if no models selected
  const shouldPause = pause || models.length === 0;

  const [result, reexecuteQuery] = useQuery<EstimateCostQueryResult>({
    query: ESTIMATE_COST_QUERY,
    variables: {
      definitionId,
      models,
      samplePercentage,
      samplesPerScenario,
    },
    pause: shouldPause,
    requestPolicy: 'cache-and-network',
  });

  return {
    costEstimate: result.data?.estimateCost ?? null,
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: () => reexecuteQuery({ requestPolicy: 'network-only' }),
  };
}
