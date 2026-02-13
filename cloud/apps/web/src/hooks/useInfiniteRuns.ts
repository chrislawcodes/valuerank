/**
 * useInfiniteRuns Hook
 *
 * Hook for infinite scrolling through runs.
 * Wraps the generic useInfiniteQuery with run-specific configuration.
 */

import { useMemo, useCallback } from 'react';
import {
  RUNS_QUERY,
  type Run,
  type RunsQueryVariables,
  type RunsQueryResult,
} from '../api/operations/runs';
import { useInfiniteQuery, type UseInfiniteQueryResult } from './useInfiniteQuery';
import { isNonSurveyRun, isSurveyRun } from '../lib/runClassification';

type UseInfiniteRunsOptions = {
  definitionId?: string;
  experimentId?: string;
  status?: string;
  runType?: 'nonSurvey' | 'survey' | 'all';
  pageSize?: number;
  pause?: boolean;
};

type UseInfiniteRunsResult = UseInfiniteQueryResult<Run> & {
  /** Alias for items to match previous API */
  runs: Run[];
};

/**
 * Hook for infinite scrolling through runs.
 * Loads pages incrementally and concatenates results.
 */
export function useInfiniteRuns(options: UseInfiniteRunsOptions = {}): UseInfiniteRunsResult {
  const {
    definitionId,
    experimentId,
    status,
    runType = 'nonSurvey',
    pageSize,
    pause = false,
  } = options;

  // Build filters object
  const filters = useMemo(
    () => ({
      definitionId: definitionId || undefined,
      experimentId: experimentId || undefined,
      status: status || undefined,
    }),
    [definitionId, experimentId, status]
  );

  // Count query filters
  const countFilters = useMemo(
    () => ({
      definitionId: definitionId || undefined,
      experimentId: experimentId || undefined,
      status: status || undefined,
    }),
    [definitionId, experimentId, status]
  );

  // Extract runs from query result
  const getItems = useCallback(
    (data: RunsQueryResult) => data.runs ?? [],
    []
  );

  const result = useInfiniteQuery<RunsQueryResult, RunsQueryVariables, Run>({
    query: RUNS_QUERY,
    filters,
    getItems,
    countFilters,
    pageSize,
    pause,
  });

  const filteredRuns = useMemo(() => {
    if (runType === 'survey') {
      return result.items.filter(isSurveyRun);
    }
    if (runType === 'all') {
      return result.items;
    }
    return result.items.filter(isNonSurveyRun);
  }, [result.items, runType]);

  return {
    ...result,
    items: filteredRuns,
    runs: filteredRuns,
  };
}
