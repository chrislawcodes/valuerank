import { useQuery } from 'urql';
import {
  AVAILABLE_MODELS_QUERY,
  type AvailableModel,
  type AvailableModelsQueryResult,
} from '../api/operations/models';

type UseAvailableModelsOptions = {
  pause?: boolean;
  onlyAvailable?: boolean;
};

type UseAvailableModelsResult = {
  models: AvailableModel[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * Hook to fetch available LLM models.
 *
 * @param options.pause - Pause the query
 * @param options.onlyAvailable - Filter to only models with configured API keys
 */
export function useAvailableModels(options: UseAvailableModelsOptions = {}): UseAvailableModelsResult {
  const { pause = false, onlyAvailable = false } = options;

  const [result, reexecuteQuery] = useQuery<AvailableModelsQueryResult>({
    query: AVAILABLE_MODELS_QUERY,
    pause,
    requestPolicy: 'cache-first',
  });

  let models = result.data?.availableModels ?? [];

  // Filter to only available models if requested
  if (onlyAvailable) {
    models = models.filter((m) => m.isAvailable);
  }

  return {
    models,
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: () => reexecuteQuery({ requestPolicy: 'network-only' }),
  };
}
