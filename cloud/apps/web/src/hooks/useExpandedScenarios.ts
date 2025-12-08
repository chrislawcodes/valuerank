import { useQuery } from 'urql';
import {
  SCENARIOS_QUERY,
  SCENARIO_COUNT_QUERY,
  type Scenario,
  type ScenariosQueryResult,
  type ScenariosQueryVariables,
  type ScenarioCountQueryResult,
  type ScenarioCountQueryVariables,
} from '../api/operations/scenarios';

type UseExpandedScenariosOptions = {
  definitionId: string;
  limit?: number;
  offset?: number;
  pause?: boolean;
};

type UseExpandedScenariosResult = {
  scenarios: Scenario[];
  totalCount: number;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * Hook to fetch expanded scenarios for a definition.
 *
 * Returns scenarios from the database with their full content including
 * preamble, prompt, followups, and dimension values.
 *
 * @param options.definitionId - Definition ID to get scenarios for
 * @param options.limit - Maximum number of scenarios to fetch (default: 50)
 * @param options.offset - Offset for pagination (default: 0)
 * @param options.pause - Pause the query
 */
export function useExpandedScenarios(options: UseExpandedScenariosOptions): UseExpandedScenariosResult {
  const { definitionId, limit = 50, offset = 0, pause = false } = options;

  const [scenariosResult, reexecuteScenarios] = useQuery<ScenariosQueryResult, ScenariosQueryVariables>({
    query: SCENARIOS_QUERY,
    variables: { definitionId, limit, offset },
    pause: pause || !definitionId,
    requestPolicy: 'cache-and-network',
  });

  const [countResult] = useQuery<ScenarioCountQueryResult, ScenarioCountQueryVariables>({
    query: SCENARIO_COUNT_QUERY,
    variables: { definitionId },
    pause: pause || !definitionId,
    requestPolicy: 'cache-and-network',
  });

  return {
    scenarios: scenariosResult.data?.scenarios ?? [],
    totalCount: countResult.data?.scenarioCount ?? 0,
    loading: scenariosResult.fetching || countResult.fetching,
    error: scenariosResult.error
      ? new Error(scenariosResult.error.message)
      : countResult.error
        ? new Error(countResult.error.message)
        : null,
    refetch: () => reexecuteScenarios({ requestPolicy: 'network-only' }),
  };
}
