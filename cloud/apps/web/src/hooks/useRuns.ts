import { useQuery } from 'urql';
import {
  RUNS_QUERY,
  type Run,
  type RunsQueryVariables,
  type RunsQueryResult,
} from '../api/operations/runs.js';
import { isNonSurveyRun } from '../lib/runClassification.js';

type UseRunsOptions = {
  definitionId?: string;
  hasAnalysis?: boolean;
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
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
  const {
    definitionId,
    status,
    limit = 20,
    offset = 0,
    pause = false,
    hasAnalysis,
    analysisStatus,
  } = options;

  const variables: RunsQueryVariables = {
    definitionId: definitionId ?? undefined,
    status: status ?? undefined,
    limit,
    offset,
    hasAnalysis: hasAnalysis ?? undefined,
    analysisStatus: analysisStatus ?? undefined,
  };

  const [result, reexecuteQuery] = useQuery<RunsQueryResult, RunsQueryVariables>({
    query: RUNS_QUERY,
    variables,
    pause,
    requestPolicy: 'cache-and-network',
  });

  const rawRuns = result.data?.runs ?? [];
  const runs = hasAnalysis === true ? rawRuns.filter(isNonSurveyRun) : rawRuns;

  return {
    runs,
    loading: result.fetching,
    error: result.error != null ? new Error(result.error.message) : null,
    refetch: () => reexecuteQuery({ requestPolicy: 'network-only' }),
  };
}
